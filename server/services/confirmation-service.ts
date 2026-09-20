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
import type { TradeReceipt, NetworkMode } from "../../core/domain/types";


export interface ConfirmRequestInput {
  buildIntentId: string;
  signature?: string;
  signedTransaction?: string;
  wallet?: string;
  network?: NetworkMode;
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
    if (input.network && input.network !== buildIntent.network) {
      throw new SieveAppError("NETWORK_MISMATCH", "Network mode does not match build intent");
    }
    if (input.wallet && input.wallet !== buildIntent.wallet) {
      throw new SieveAppError("WALLET_MISMATCH", "Wallet address does not match build intent");
    }

    // 3. Validate expiry (Audit Repair 8)
    if (isExpired(buildIntent.expiresAt, Date.now())) {
      throw new SieveAppError("TRANSACTION_EXPIRED", "Transaction build intent expired before confirmation");
    }

    const network = input.network ?? buildIntent.network;

    // 4. Mainnet signature-only rejection (Audit Defect 1)
    if (network === "mainnet" && !input.signedTransaction) {
      throw new SieveAppError("VALIDATION_ERROR", "Mainnet confirmation requires signedTransaction");
    }

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

    if (network === "mainnet") {
      if (!buildIntent.requestId) {
        throw new SieveAppError("TRANSACTION_FAILED", "Missing Jupiter requestId for execution");
      }
      const execResult = await this.jupiterAdapter.executeTransaction({
        signedTransaction: input.signedTransaction!,
        requestId: buildIntent.requestId,
        lastValidBlockHeight: buildIntent.lastValidBlockHeight,
      });

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
          const targetDecimals = buildIntent.summary.targetDecimals ?? (await this.solanaAdapter.resolveMintDecimals(check.asset.mint, "mainnet"));
          const activeMultiplier = buildIntent.summary.activeMultiplier ?? "1";
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
    } else {
      // Practice / Testnet mode: accept simulated execution
      isConfirmed = true;
      signature = signature || `sim-testnet-sig-${buildIntent.id.slice(0, 8)}`;
      realizedTargetAmount = buildIntent.summary.expectedTargetAmount;
      actualFundingAmount = buildIntent.summary.fundingAmount;
    }

    const receiptId = uuidv4();
    const confirmedAt = isConfirmed ? new Date().toISOString() : null;

    const receipt: TradeReceipt = {
      id: receiptId,
      checkId: check.id,
      buildIntentId: buildIntent.id,
      wallet: buildIntent.wallet,
      network,
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

    if (savedReceipt.signature) {
      receiptsBySignatureStore.set(savedReceipt.signature, savedReceipt);
    }

    const walletReceipts = receiptsByWalletStore.get(buildIntent.wallet) ?? [];
    walletReceipts.unshift(savedReceipt);
    receiptsByWalletStore.set(buildIntent.wallet, walletReceipts);

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

  async getReceiptsByWallet(wallet: string, network?: NetworkMode): Promise<TradeReceipt[]> {
    const fromRepo = await this.repo.listTradeReceipts({ wallet, network });
    if (fromRepo.length > 0) return fromRepo;
    const list = receiptsByWalletStore.get(wallet) ?? [];
    if (network) {
      return list.filter((r) => r.network === network);
    }
    return list;
  }
}

export const defaultConfirmationService = new ConfirmationService();

