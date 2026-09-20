import { v4 as uuidv4 } from "uuid";
import { defaultMarketService, MarketService } from "./market-service";
import { defaultJupiterAdapter, JupiterAdapter } from "../jupiter/adapter";
import { defaultPracticeAdapter, PracticeAdapter } from "../practice/adapter";
import { defaultSolanaAdapter, SolanaAdapter, CANONICAL_MINTS, calculateNetOutput } from "../solana/adapter";
import { getRepository } from "../database/db";
import type { ISieveRepository } from "../database/repository";
import {
  evaluatePriceBoundary,
  DEFAULT_CHECK_EXPIRY_MS,
} from "../../core";
import { displayToRaw, rawToDisplay, isPositiveFinite, toDecimal } from "../../core/money/decimal";
import { SieveAppError } from "./errors";
import type {
  NetworkMode,
  FundingAsset,
  PriceCheck,
  FundingValuation,
  MarketQuote,
} from "../../core/domain/types";

export interface CheckRequestInput {
  network: NetworkMode;
  targetMint: string;
  fundingAsset: FundingAsset;
  amount: string;
  maxPremiumPct: string;
  wallet?: string | null;
  clientIntentVersion: string;
  scenarioId?: string; // Used for deterministic testing/practice
}

export interface CheckResponseDto {
  checkId: string;
  clientIntentVersion: string;
  network: NetworkMode;
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
    private practiceAdapter: PracticeAdapter = defaultPracticeAdapter,
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
    let asset = await this.marketService.getMarketByMint(input.targetMint, input.network);
    if (!asset) {
      throw new SieveAppError(
        "PRICE_REFERENCE_INVALID",
        `Target mint ${input.targetMint} is not a recognized PreStocks asset`
      );
    }

    let fundingValuation: FundingValuation;
    let quote: MarketQuote | null = null;
    const now = Date.now();
    const observedAt = new Date(now).toISOString();

    if (input.network === "mainnet") {
      // 3. Mainnet flow
      const targetMetadata = await this.solanaAdapter.resolveMintMetadata(asset.mint, "mainnet");
      const targetDecimals = targetMetadata.decimals;

      if (input.fundingAsset === "USDC") {
        const inputMint = CANONICAL_MINTS.mainnet.USDC;
        const inputRaw = displayToRaw(input.amount, CANONICAL_MINTS.mainnet.USDC_DECIMALS);
        const inputUsdValue = toDecimal(input.amount).toString();

        fundingValuation = {
          fundingAsset: "USDC",
          inputRaw,
          inputDisplay: input.amount,
          inputUsdValue,
          method: "USDC_PAR",
          observedAt,
        };

        const jupQuote = await this.jupiterAdapter.getQuote({
          inputMint,
          outputMint: asset.mint,
          amount: inputRaw,
          outputDecimals: targetDecimals,
        });

        // Guarantee NET output by accounting for Token-2022 transfer fee withholding
        const netOutputRaw = calculateNetOutput(
          jupQuote.quote.outputRaw,
          targetMetadata.transferFeeBasisPoints,
          targetMetadata.maximumFee
        );
        const expectedNetTargetAmount = rawToDisplay(netOutputRaw, targetDecimals).toString();
        quote = {
          ...jupQuote.quote,
          outputRaw: netOutputRaw,
          expectedTargetAmount: expectedNetTargetAmount,
        };
      } else {
        // SOL funding asset
        const inputMint = CANONICAL_MINTS.mainnet.WSOL;
        const inputRaw = displayToRaw(input.amount, CANONICAL_MINTS.mainnet.SOL_DECIMALS);

        const jupQuote = await this.jupiterAdapter.getQuote({
          inputMint,
          outputMint: asset.mint,
          amount: inputRaw,
          outputDecimals: targetDecimals,
        });

        // Contemporaneous SOL USD valuation from Jupiter (never a hardcoded constant)
        let usdVal: string;
        if (jupQuote.inUsdValue != null && jupQuote.inUsdValue > 0) {
          usdVal = toDecimal(jupQuote.inUsdValue).toString();
        } else {
          try {
            const solPrice = await this.jupiterAdapter.getSolUsdPrice();
            usdVal = toDecimal(input.amount).mul(solPrice).toString();
          } catch (err) {
            throw new SieveAppError(
              "DATA_UNAVAILABLE",
              `Unable to derive contemporaneous SOL/USD valuation: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        fundingValuation = {
          fundingAsset: "SOL",
          inputRaw,
          inputDisplay: input.amount,
          inputUsdValue: usdVal,
          method: "CURRENT_MARKET_ROUTE",
          observedAt,
        };

        // Guarantee NET output by accounting for Token-2022 transfer fee withholding
        const netOutputRaw = calculateNetOutput(
          jupQuote.quote.outputRaw,
          targetMetadata.transferFeeBasisPoints,
          targetMetadata.maximumFee
        );
        const expectedNetTargetAmount = rawToDisplay(netOutputRaw, targetDecimals).toString();
        quote = {
          ...jupQuote.quote,
          outputRaw: netOutputRaw,
          expectedTargetAmount: expectedNetTargetAmount,
        };
      }
    } else {
      // 4. Testnet / Practice mode
      const practiceResult = await this.practiceAdapter.getQuote(input.scenarioId);
      quote = practiceResult.quote;
      fundingValuation = practiceResult.funding;
      if (practiceResult.asset) {
        asset = practiceResult.asset;
      }

      // If user customized fundingAsset and amount in Practice mode without a fixed scenario,
      // dynamically scale the fixture funding valuation and quote:
      if (!input.scenarioId && input.amount) {
        const inputAmt = input.amount;
        if (input.fundingAsset === "SOL") {
          const solPriceUsd = 150; // $150 / SOL in practice fixture
          const usdVal = (parseFloat(inputAmt) * solPriceUsd).toString();
          const targetPrice = parseFloat(asset.referencePriceUsd) * 1.03; // ~3% premium in practice
          const targetTokens = (parseFloat(usdVal) / targetPrice).toFixed(6);
          fundingValuation = {
            fundingAsset: "SOL",
            inputRaw: BigInt(Math.floor(parseFloat(inputAmt) * 1e9)),
            inputDisplay: inputAmt,
            inputUsdValue: usdVal,
            method: "CURRENT_MARKET_ROUTE",
            observedAt,
          };
          if (quote) {
            quote = {
              ...quote,
              expectedTargetAmount: targetTokens,
              outputRaw: BigInt(Math.floor(parseFloat(targetTokens) * 1e6)),
              observedAt: new Date(now - 1000).toISOString(),
              expiresAt: new Date(now + 30_000).toISOString(),
            };
          }
        } else {
          const usdVal = inputAmt;
          const targetPrice = parseFloat(asset.referencePriceUsd) * 1.03; // ~3% premium in practice
          const targetTokens = (parseFloat(usdVal) / targetPrice).toFixed(6);
          fundingValuation = {
            fundingAsset: "USDC",
            inputRaw: BigInt(Math.floor(parseFloat(inputAmt) * 1e6)),
            inputDisplay: inputAmt,
            inputUsdValue: usdVal,
            method: "USDC_PAR",
            observedAt,
          };
          if (quote) {
            quote = {
              ...quote,
              expectedTargetAmount: targetTokens,
              outputRaw: BigInt(Math.floor(parseFloat(targetTokens) * 1e6)),
              observedAt: new Date(now - 1000).toISOString(),
              expiresAt: new Date(now + 30_000).toISOString(),
            };
          }
        }
      }
    }

    // 5. Evaluate decision via core policy evaluator
    const decision = evaluatePriceBoundary({
      referencePriceUsd: asset.referencePriceUsd,
      referenceObservedAt: asset.observedAt,
      fundingUsdValue: fundingValuation.inputUsdValue,
      expectedTargetTokens: quote?.expectedTargetAmount ?? "0",
      maxPremiumPct: input.maxPremiumPct,
      quoteObservedAt: quote?.observedAt,
      quoteExpiresAt: quote?.expiresAt,
      priceImpactPct: quote?.priceImpactPct,
      now,
    });

    const checkId = uuidv4();
    const expiresAt = new Date(now + DEFAULT_CHECK_EXPIRY_MS).toISOString();

    const priceCheck: PriceCheck = {
      id: checkId,
      network: input.network,
      wallet: input.wallet ?? null,
      clientIntentVersion: input.clientIntentVersion,
      asset,
      funding: fundingValuation,
      quote,
      maxPremiumPct: input.maxPremiumPct,
      maxPremiumBps: decision.maxPremiumBps,
      decision,
      createdAt: observedAt,
      expiresAt,
    };

    activeChecksStore.set(checkId, priceCheck);
    await this.repo.savePriceCheck(priceCheck);

    const mappedDecision =
      decision.status === "STALE_REFERENCE" || decision.status === "STALE_QUOTE"
        ? "STALE_DATA"
        : decision.status;

    return {
      checkId,
      clientIntentVersion: input.clientIntentVersion,
      network: input.network,
      sourceLabel: asset.source === "PRESTOCKS" ? "PreStocks Official" : "Practice Fixture (Test data)",
      asset: {
        name: asset.name,
        symbol: asset.symbol,
        mint: asset.mint,
      },
      funding: {
        asset: fundingValuation.fundingAsset,
        amount: fundingValuation.inputDisplay,
        usdValue: fundingValuation.inputUsdValue,
      },
      price: {
        referenceUsd: decision.referencePriceUsd,
        currentBuyUsd: decision.currentBuyPriceUsd,
        maxBuyUsd: decision.maximumBuyPriceUsd,
        premiumPct: decision.premiumPct,
      },
      expected: {
        targetAmount: quote?.expectedTargetAmount ?? null,
        priceImpactPct: quote?.priceImpactPct ?? null,
      },
      decision: mappedDecision,
      observedAt,
      expiresAt,
      display: {
        title: decision.displayTitle,
        message: decision.displayMessage,
      },
    };
  }

  async getCheck(checkId: string): Promise<PriceCheck | null> {
    const fromRepo = await this.repo.getPriceCheck(checkId);
    if (fromRepo) return fromRepo;
    return activeChecksStore.get(checkId) ?? null;
  }
}

export const defaultPriceCheckService = new PriceCheckService();
