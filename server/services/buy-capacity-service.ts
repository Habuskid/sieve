import { validateCheckInput } from "../security/validation";
import { defaultMarketService, MarketService } from "./market-service";
import { defaultPriceCheckService, PriceCheckService, activeChecksStore } from "./check-service";
import { defaultSolanaAdapter, SolanaAdapter, CANONICAL_MINTS } from "../solana/adapter";
import { getRepository } from "../database/db";
import type { ISieveRepository } from "../database/repository";
import {
  searchBoundaryCapacity,
  displayToRaw,
  rawToDisplay,
  isPositiveFinite,
  toDecimal,
  type BoundaryCapacityCandidate,
  type BoundaryCapacityStatus,
  type CandidateEvaluator,
} from "../../core";
import { SieveAppError } from "./errors";
import type {
  FundingAsset,
  PriceCheck,
} from "../../core/domain/types";

export interface BuyCapacityRequest {
  targetMint: string;
  fundingAsset: FundingAsset;
  amount: string;
  maxPremiumPct: string;
  wallet: string;
  clientIntentVersion: string;
}

export interface BuyCapacityCandidateDto {
  fundingAmount: string;
  fundingAmountRaw: string;
  effectiveBuyPriceUsd: string | null;
  expectedTargetAmount: string | null;
  withinBoundary: boolean;
  status: string;
}

export interface BuyCapacityResponseDto {
  side: "BUY";
  asset: {
    name: string;
    symbol: string;
    mint: string;
  };
  fundingAsset: FundingAsset;
  requestedAmount: string;
  requestedAmountRaw: string;
  referencePriceUsd: string;
  maxPremiumPct: string;
  maximumBuyPriceUsd: string;
  requestedCandidate: BuyCapacityCandidateDto;
  verifiedCapacity: BuyCapacityCandidateDto | null;
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

export class BuyCapacityService {
  constructor(
    private marketService: MarketService = defaultMarketService,
    private checkService: PriceCheckService = defaultPriceCheckService,
    private solanaAdapter: SolanaAdapter = defaultSolanaAdapter,
    private repo: ISieveRepository = getRepository()
  ) {}

  async executeCapacity(input: BuyCapacityRequest): Promise<BuyCapacityResponseDto> {
    validateCheckInput(input);
    // 1. Input validation
    if (!input.wallet || input.wallet.length < 32 || input.wallet.length > 44) {
      throw new SieveAppError(
        "WALLET_NOT_CONNECTED",
        "Valid Solana wallet address is required for capacity check"
      );
    }
    if (!isPositiveFinite(input.amount)) {
      throw new SieveAppError("PRICE_REFERENCE_INVALID", "Invalid funding amount");
    }
    if (!isPositiveFinite(input.maxPremiumPct) && toDecimal(input.maxPremiumPct).lessThan(0)) {
      throw new SieveAppError("PRICE_REFERENCE_INVALID", "Max premium percentage must be non-negative");
    }

    // 2. Coherent Reference & Token-2022 snapshot for this search
    const asset = await this.marketService.getMarketByMint(input.targetMint);
    if (!asset) {
      throw new SieveAppError(
        "PRICE_REFERENCE_INVALID",
        `Target mint ${input.targetMint} is not a recognized PreStocks asset`
      );
    }

    const targetMetadata = await this.solanaAdapter.resolveMintMetadata(asset.mint, "mainnet");
    if (!targetMetadata.supported) {
      throw new SieveAppError("ROUTE_RISK", targetMetadata.blockers?.join(", ") || "Asset not supported");
    }

    const decimals =
      input.fundingAsset === "USDC"
        ? CANONICAL_MINTS.mainnet.USDC_DECIMALS
        : CANONICAL_MINTS.mainnet.SOL_DECIMALS;

    const requestedAmountRaw = displayToRaw(input.amount, decimals);
    if (requestedAmountRaw <= 0n) {
      throw new SieveAppError("VALIDATION_ERROR", "Funding amount must be greater than zero");
    }

    const now = Date.now();
    const observedAt = new Date(now).toISOString();

    // 3. Task-local typed map: amountRaw -> exact evaluated Buy candidate snapshot
    const candidateSnapshots = new Map<
      bigint,
      {
        priceCheck: PriceCheck;
        expectedNetTargetAmount: string;
        isExecutable: boolean;
      }
    >();

    // 4. Injected evaluator for pure search engine
    const evaluator: CandidateEvaluator = async (
      candidateRaw: bigint
    ): Promise<BoundaryCapacityCandidate> => {
      const evaluated = await this.checkService.evaluateBuyCandidate({
        asset,
        targetMetadata,
        fundingAsset: input.fundingAsset,
        candidateRaw,
        maxPremiumPct: input.maxPremiumPct,
        clientIntentVersion: input.clientIntentVersion,
        wallet: input.wallet,
        now,
      });

      candidateSnapshots.set(candidateRaw, evaluated);

      return {
        amountRaw: candidateRaw,
        amountDisplay: evaluated.priceCheck.funding.inputDisplay,
        effectiveExecutionPrice: evaluated.priceCheck.decision.currentBuyPriceUsd,
        withinBoundary: evaluated.isExecutable,
      };
    };

    // 5. Execute pure bounded search
    const searchResult = await searchBoundaryCapacity({
      side: "BUY",
      requestedAmountRaw,
      requestedAmountDisplay: input.amount,
      evaluator,
      maxProbes: 10,
    });

    if (Date.now() - now >= 30_000 || Date.now() - Date.parse(asset.observedAt) >= 60_000) throw new SieveAppError("QUOTE_EXPIRED");
    // 6. Server authority & persistence:
    // Persist ONLY the final verified candidate (or none if NO_VERIFIED_CAPACITY).
    // Exploratory or lower passing candidates are ephemeral and never persisted.
    let finalCheck: PriceCheck | null = null;

    if (searchResult.status === "FULLY_WITHIN_BOUNDARY") {
      finalCheck = candidateSnapshots.get(requestedAmountRaw)!.priceCheck;
      await this.repo.savePriceCheck(finalCheck);
    } else if (searchResult.status === "PARTIALLY_WITHIN_BOUNDARY") {
      const passAmount = searchResult.verifiedCapacityCandidate!.amountRaw;
      finalCheck = candidateSnapshots.get(passAmount)!.priceCheck;
      await this.repo.savePriceCheck(finalCheck);
    }

    // 7. Assemble response DTO
    const reqSnapshot = candidateSnapshots.get(requestedAmountRaw)!;
    const requestedCandidateDto: BuyCapacityCandidateDto = {
      fundingAmount: reqSnapshot.priceCheck.funding.inputDisplay,
      fundingAmountRaw: requestedAmountRaw.toString(),
      effectiveBuyPriceUsd: reqSnapshot.priceCheck.decision.currentBuyPriceUsd,
      expectedTargetAmount: reqSnapshot.expectedNetTargetAmount,
      withinBoundary: reqSnapshot.isExecutable,
      status: reqSnapshot.priceCheck.decision.status,
    };

    let verifiedCapacityDto: BuyCapacityCandidateDto | null = null;
    if (finalCheck !== null) {
      const finalSnapshot = candidateSnapshots.get(finalCheck.funding.inputRaw)!;
      verifiedCapacityDto = {
        fundingAmount: finalCheck.funding.inputDisplay,
        fundingAmountRaw: finalCheck.funding.inputRaw.toString(),
        effectiveBuyPriceUsd: finalCheck.decision.currentBuyPriceUsd,
        expectedTargetAmount: finalSnapshot.expectedNetTargetAmount,
        withinBoundary: finalSnapshot.isExecutable,
        status: finalCheck.decision.status,
      };
    }

    return {
      side: "BUY",
      asset: {
        name: asset.name,
        symbol: asset.symbol,
        mint: asset.mint,
      },
      fundingAsset: input.fundingAsset,
      requestedAmount: input.amount,
      requestedAmountRaw: requestedAmountRaw.toString(),
      referencePriceUsd: asset.referencePriceUsd,
      maxPremiumPct: input.maxPremiumPct,
      maximumBuyPriceUsd: reqSnapshot.priceCheck.decision.maximumBuyPriceUsd,
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
            ? `Full order of ${input.amount} ${input.fundingAsset} is verified within your configured boundary.`
            : searchResult.status === "PARTIALLY_WITHIN_BOUNDARY"
            ? `${verifiedCapacityDto?.fundingAmount} ${input.fundingAsset} of the requested amount is currently verified within your configured boundary.`
            : `No amount within your requested order was verified within your configured boundary.`,
      },
    };
  }
}

export const defaultBuyCapacityService = new BuyCapacityService();
