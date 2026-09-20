import { v4 as uuidv4 } from "uuid";
import { activeChecksStore, type CheckResponseDto } from "./check-service";
import { defaultJupiterAdapter, JupiterAdapter } from "../jupiter/adapter";
import { defaultPracticeAdapter, PracticeAdapter } from "../practice/adapter";
import { defaultSolanaAdapter, SolanaAdapter, CANONICAL_MINTS, calculateNetOutput } from "../solana/adapter";
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
import { toDecimal, rawToDisplay, rawToEconomicDisplay } from "../../core/money/decimal";
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
      summary: BuildIntent["summary"];
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

    // 5. Server-Side Revalidation: Refetch fresh reference and quote (force cache bypass)
    let freshAsset = await this.marketService.getMarketByMint(check.asset.mint, check.network, { bypassCache: true });
    if (!freshAsset) {
      throw new SieveAppError("PRICE_REFERENCE_INVALID", "Market asset no longer available");
    }

    let revalQuoteExpectedAmount = check.quote?.expectedTargetAmount ?? "0";
    let revalPriceImpact = check.quote?.priceImpactPct ?? null;
    let serializedTx = "";
    let lastValidBlockHeight: string | undefined;
    let requestId: string | undefined;
    let freshFundingUsdValue = check.funding.inputUsdValue;
    let targetMetadata: import("../solana/adapter").ValidatedMintMetadata | null = null;
    let buildResultFeeInfo: {
      signatureFeeLamports?: number | null;
      signatureFeePayer?: string | null;
      prioritizationFeeLamports?: number | null;
      prioritizationFeePayer?: string | null;
      rentFeeLamports?: number | null;
      rentFeePayer?: string | null;
      gasless?: boolean | null;
    } | undefined;

    if (check.network === "mainnet") {
      targetMetadata = await this.solanaAdapter.resolveMintMetadata(freshAsset.mint, "mainnet", { bypassCache: true });
      if (!targetMetadata.supported) {
        throw new SieveAppError("ROUTE_RISK", targetMetadata.blockers?.join(", ") || "Asset not supported");
      }
      const targetDecimals = targetMetadata.decimals;
      const activeMultiplier = targetMetadata.scaledUiAmount?.activeMultiplier ?? "1";
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

      // Account for Token-2022 transfer fee withholding on expected target tokens
      const netRevalRaw = calculateNetOutput(
        jupQuote.quote.outputRaw,
        targetMetadata.transferFee
      );
      revalQuoteExpectedAmount = rawToEconomicDisplay(netRevalRaw, targetDecimals, activeMultiplier).toString();
      revalPriceImpact = jupQuote.quote.priceImpactPct;

      // Refresh SOL valuation contemporaneously if funding with SOL
      if (check.funding.fundingAsset === "SOL") {
        if (jupQuote.rawResponse?.inUsdValue != null && jupQuote.rawResponse.inUsdValue > 0) {
          freshFundingUsdValue = toDecimal(jupQuote.rawResponse.inUsdValue).toString();
        } else {
          try {
            const solPrice = await this.jupiterAdapter.getSolUsdPrice();
            freshFundingUsdValue = toDecimal(check.funding.inputDisplay).mul(solPrice).toString();
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
      if (input.scenarioId && this.practiceAdapter.getScenario(input.scenarioId).id === input.scenarioId) {
        const practiceRevalQuote = await this.practiceAdapter.getRevalidationQuote(input.scenarioId);
        revalQuoteExpectedAmount = practiceRevalQuote.expectedTargetAmount;
        revalPriceImpact = practiceRevalQuote.priceImpactPct;
        const scenario = this.practiceAdapter.getScenario(input.scenarioId);
        if (scenario && scenario.asset) {
          freshAsset = scenario.asset;
        }
      } else {
        revalQuoteExpectedAmount = check.quote?.expectedTargetAmount ?? "0";
        revalPriceImpact = check.quote?.priceImpactPct ?? null;
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
    const targetDecimals = check.network === "mainnet" && targetMetadata
      ? targetMetadata.decimals
      : 6;

    const protection = deriveAllowedExecutionTolerance({
      fundingUsdValue: freshFundingUsdValue,
      referencePriceUsd: freshAsset.referencePriceUsd,
      maxPremiumPct: check.maxPremiumPct,
      expectedTargetTokens: revalQuoteExpectedAmount,
      targetDecimals,
      activeMultiplier: targetMetadata?.scaledUiAmount?.activeMultiplier,
    });

    if (!protection.isExecutable) {
      throw new SieveAppError("PRICE_MOVED_OUTSIDE_LIMIT", "Price moved outside limit during protection derivation");
    }

    // 9. Assemble transaction
    if (check.network === "mainnet") {
      // Check destination ATA state before assembling transaction
      if (targetMetadata) {
        const destCheck = await this.solanaAdapter.checkDestinationAccount(
          input.wallet,
          freshAsset.mint,
          targetMetadata.programOwner === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
            ? new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
            : new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          targetMetadata.issuerControls?.defaultAccountState,
          "mainnet"
        );
        if (destCheck.isFrozen || destCheck.error) {
          throw new SieveAppError("ROUTE_RISK", destCheck.error || "Destination token account is Frozen");
        }
      }

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
      if (!buildResult.otherAmountThreshold) {
        throw new SieveAppError(
          "ROUTE_RISK",
          "Final assembled Jupiter order does not expose a verifiable minimum-output protection threshold"
        );
      }
      const grossMinRaw = BigInt(buildResult.otherAmountThreshold);
      const netMinRaw = targetMetadata
        ? calculateNetOutput(grossMinRaw, targetMetadata.transferFee)
        : grossMinRaw;

      // Handle TransferFee epoch transition:
      // If older and newer transfer fee schedules exist and differ, evaluate worst-case net output
      if (
        targetMetadata?.olderTransferFee &&
        targetMetadata?.newerTransferFee &&
        (targetMetadata.olderTransferFee.basisPoints !== targetMetadata.newerTransferFee.basisPoints ||
          targetMetadata.olderTransferFee.maximumFee !== targetMetadata.newerTransferFee.maximumFee)
      ) {
        const netOlder = calculateNetOutput(grossMinRaw, targetMetadata.olderTransferFee);
        const netNewer = calculateNetOutput(grossMinRaw, targetMetadata.newerTransferFee);
        const worstNetMinRaw = netOlder < netNewer ? netOlder : netNewer;
        if (worstNetMinRaw < protection.minimumAcceptableOutputRaw) {
          throw new SieveAppError(
            "PRICE_MOVED_OUTSIDE_LIMIT",
            `Assembled transaction worst-case net minimum output across fee epoch transition (${worstNetMinRaw}) is looser than Sieve price limit (${protection.minimumAcceptableOutputRaw})`
          );
        }
      }

      if (netMinRaw < protection.minimumAcceptableOutputRaw) {
        throw new SieveAppError(
          "PRICE_MOVED_OUTSIDE_LIMIT",
          `Assembled transaction net minimum output (${netMinRaw}) is looser than Sieve price limit (${protection.minimumAcceptableOutputRaw})`
        );
      }

      serializedTx = buildResult.transactionBase64;
      lastValidBlockHeight = buildResult.lastValidBlockHeight;
      requestId = buildResult.requestId;
      buildResultFeeInfo = {
        signatureFeeLamports: buildResult.signatureFeeLamports ?? null,
        signatureFeePayer: buildResult.signatureFeePayer ?? null,
        prioritizationFeeLamports: buildResult.prioritizationFeeLamports ?? null,
        prioritizationFeePayer: buildResult.prioritizationFeePayer ?? null,
        rentFeeLamports: buildResult.rentFeeLamports ?? null,
        rentFeePayer: buildResult.rentFeePayer ?? null,
        gasless: buildResult.gasless ?? null,
      };
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
    const defaultExpiresAtMs = now + 60_000;
    let expiresAtMs = defaultExpiresAtMs;

    if (targetMetadata?.scaledUiAmount?.newMultiplierEffectiveTimestamp) {
      const transitionTimestampMs = targetMetadata.scaledUiAmount.newMultiplierEffectiveTimestamp * 1000;
      const refTimeMs = targetMetadata.chainTimestamp ? targetMetadata.chainTimestamp * 1000 : now;
      if (transitionTimestampMs > refTimeMs && transitionTimestampMs < expiresAtMs) {
        if (transitionTimestampMs - refTimeMs < 5_000) {
          throw new SieveAppError(
            "DATA_UNAVAILABLE",
            "Target token multiplier scheduled to transition immediately; transaction cannot be safely prepared"
          );
        }
        expiresAtMs = transitionTimestampMs;
      }
    }
    const expiresAt = new Date(expiresAtMs).toISOString();

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
        targetDecimals,
        expectedTargetAmount: revalQuoteExpectedAmount,
        referencePriceUsd: revalDecision.referencePriceUsd,
        currentBuyPriceUsd: revalDecision.currentBuyPriceUsd!,
        premiumPct: revalDecision.premiumPct!,
        maxPremiumPct: check.maxPremiumPct,
        maxBuyPriceUsd: revalDecision.maximumBuyPriceUsd,
        minimumAcceptableOutput: rawToEconomicDisplay(
          protection.minimumAcceptableOutputRaw,
          targetDecimals,
          targetMetadata?.scaledUiAmount?.activeMultiplier
        ).toString(),
        premiumBps: revalDecision.premiumBps!,
        activeMultiplier: targetMetadata?.scaledUiAmount?.activeMultiplier,
        chainTimestamp: targetMetadata?.chainTimestamp,
        epoch: targetMetadata?.epoch?.toString(),
        issuerControls: targetMetadata?.issuerControls,
        feeInfo: buildResultFeeInfo,
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
