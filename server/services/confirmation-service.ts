import { verifySignedTransaction } from "../security/transaction-binding";
import { v4 as uuidv4 } from "uuid";
import { activeBuildIntentsStore } from "./build-service";
import { activeChecksStore } from "./check-service";
import { defaultSolanaAdapter, SolanaAdapter } from "../solana/adapter";
import { defaultJupiterAdapter, JupiterAdapter } from "../jupiter/adapter";
import { getRepository } from "../database/db";
import type { ISieveRepository } from "../database/repository";
import { SieveAppError } from "./errors";
import { isExpired } from "../../core";
import { rawToDisplay, rawToEconomicDisplay } from "../../core/money/decimal";
import type { TradeReceipt } from "../../core/domain/types";


export interface ConfirmRequestInput {
  buildIntentId: string;
  signature?: string;
  signedTransaction?: string;
  wallet?: string;
}

export interface ConfirmResponseDto {
  status: "CONFIRMED" | "FAILED" | "PENDING";
  receiptId?: string;
  signature: string | null;
  receipt?: TradeReceipt;
}

// In-memory receipts store (backed by DB in persistence phase)
export const receiptsBySignatureStore = new Map<string, TradeReceipt>();
export const receiptsByWalletStore = new Map<string, TradeReceipt[]>();

export class ConfirmationService {
  constructor(
    private solanaAdapter: SolanaAdapter = defaultSolanaAdapter,
    private jupiterAdapter: JupiterAdapter = defaultJupiterAdapter,
    private repo: ISieveRepository = getRepository()
  ) {}

  async confirmTransaction(input: ConfirmRequestInput): Promise<ConfirmResponseDto> {
    // 1. Validate build intent exists
    const buildIntent = (await this.repo.getBuildIntent(input.buildIntentId)) ?? activeBuildIntentsStore.get(input.buildIntentId);
    if (!buildIntent) {
      throw new SieveAppError("TRANSACTION_EXPIRED", "Build intent not found or expired");
    }

    // 2. Context binding validation (Audit Repair 5)
    if (!input.wallet || input.wallet !== buildIntent.wallet) {
      throw new SieveAppError("WALLET_MISMATCH", "Wallet address does not match build intent");
    }

    // Expired messages may be reconciled, but are never submitted again.
    // 4. Mainnet signature-only rejection (Audit Defect 1)
    if (!input.signedTransaction) {
      throw new SieveAppError("VALIDATION_ERROR", "Mainnet confirmation requires signedTransaction");
    }

    const expectedSignature = verifySignedTransaction({ ...input, signedTransaction: input.signedTransaction, wallet: buildIntent.wallet, transactionMessageHash: buildIntent.transactionMessageHash });
    input.signature = expectedSignature;
    // 5. Cross-build idempotency check on provided signature (Audit Defect 2)
    if (input.signature) {
      const existingFromRepo = await this.repo.getTradeReceiptBySignature(input.signature);
      const existing = existingFromRepo ?? receiptsBySignatureStore.get(input.signature);
      if (existing) {
        if (
          existing.buildIntentId !== buildIntent.id ||
          existing.checkId !== buildIntent.checkId ||
          existing.wallet !== buildIntent.wallet ||
          existing.network !== buildIntent.network
        ) {
          throw new SieveAppError(
            "IDEMPOTENCY_VIOLATION",
            "Signature belongs to a different trade receipt or build intent"
          );
        }
        return {
          status: existing.status,
          receiptId: existing.id,
          signature: existing.signature,
          receipt: existing,
        };
      }
    }

    const check = (await this.repo.getPriceCheck(buildIntent.checkId)) ?? activeChecksStore.get(buildIntent.checkId);
    if (!check) {
      throw new SieveAppError("QUOTE_EXPIRED", "Associated price check not found");
    }

    // 6. Execute and confirm status (Audit Defects 1, 2, 3, 4, 11)
    let isConfirmed = false;
    let failureCode: string | null = null;
    let signature: string | null = input.signature ?? null;
    let realizedTargetAmount: string | null = null;
    let actualFundingAmount: string | null = null;
    let rawWalletOutput: string | null = null;
    const internalExecutionId = uuidv4();

    if (!buildIntent.requestId) {
        throw new SieveAppError("TRANSACTION_FAILED", "Missing Jupiter requestId for execution");
      }
      const execResult: import("../jupiter/schema").JupiterExecuteResponse = isExpired(buildIntent.expiresAt, Date.now()) ? { status: "Failed" } : await this.jupiterAdapter.executeTransaction({
        signedTransaction: input.signedTransaction!,
        requestId: buildIntent.requestId,
        lastValidBlockHeight: buildIntent.lastValidBlockHeight,
      }).catch(() => ({ status: "Failed" as const }));
      // A transport failure may follow successful submission. Only chain evidence
      // below may create a terminal receipt; unknown landing remains pending.

      if (execResult.signature && execResult.signature !== expectedSignature) throw new SieveAppError("CONFIRMATION_FAILED", "Provider signature mismatch");
      const inputMint = check.funding.fundingAsset === "USDC" ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" : "So11111111111111111111111111111111111111112";
      const chain = await this.solanaAdapter.verifyExecution(expectedSignature, buildIntent.transactionMessageHash!, buildIntent.wallet, inputMint, check.asset.mint);
      if (!chain.confirmed && !chain.failed) return { status: "PENDING", signature: expectedSignature };
      if (chain.confirmed && (chain.outputRaw == null || BigInt(chain.outputRaw) < buildIntent.minimumAcceptableOutputRaw || (chain.inputRaw != null && BigInt(chain.inputRaw) !== check.funding.inputRaw))) throw new SieveAppError("CONFIRMATION_FAILED", "Chain amounts violate built intent");
      execResult.signature = expectedSignature;
      execResult.status = chain.confirmed ? "Success" : "Failed";
      execResult.error = chain.failed ? "Transaction failed on-chain" : undefined;
      execResult.totalInputAmount = chain.inputRaw ?? undefined;
      execResult.totalOutputAmount = chain.outputRaw ?? undefined;
      if (execResult.status === "Success" && execResult.signature) {
        signature = execResult.signature;
        isConfirmed = true;

        // Idempotency check: if returned signature already has a receipt, verify cross-build parameters
        const existing = (await this.repo.getTradeReceiptBySignature(signature)) ?? receiptsBySignatureStore.get(signature);
        if (existing) {
          if (
            existing.buildIntentId !== buildIntent.id ||
            existing.checkId !== buildIntent.checkId ||
            existing.wallet !== buildIntent.wallet ||
            existing.network !== buildIntent.network
          ) {
            throw new SieveAppError(
              "IDEMPOTENCY_VIOLATION",
              "Signature belongs to a different trade receipt or build intent"
            );
          }
          return {
            status: existing.status,
            receiptId: existing.id,
            signature: existing.signature,
            receipt: existing,
          };
        }

        // Realized target amount: NEVER fall back to expected on Mainnet (Audit Defect 3)
        // Convert using authoritative scaled UI conversion for ScaledUiAmount mints (Audit Requirement 5)
        if (execResult.totalOutputAmount) {
          rawWalletOutput = execResult.totalOutputAmount;
          if (buildIntent.summary.targetDecimals == null) {
            throw new SieveAppError(
              "DATABASE_INTEGRITY_ERROR",
              "Persisted build intent missing required targetDecimals; failing closed"
            );
          }
          const targetDecimals = buildIntent.summary.targetDecimals;
          const targetMetadata = await this.solanaAdapter.resolveMintMetadata(check.asset.mint, "mainnet");
          let activeMultiplier: string | undefined = buildIntent.summary.activeMultiplier;
          if (targetMetadata.scaledUiAmount) {
            if (!activeMultiplier) {
              throw new SieveAppError(
                "DATABASE_INTEGRITY_ERROR",
                "Persisted build intent missing activeMultiplier for ScaledUi token on Mainnet; failing closed instead of defaulting to 1"
              );
            }
          } else {
            activeMultiplier = activeMultiplier ?? "1";
          }
          realizedTargetAmount = rawToEconomicDisplay(
            BigInt(execResult.totalOutputAmount),
            targetDecimals,
            activeMultiplier
          ).toString();
        } else {
          realizedTargetAmount = null;
        }

        // Actual funding amount (Audit Defect 4)
        if (execResult.totalInputAmount) {
          const fundingDecimals = buildIntent.summary.fundingAsset === "USDC" ? 6 : 9;
          actualFundingAmount = rawToDisplay(BigInt(execResult.totalInputAmount), fundingDecimals).toString();
        } else {
          actualFundingAmount = null;
        }
      } else {
        isConfirmed = false;
        failureCode = execResult.error || `Execution failed (code: ${execResult.code ?? "UNKNOWN"})`;
        // Do not fabricate failed-xxxxxxxx signatures (Audit Defect 11)
        signature = execResult.signature || null;
      }

    const receiptId = uuidv4();
    const confirmedAt = isConfirmed ? new Date().toISOString() : null;

    const receipt: TradeReceipt = {
      id: receiptId,
      checkId: check.id,
      buildIntentId: buildIntent.id,
      wallet: buildIntent.wallet,
      network: "mainnet",
      signature,
      status: isConfirmed ? "CONFIRMED" : "FAILED",
      fundingAsset: buildIntent.summary.fundingAsset,
      fundingAmount: buildIntent.summary.fundingAmount,
      requestedFundingAmount: buildIntent.summary.fundingAmount,
      actualFundingAmount,
      targetSymbol: buildIntent.summary.targetSymbol,
      targetMint: check.asset.mint,
      targetDecimals: buildIntent.summary.targetDecimals ?? null,
      expectedTargetAmount: buildIntent.summary.expectedTargetAmount,
      realizedTargetAmount,
      rawWalletOutput,
      activeMultiplier: buildIntent.summary.activeMultiplier ?? null,
      chainTimestamp: buildIntent.summary.chainTimestamp ?? null,
      epoch: buildIntent.summary.epoch ?? null,
      referencePriceUsd: buildIntent.summary.referencePriceUsd,
      checkedBuyPriceUsd: buildIntent.summary.currentBuyPriceUsd,
      maxPremiumBps: check.maxPremiumBps,
      premiumBps: buildIntent.summary.premiumBps ?? Math.round(Number(buildIntent.summary.premiumPct) * 100),
      submittedAt: new Date().toISOString(),
      confirmedAt,
      failureCode,
      internalExecutionId,
    };


    // Store receipt idempotently
    const savedReceipt = await this.repo.saveTradeReceipt(receipt);
    if (
      savedReceipt.buildIntentId !== buildIntent.id ||
      savedReceipt.checkId !== buildIntent.checkId ||
      savedReceipt.wallet !== buildIntent.wallet ||
      savedReceipt.network !== buildIntent.network
    ) {
      throw new SieveAppError(
        "IDEMPOTENCY_VIOLATION",
        "Signature belongs to a different trade receipt or build intent"
      );
    }



    return {
      status: savedReceipt.status,
      receiptId: savedReceipt.id,
      signature: savedReceipt.signature,
      receipt: savedReceipt,
    };
  }

  async getReceiptBySignature(signature: string): Promise<TradeReceipt | null> {
    const fromRepo = await this.repo.getTradeReceiptBySignature(signature);
    if (fromRepo) return fromRepo;
    return receiptsBySignatureStore.get(signature) ?? null;
  }

  async getReceiptsByWallet(wallet: string): Promise<TradeReceipt[]> {
    const fromRepo = await this.repo.listTradeReceipts({ wallet, network: "mainnet" });
    if (fromRepo.length > 0) return fromRepo;
    const list = receiptsByWalletStore.get(wallet) ?? [];
    return list;
  }
}

export const defaultConfirmationService = new ConfirmationService();

