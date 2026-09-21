import { v4 as uuidv4 } from "uuid";
import { defaultMarketService, MarketService } from "./market-service";
import { defaultJupiterAdapter, JupiterAdapter } from "../jupiter/adapter";
import { defaultSolanaAdapter, SolanaAdapter, CANONICAL_MINTS, calculateNetOutput } from "../solana/adapter";
import { getRepository } from "../database/db";
import type { ISieveRepository } from "../database/repository";
import {
  evaluatePriceBoundary,
  DEFAULT_CHECK_EXPIRY_MS,
} from "../../core";
import { displayToRaw, rawToDisplay, rawToEconomicDisplay, isPositiveFinite, toDecimal } from "../../core/money/decimal";
import { SieveAppError } from "./errors";
import type {
  MainnetNetwork,
  FundingAsset,
  PriceCheck,
  FundingValuation,
  MarketQuote,
  IssuerControls,
} from "../../core/domain/types";

export interface CheckRequestInput {
  targetMint: string;
  fundingAsset: FundingAsset;
  amount: string;
  maxPremiumPct: string;
  wallet?: string | null;
  clientIntentVersion: string;
}

export interface CheckResponseDto {
  checkId: string;
  clientIntentVersion: string;
  network: MainnetNetwork;
  sourceLabel: string;
  asset: {
    name: string;
    symbol: string;
    mint: string;
  };
  funding: {
    asset: FundingAsset;
    amount: string;
    usdValue: string;
  };
  price: {
    referenceUsd: string;
    currentBuyUsd: string | null;
    maxBuyUsd: string;
    premiumPct: string | null;
  };
  expected: {
    targetAmount: string | null;
    priceImpactPct: string | null;
  };
  decision: string;
  observedAt: string;
  expiresAt: string | null;
  display: {
    title: string;
    message: string;
  };
  warnings?: string[];
  issuerControls?: IssuerControls;
  activeMultiplier?: string;
}

// In-memory cache for checks (backed by DB in persistence phase)
const globalForChecks = globalThis as unknown as {
  sieveActiveChecks?: Map<string, PriceCheck>;
};
export const activeChecksStore =
  globalForChecks.sieveActiveChecks ??
  (globalForChecks.sieveActiveChecks = new Map<string, PriceCheck>());

export class PriceCheckService {
  constructor(
    private marketService: MarketService = defaultMarketService,
    private jupiterAdapter: JupiterAdapter = defaultJupiterAdapter,
    private solanaAdapter: SolanaAdapter = defaultSolanaAdapter,
    private repo: ISieveRepository = getRepository()
  ) {}

  async executeCheck(input: CheckRequestInput): Promise<CheckResponseDto> {
    // 1. Input validation
    if (!isPositiveFinite(input.amount)) {
      throw new SieveAppError("PRICE_REFERENCE_INVALID", "Invalid funding amount");
    }
    if (!isPositiveFinite(input.maxPremiumPct) && toDecimal(input.maxPremiumPct).lessThan(0)) {
      throw new SieveAppError("PRICE_REFERENCE_INVALID", "Max premium percentage must be non-negative");
    }

    // 2. Resolve target market asset
    const asset = await this.marketService.getMarketByMint(input.targetMint);
    if (!asset) {
      throw new SieveAppError(
        "PRICE_REFERENCE_INVALID",
        `Target mint ${input.targetMint} is not a recognized PreStocks asset`
      );
    }

    const now = Date.now();
    const targetMetadata = await this.solanaAdapter.resolveMintMetadata(asset.mint, "mainnet");
    if (!targetMetadata.supported) {
      throw new SieveAppError("ROUTE_RISK", targetMetadata.blockers?.join(", ") || "Asset not supported");
    }

    const candidateRaw =
      input.fundingAsset === "USDC"
        ? displayToRaw(input.amount, CANONICAL_MINTS.mainnet.USDC_DECIMALS)
        : displayToRaw(input.amount, CANONICAL_MINTS.mainnet.SOL_DECIMALS);

    const evaluated = await this.evaluateBuyCandidate({
      asset,
      targetMetadata,
      fundingAsset: input.fundingAsset,
      candidateRaw,
      maxPremiumPct: input.maxPremiumPct,
      clientIntentVersion: input.clientIntentVersion,
      wallet: input.wallet,
      now,
    });

    const priceCheck = evaluated.priceCheck;
    activeChecksStore.set(priceCheck.id, priceCheck);
    await this.repo.savePriceCheck(priceCheck);

    return this.toDto(priceCheck, targetMetadata);
  }

  async evaluateBuyCandidate(input: {
    asset: import("../../core/domain/types").MarketAsset;
    targetMetadata: import("../solana/adapter").ValidatedMintMetadata;
    fundingAsset: FundingAsset;
    candidateRaw: bigint;
    maxPremiumPct: string;
    clientIntentVersion: string;
    wallet?: string | null;
    now?: number;
  }): Promise<{
    priceCheck: PriceCheck;
    expectedNetTargetAmount: string;
    isExecutable: boolean;
  }> {
    const {
      asset,
      targetMetadata,
      fundingAsset,
      candidateRaw,
      maxPremiumPct,
      clientIntentVersion,
      wallet,
    } = input;

    const now = input.now ?? Date.now();
    const observedAt = new Date(now).toISOString();
    const targetDecimals = targetMetadata.decimals;
    const activeMultiplier = targetMetadata.scaledUiAmount?.activeMultiplier ?? "1";

    let fundingValuation: FundingValuation;
    let quote: MarketQuote;

    if (fundingAsset === "USDC") {
      const inputMint = CANONICAL_MINTS.mainnet.USDC;
      const inputDisplay = rawToDisplay(candidateRaw, CANONICAL_MINTS.mainnet.USDC_DECIMALS).toString();
      const inputUsdValue = inputDisplay;

      fundingValuation = {
        fundingAsset: "USDC",
        inputRaw: candidateRaw,
        inputDisplay,
        inputUsdValue,
        method: "USDC_PAR",
        observedAt,
      };

      const jupQuote = await this.jupiterAdapter.getQuote({
        inputMint,
        outputMint: asset.mint,
        amount: candidateRaw,
        outputDecimals: targetDecimals,
      });

      const netOutputRaw = calculateNetOutput(
        jupQuote.quote.outputRaw,
        targetMetadata.transferFee
      );
      const expectedNetTargetAmount = rawToEconomicDisplay(netOutputRaw, targetDecimals, activeMultiplier).toString();
      quote = {
        ...jupQuote.quote,
        outputRaw: netOutputRaw,
        expectedTargetAmount: expectedNetTargetAmount,
      };
    } else {
      const inputMint = CANONICAL_MINTS.mainnet.WSOL;
      const inputDisplay = rawToDisplay(candidateRaw, CANONICAL_MINTS.mainnet.SOL_DECIMALS).toString();

      const jupQuote = await this.jupiterAdapter.getQuote({
        inputMint,
        outputMint: asset.mint,
        amount: candidateRaw,
        outputDecimals: targetDecimals,
      });

      let usdVal: string;
      if (jupQuote.inUsdValue != null && jupQuote.inUsdValue > 0) {
        usdVal = toDecimal(jupQuote.inUsdValue).toString();
      } else {
        try {
          const solPrice = await this.jupiterAdapter.getSolUsdPrice();
          usdVal = toDecimal(inputDisplay).mul(solPrice).toString();
        } catch (err) {
          throw new SieveAppError(
            "DATA_UNAVAILABLE",
            `Unable to derive contemporaneous SOL/USD valuation: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      fundingValuation = {
        fundingAsset: "SOL",
        inputRaw: candidateRaw,
        inputDisplay,
        inputUsdValue: usdVal,
        method: "CURRENT_MARKET_ROUTE",
        observedAt,
      };

      const netOutputRaw = calculateNetOutput(
        jupQuote.quote.outputRaw,
        targetMetadata.transferFee
      );
      const expectedNetTargetAmount = rawToEconomicDisplay(netOutputRaw, targetDecimals, activeMultiplier).toString();
      quote = {
        ...jupQuote.quote,
        outputRaw: netOutputRaw,
        expectedTargetAmount: expectedNetTargetAmount,
      };
    }

    const decision = evaluatePriceBoundary({
      referencePriceUsd: asset.referencePriceUsd,
      referenceObservedAt: asset.observedAt,
      fundingUsdValue: fundingValuation.inputUsdValue,
      expectedTargetTokens: quote.expectedTargetAmount,
      maxPremiumPct,
      quoteObservedAt: quote.observedAt,
      quoteExpiresAt: quote.expiresAt,
      priceImpactPct: quote.priceImpactPct,
      now,
    });

    const checkId = uuidv4();
    const expiresAt = new Date(now + DEFAULT_CHECK_EXPIRY_MS).toISOString();

    const priceCheck: PriceCheck = {
      id: checkId,
      network: "mainnet",
      wallet: wallet ?? null,
      clientIntentVersion,
      asset,
      funding: fundingValuation,
      quote,
      maxPremiumPct,
      maxPremiumBps: decision.maxPremiumBps,
      decision,
      createdAt: observedAt,
      expiresAt,
    };

    return {
      priceCheck,
      expectedNetTargetAmount: quote.expectedTargetAmount,
      isExecutable: decision.isExecutable,
    };
  }

  toDto(
    priceCheck: PriceCheck,
    targetMetadata?: import("../solana/adapter").ValidatedMintMetadata | null
  ): CheckResponseDto {
    const decision = priceCheck.decision;
    const mappedDecision =
      decision.status === "STALE_REFERENCE" || decision.status === "STALE_QUOTE"
        ? "STALE_DATA"
        : decision.status;

    return {
      checkId: priceCheck.id,
      clientIntentVersion: priceCheck.clientIntentVersion,
      network: "mainnet",
      sourceLabel: "PreStocks Official",
      asset: {
        name: priceCheck.asset.name,
        symbol: priceCheck.asset.symbol,
        mint: priceCheck.asset.mint,
      },
      funding: {
        asset: priceCheck.funding.fundingAsset,
        amount: priceCheck.funding.inputDisplay,
        usdValue: priceCheck.funding.inputUsdValue,
      },
      price: {
        referenceUsd: decision.referencePriceUsd,
        currentBuyUsd: decision.currentBuyPriceUsd,
        maxBuyUsd: decision.maximumBuyPriceUsd,
        premiumPct: decision.premiumPct,
      },
      expected: {
        targetAmount: priceCheck.quote?.expectedTargetAmount ?? null,
        priceImpactPct: priceCheck.quote?.priceImpactPct ?? null,
      },
      decision: mappedDecision,
      observedAt: priceCheck.createdAt,
      expiresAt: priceCheck.expiresAt,
      display: {
        title: decision.displayTitle,
        message: decision.displayMessage,
      },
      warnings: targetMetadata?.warnings ?? [],
      issuerControls: targetMetadata?.issuerControls,
      activeMultiplier: targetMetadata?.scaledUiAmount?.activeMultiplier,
    };
  }

  async getCheck(checkId: string): Promise<PriceCheck | null> {
    const fromRepo = await this.repo.getPriceCheck(checkId);
    if (fromRepo) return fromRepo;
    return activeChecksStore.get(checkId) ?? null;
  }
}

export const defaultPriceCheckService = new PriceCheckService();
