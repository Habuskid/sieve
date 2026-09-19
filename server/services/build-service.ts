import { v4 as uuidv4 } from "uuid";
import { activeChecksStore, type CheckResponseDto } from "./check-service";
import { defaultJupiterAdapter, JupiterAdapter } from "../jupiter/adapter";
import { defaultPracticeAdapter, PracticeAdapter } from "../practice/adapter";
import { defaultSolanaAdapter, SolanaAdapter, CANONICAL_MINTS } from "../solana/adapter";
import { defaultMarketService, MarketService } from "./market-service";
import { getRepository } from "../database/db";
import type { ISieveRepository } from "../database/repository";
import {
  evaluatePriceBoundary,
  deriveAllowedExecutionTolerance,
  isExpired,
  DEFAULT_CHECK_EXPIRY_MS,
} from "../../core";
import { Keypair, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { toDecimal } from "../../core/money/decimal";
import { SieveAppError } from "./errors";
import type {
  BuildIntent,
  NetworkMode,
  FundingAsset,
} from "../../core/domain/types";

export interface BuildRequestInput {
  checkId: string;
  wallet: string;
  scenarioId?: string; // For testing/practice mode
}

export type BuildResult =
  | {
      status: "READY_FOR_WALLET";
      buildIntentId: string;
      network: NetworkMode;
      serializedTransaction: string;
      expiresAt: string;
      summary: {
        fundingAsset: FundingAsset;
        fundingAmount: string;
        targetSymbol: string;
        expectedTargetAmount: string;
        referencePriceUsd: string;
        currentBuyPriceUsd: string;
        premiumPct: string;
        maxPremiumPct: string;
      };
    }
  | {
      status: "BLOCKED";
      reason: "PRICE_MOVED" | "CHECK_EXPIRED" | "DATA_UNAVAILABLE" | "NO_ROUTE" | "ROUTE_RISK";
      refreshedCheck: CheckResponseDto;
    };

const globalForBuilds = globalThis as unknown as {
  sieveActiveBuildIntents?: Map<string, BuildIntent>;
};
export const activeBuildIntentsStore =
  globalForBuilds.sieveActiveBuildIntents ??
  (globalForBuilds.sieveActiveBuildIntents = new Map<string, BuildIntent>());

export class TransactionBuildService {
  constructor(
    private marketService: MarketService = defaultMarketService,
    private jupiterAdapter: JupiterAdapter = defaultJupiterAdapter,
    private practiceAdapter: PracticeAdapter = defaultPracticeAdapter,
    private solanaAdapter: SolanaAdapter = defaultSolanaAdapter,
    private repo: ISieveRepository = getRepository()
  ) {}

  async buildTransaction(input: BuildRequestInput): Promise<BuildResult> {
    // 1. Retrieve the existing check
    const check = (await this.repo.getPriceCheck(input.checkId)) ?? activeChecksStore.get(input.checkId);
    if (!check) {
      throw new SieveAppError("QUOTE_EXPIRED", "Price check not found or expired");
    }

    const now = Date.now();

    // 2. Check expiry
    if (isExpired(check.expiresAt, now)) {
      throw new SieveAppError("TRANSACTION_EXPIRED", "The price check expired before building transaction");
    }

    // 3. Wallet format validation and context binding
    if (!input.wallet || input.wallet.length < 32 || input.wallet.length > 44) {
      throw new SieveAppError("WALLET_NOT_CONNECTED", "Valid Solana wallet address is required");
    }

    if (check.wallet && check.wallet !== input.wallet) {
      throw new SieveAppError("WALLET_MISMATCH", "Wallet address does not match price check");
    }

    // 4. Wallet balance verification
    const balanceCheck = await this.solanaAdapter.checkBalance(
      input.wallet,
      check.funding.fundingAsset,
      check.funding.inputRaw,
      check.network
    );
    if (!balanceCheck.hasSufficient) {
      throw new SieveAppError("INSUFFICIENT_FUNDS", balanceCheck.error || "Insufficient wallet balance");
    }

    // 5. Server-Side Revalidation: Refetch fresh reference and quote
    let freshAsset = await this.marketService.getMarketByMint(check.asset.mint, check.network);
    if (!freshAsset) {
      throw new SieveAppError("PRICE_REFERENCE_INVALID", "Market asset no longer available");
    }

    let revalQuoteExpectedAmount = check.quote?.expectedTargetAmount ?? "0";
    let revalPriceImpact = check.quote?.priceImpactPct ?? null;
    let serializedTx = "";
    let lastValidBlockHeight: string | undefined;
    let requestId: string | undefined;
    let freshFundingUsdValue = check.funding.inputUsdValue;

    if (check.network === "mainnet") {
      const targetDecimals = await this.solanaAdapter.resolveMintDecimals(freshAsset.mint, "mainnet");
      const inputMint = check.funding.fundingAsset === "USDC"
        ? CANONICAL_MINTS.mainnet.USDC
        : CANONICAL_MINTS.mainnet.WSOL;

      // Re-quote from Jupiter
      const jupQuote = await this.jupiterAdapter.getQuote({
        inputMint,
        outputMint: freshAsset.mint,
        amount: check.funding.inputRaw,
        outputDecimals: targetDecimals,
      });

      revalQuoteExpectedAmount = jupQuote.quote.expectedTargetAmount;
      revalPriceImpact = jupQuote.quote.priceImpactPct;

      // Refresh SOL valuation contemporaneously if funding with SOL
      if (check.funding.fundingAsset === "SOL") {
        if (jupQuote.rawResponse?.inUsdValue != null && jupQuote.rawResponse.inUsdValue > 0) {
          freshFundingUsdValue = toDecimal(jupQuote.rawResponse.inUsdValue).toFixed(2);
        } else {
          try {
            const solPrice = await this.jupiterAdapter.getSolUsdPrice();
            freshFundingUsdValue = toDecimal(check.funding.inputDisplay).mul(solPrice).toFixed(2);
          } catch (err) {
            throw new SieveAppError(
              "DATA_UNAVAILABLE",
              `Unable to refresh contemporaneous SOL/USD valuation: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }
    } else {
      // Practice mode revalidation quote
      const practiceRevalQuote = await this.practiceAdapter.getRevalidationQuote(input.scenarioId);
      revalQuoteExpectedAmount = practiceRevalQuote.expectedTargetAmount;
      revalPriceImpact = practiceRevalQuote.priceImpactPct;
      const scenario = this.practiceAdapter.getScenario(input.scenarioId);
      if (scenario && scenario.asset) {
        freshAsset = scenario.asset;
      }
    }

    // 6. Re-evaluate decision with fresh values
    const revalDecision = evaluatePriceBoundary({
      referencePriceUsd: freshAsset.referencePriceUsd,
      referenceObservedAt: freshAsset.observedAt,
      fundingUsdValue: freshFundingUsdValue,
      expectedTargetTokens: revalQuoteExpectedAmount,
      maxPremiumPct: check.maxPremiumPct,
      priceImpactPct: revalPriceImpact,
      now,
    });

    // 7. If decision is not GOOD_TO_GO, block the build!
    if (revalDecision.status !== "GOOD_TO_GO") {
      const refreshedCheckDto: CheckResponseDto = {
        checkId: check.id,
        clientIntentVersion: check.clientIntentVersion,
        network: check.network,
        sourceLabel: freshAsset.source === "PRESTOCKS" ? "PreStocks Official" : "Practice Fixture",
        asset: {
          name: freshAsset.name,
          symbol: freshAsset.symbol,
          mint: freshAsset.mint,
        },
        funding: {
          asset: check.funding.fundingAsset,
          amount: check.funding.inputDisplay,
          usdValue: freshFundingUsdValue,
        },
        price: {
          referenceUsd: revalDecision.referencePriceUsd,
          currentBuyUsd: revalDecision.currentBuyPriceUsd,
          maxBuyUsd: revalDecision.maximumBuyPriceUsd,
          premiumPct: revalDecision.premiumPct,
        },
        expected: {
          targetAmount: revalQuoteExpectedAmount,
          priceImpactPct: revalPriceImpact,
        },
        decision: revalDecision.status,
        observedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + DEFAULT_CHECK_EXPIRY_MS).toISOString(),
        display: {
          title: revalDecision.displayTitle,
          message: revalDecision.displayMessage,
        },
      };

      return {
        status: "BLOCKED",
        reason: revalDecision.status === "PRICE_TOO_HIGH" ? "PRICE_MOVED" : "ROUTE_RISK",
        refreshedCheck: refreshedCheckDto,
      };
    }

    // 8. Decision is GOOD_TO_GO: Derive transaction protection
    const targetDecimals = check.network === "mainnet"
      ? await this.solanaAdapter.resolveMintDecimals(freshAsset.mint, "mainnet")
      : 6;

    const protection = deriveAllowedExecutionTolerance({
      fundingUsdValue: freshFundingUsdValue,
      referencePriceUsd: freshAsset.referencePriceUsd,
      maxPremiumPct: check.maxPremiumPct,
      expectedTargetTokens: revalQuoteExpectedAmount,
      targetDecimals,
    });

    if (!protection.isExecutable) {
      throw new SieveAppError("PRICE_MOVED_OUTSIDE_LIMIT", "Price moved outside limit during protection derivation");
    }

    // 9. Assemble transaction
    if (check.network === "mainnet") {
      const inputMint = check.funding.fundingAsset === "USDC"
        ? CANONICAL_MINTS.mainnet.USDC
        : CANONICAL_MINTS.mainnet.WSOL;

      const buildResult = await this.jupiterAdapter.buildTransaction({
        inputMint,
        outputMint: freshAsset.mint,
        amount: check.funding.inputRaw,
        outputDecimals: targetDecimals,
        taker: input.wallet,
        slippageBps: protection.slippageBps,
      });

      // Boundary enforcement: ensure assembled transaction slippage threshold strictly satisfies Sieve policy
      if (buildResult.otherAmountThreshold) {
        const jupMinRaw = BigInt(buildResult.otherAmountThreshold);
        if (jupMinRaw < protection.minimumAcceptableOutputRaw) {
          throw new SieveAppError(
            "PRICE_MOVED_OUTSIDE_LIMIT",
            `Assembled transaction minimum output (${jupMinRaw}) is looser than Sieve price limit (${protection.minimumAcceptableOutputRaw})`
          );
        }
      }

      serializedTx = buildResult.transactionBase64;
      lastValidBlockHeight = buildResult.lastValidBlockHeight;
      requestId = buildResult.requestId;
    } else {
      // Practice mode: construct a valid, deserialize-able minimal VersionedTransaction
      const dummyBlockhash = Keypair.generate().publicKey.toBase58();
      try {
        const payer = new PublicKey(input.wallet);
        const message = new TransactionMessage({
          payerKey: payer,
          recentBlockhash: dummyBlockhash,
          instructions: [],
        }).compileToV0Message();
        const dummyTx = new VersionedTransaction(message);
        serializedTx = Buffer.from(dummyTx.serialize()).toString("base64");
      } catch {
        const dummyKey = Keypair.generate().publicKey;
        const message = new TransactionMessage({
          payerKey: dummyKey,
          recentBlockhash: dummyBlockhash,
          instructions: [],
        }).compileToV0Message();
        const dummyTx = new VersionedTransaction(message);
        serializedTx = Buffer.from(dummyTx.serialize()).toString("base64");
      }
      lastValidBlockHeight = "426500000";
      requestId = `practice-req-${check.id}`;
    }

    const buildIntentId = uuidv4();
    const expiresAt = new Date(now + 60_000).toISOString();

    const buildIntent: BuildIntent = {
      id: buildIntentId,
      checkId: check.id,
      network: check.network,
      wallet: input.wallet,
      minimumAcceptableOutputRaw: protection.minimumAcceptableOutputRaw,
      protectionMethod: `JUPITER_SLIPPAGE_BPS_${protection.slippageBps}`,
      transactionBase64: serializedTx,
      lastValidBlockHeight,
      requestId,
      expiresAt,
      summary: {
        fundingAsset: check.funding.fundingAsset,
        fundingAmount: check.funding.inputDisplay,
        targetSymbol: freshAsset.symbol,
        expectedTargetAmount: revalQuoteExpectedAmount,
        referencePriceUsd: revalDecision.referencePriceUsd,
        currentBuyPriceUsd: revalDecision.currentBuyPriceUsd!,
        premiumPct: revalDecision.premiumPct!,
        maxPremiumPct: check.maxPremiumPct,
      },
    };

    activeBuildIntentsStore.set(buildIntentId, buildIntent);
    await this.repo.saveBuildIntent(buildIntent);

    return {
      status: "READY_FOR_WALLET",
      buildIntentId,
      network: check.network,
      serializedTransaction: serializedTx,
      expiresAt,
      summary: buildIntent.summary,
    };
  }

  async getBuildIntent(buildIntentId: string): Promise<BuildIntent | null> {
    const fromRepo = await this.repo.getBuildIntent(buildIntentId);
    if (fromRepo) return fromRepo;
    return activeBuildIntentsStore.get(buildIntentId) ?? null;
  }
}

export const defaultTransactionBuildService = new TransactionBuildService();
