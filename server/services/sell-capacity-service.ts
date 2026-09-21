import { defaultMarketService, MarketService } from "./market-service";
import {
  defaultSellCheckService,
  SellCheckService,
  type EvaluateSellCandidateResult,
} from "./sell-check-service";
import { defaultSolanaAdapter, SolanaAdapter } from "../solana/adapter";
import { getRepository } from "../database/db";
import type { ISellRepository } from "../database/repository";
import {
  searchBoundaryCapacity,
  isPositiveFinite,
  toDecimal,
  economicSellAmountToRaw,
  type BoundaryCapacityCandidate,
  type BoundaryCapacityStatus,
  type CandidateEvaluator,
} from "../../core";
import { SieveAppError } from "./errors";
import type { SellPriceCheck } from "../../core/domain/sell-types";

export interface SellCapacityRequest {
  targetMint: string;
  amount: string; // Requested economic PreStock amount (e.g. "1")
  maxDiscountPct: string;
  wallet: string;
  clientIntentVersion: string;
  maxProbes?: number;
}

export interface SellCapacityCandidateDto {
  economicAmount: string;
  rawWalletInput: string;
  effectiveSellPriceUsd: string | null;
  expectedUsdcProceeds: string | null;
  withinBoundary: boolean;
  status: string;
}

export interface SellCapacityResponseDto {
  side: "SELL";
  asset: {
    name: string;
    symbol: string;
    mint: string;
  };
  outputAsset: "USDC";
  requestedAmount: string;
  requestedAmountRaw: string;
  referencePriceUsd: string;
  maxDiscountPct: string;
  minimumSellPriceUsd: string;
  requestedCandidate: SellCapacityCandidateDto;
  verifiedCapacity: SellCapacityCandidateDto | null;
  checkId: string | null;
  status: BoundaryCapacityStatus;
  probeCount: number;
  observedAt: string;
  expiresAt: string | null;
  display: {
    title: string;
    message: string;
  };
}

export class SellCapacityService {
  constructor(
    private marketService: MarketService = defaultMarketService,
    private checkService: SellCheckService = defaultSellCheckService,
    private solanaAdapter: SolanaAdapter = defaultSolanaAdapter,
    private repo: ISellRepository = getRepository()
  ) {}

  async executeCapacity(input: SellCapacityRequest): Promise<SellCapacityResponseDto> {
    // 1. Input validation
    if (!input.wallet || input.wallet.length < 32 || input.wallet.length > 44) {
      throw new SieveAppError(
        "WALLET_NOT_CONNECTED",
        "Valid Solana wallet address is required for capacity check"
      );
    }
    if (!isPositiveFinite(input.amount)) {
      throw new SieveAppError("VALIDATION_ERROR", "Sell amount must be positive");
    }
    const discount = toDecimal(input.maxDiscountPct);
    if (discount.lessThan(0) || discount.greaterThanOrEqualTo(100)) {
      throw new SieveAppError(
        "VALIDATION_ERROR",
        "Maximum discount must be between 0 and less than 100"
      );
    }
    if (input.maxProbes !== undefined) {
      if (!Number.isInteger(input.maxProbes) || input.maxProbes <= 0 || input.maxProbes > 10) {
        throw new SieveAppError(
          "VALIDATION_ERROR",
          "maxProbes must be an integer between 1 and 10"
        );
      }
    }

    // 2. Coherent Reference & Token-2022 snapshot for this search
    const asset = await this.marketService.getMarketByMint(input.targetMint, { bypassCache: true });
    if (!asset) {
      throw new SieveAppError("PRICE_REFERENCE_INVALID", "Target is not a current PreStocks asset");
    }

    const metadata = await this.solanaAdapter.resolveMintMetadata(asset.mint, "mainnet", {
      bypassCache: true,
    });
    if (!metadata.supported) {
      throw new SieveAppError("ROUTE_RISK", metadata.blockers.join("; "));
    }

    // Check future multiplier transition
    if (metadata.scaledUiAmount?.newMultiplierEffectiveTimestamp != null) {
      const effectiveAt = metadata.scaledUiAmount.newMultiplierEffectiveTimestamp;
      const chainTime = metadata.chainTimestamp;
      if (chainTime == null || (effectiveAt > chainTime && effectiveAt <= chainTime + 120)) {
        throw new SieveAppError(
          "ROUTE_RISK",
          "Scaled UI multiplier transition prevents safe Sell build"
        );
      }
    }

    const requestedAmountRaw = economicSellAmountToRaw(
      input.amount,
      metadata.decimals,
      metadata.scaledUiAmount?.activeMultiplier
    );

    const now = Date.now();
    const observedAt = new Date(now).toISOString();

    // 3. Task-local typed map: amountRaw -> exact evaluated Sell candidate snapshot
    const candidateSnapshots = new Map<bigint, EvaluateSellCandidateResult>();

    // 4. Injected evaluator for pure search engine
    const evaluator: CandidateEvaluator = async (
      candidateRaw: bigint
    ): Promise<BoundaryCapacityCandidate> => {
      const evaluated = await this.checkService.evaluateSellCandidate({
        asset,
        metadata,
        candidateRaw,
        maxDiscountPct: input.maxDiscountPct,
        clientIntentVersion: input.clientIntentVersion,
        wallet: input.wallet,
        now,
        requestedEconomicAmount: candidateRaw === requestedAmountRaw ? input.amount : undefined,
      });

      candidateSnapshots.set(candidateRaw, evaluated);

      return {
        amountRaw: candidateRaw,
        amountDisplay: evaluated.conversion.actualEconomicAmount,
        effectiveExecutionPrice: evaluated.decision.currentSellPriceUsd,
        withinBoundary: evaluated.isExecutable,
      };
    };

    // 5. Execute pure bounded search
    const searchResult = await searchBoundaryCapacity({
      side: "SELL",
      requestedAmountRaw,
      requestedAmountDisplay: input.amount,
      evaluator,
      maxProbes: input.maxProbes ?? 10,
    });

    // 6. Server authority & persistence:
    // Persist ONLY the final verified candidate (or none if NO_VERIFIED_CAPACITY).
    // Exploratory or lower passing candidates are ephemeral and never persisted.
    let finalCheck: SellPriceCheck | null = null;

    if (searchResult.status === "FULLY_WITHIN_BOUNDARY") {
      finalCheck = candidateSnapshots.get(requestedAmountRaw)!.check;
      await this.repo.saveSellPriceCheck(finalCheck);
    } else if (searchResult.status === "PARTIALLY_WITHIN_BOUNDARY") {
      const passAmount = searchResult.verifiedCapacityCandidate!.amountRaw;
      finalCheck = candidateSnapshots.get(passAmount)!.check;
      await this.repo.saveSellPriceCheck(finalCheck);
    }

    // 7. Assemble response DTO
    const reqSnapshot = candidateSnapshots.get(requestedAmountRaw)!;
    const requestedCandidateDto: SellCapacityCandidateDto = {
      economicAmount: reqSnapshot.conversion.actualEconomicAmount,
      rawWalletInput: requestedAmountRaw.toString(),
      effectiveSellPriceUsd: reqSnapshot.decision.currentSellPriceUsd,
      expectedUsdcProceeds: reqSnapshot.proceeds,
      withinBoundary: reqSnapshot.isExecutable,
      status: reqSnapshot.decision.status,
    };

    let verifiedCapacityDto: SellCapacityCandidateDto | null = null;
    if (finalCheck !== null) {
      const finalSnapshot = candidateSnapshots.get(finalCheck.input.rawWalletInput)!;
      verifiedCapacityDto = {
        economicAmount: finalCheck.input.actualEconomicAmount,
        rawWalletInput: finalCheck.input.rawWalletInput.toString(),
        effectiveSellPriceUsd: finalCheck.decision.currentSellPriceUsd,
        expectedUsdcProceeds: finalCheck.expectedUsdcProceeds,
        withinBoundary: finalSnapshot.isExecutable,
        status: finalCheck.decision.status,
      };
    }

    return {
      side: "SELL",
      asset: {
        name: asset.name,
        symbol: asset.symbol,
        mint: asset.mint,
      },
      outputAsset: "USDC",
      requestedAmount: input.amount,
      requestedAmountRaw: requestedAmountRaw.toString(),
      referencePriceUsd: asset.referencePriceUsd,
      maxDiscountPct: input.maxDiscountPct,
      minimumSellPriceUsd: reqSnapshot.decision.minimumSellPriceUsd,
      requestedCandidate: requestedCandidateDto,
      verifiedCapacity: verifiedCapacityDto,
      checkId: finalCheck ? finalCheck.id : null,
      status: searchResult.status,
      probeCount: searchResult.probeCount,
      observedAt,
      expiresAt: finalCheck ? finalCheck.expiresAt : null,
      display: {
        title:
          searchResult.status === "FULLY_WITHIN_BOUNDARY"
            ? "Requested amount is executable within boundary"
            : searchResult.status === "PARTIALLY_WITHIN_BOUNDARY"
            ? "Partial capacity verified within boundary"
            : "No verified capacity within boundary",
        message:
          searchResult.status === "FULLY_WITHIN_BOUNDARY"
            ? `Full order of ${input.amount} ${asset.symbol} is verified within your configured boundary.`
            : searchResult.status === "PARTIALLY_WITHIN_BOUNDARY"
            ? `${verifiedCapacityDto?.economicAmount} ${asset.symbol} of the requested amount is currently verified within your configured boundary.`
            : `No amount within your requested order was verified within your configured boundary.`,
      },
    };
  }
}

export const defaultSellCapacityService = new SellCapacityService();
