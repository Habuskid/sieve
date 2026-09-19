import { v4 as uuidv4 } from "uuid";
import { activeBuildIntentsStore } from "./build-service";
import { activeChecksStore } from "./check-service";
import { defaultSolanaAdapter, SolanaAdapter } from "../solana/adapter";
import { defaultJupiterAdapter, JupiterAdapter } from "../jupiter/adapter";
import { getRepository } from "../database/db";
import type { ISieveRepository } from "../database/repository";
import { SieveAppError } from "./errors";
import { isExpired } from "../../core";
import { rawToDisplay } from "../../core/money/decimal";
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
  signature: string;
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

    // 4. Idempotency check: if signature is provided and already confirmed, return existing receipt
    if (input.signature) {
      const existingFromRepo = await this.repo.getTradeReceiptBySignature(input.signature);
      if (existingFromRepo) {
        return {
          status: existingFromRepo.status,
          receiptId: existingFromRepo.id,
          signature: existingFromRepo.signature,
          receipt: existingFromRepo,
        };
      }
      if (receiptsBySignatureStore.has(input.signature)) {
        const existing = receiptsBySignatureStore.get(input.signature)!;
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

    const network = input.network ?? buildIntent.network;

    // 5. Execute and confirm on-chain status (Audit Repairs 1, 6, 7)
    let isConfirmed = false;
    let failureCode: string | null = null;
    let signature = input.signature ?? "";
    let realizedTargetAmount: string | null = null;

    if (network === "mainnet") {
      if (input.signedTransaction) {
        if (!buildIntent.requestId) {
          throw new SieveAppError("TRANSACTION_FAILED", "Missing Jupiter requestId for execution");
        }
        const execResult = await this.jupiterAdapter.executeTransaction({
          signedTransaction: input.signedTransaction,
          requestId: buildIntent.requestId,
          lastValidBlockHeight: buildIntent.lastValidBlockHeight,
        });

        if (execResult.status === "Success" && execResult.signature) {
          signature = execResult.signature;
          isConfirmed = true;
          if (execResult.totalOutputAmount) {
            const targetDecimals = await this.solanaAdapter.resolveMintDecimals(check.asset.mint, "mainnet");
            realizedTargetAmount = rawToDisplay(BigInt(execResult.totalOutputAmount), targetDecimals).toString();
          } else {
            realizedTargetAmount = buildIntent.summary.expectedTargetAmount;
          }
        } else {
          isConfirmed = false;
          failureCode = execResult.error || `Execution failed (code: ${execResult.code ?? "UNKNOWN"})`;
          signature = execResult.signature || `failed-${buildIntent.id.slice(0, 8)}`;
        }
      } else if (signature) {
        const result = await this.solanaAdapter.confirmSignature(signature, "mainnet");
        isConfirmed = result.confirmed;
        if (result.err) {
          failureCode = JSON.stringify(result.err);
        }
        realizedTargetAmount = isConfirmed ? buildIntent.summary.expectedTargetAmount : null;
      } else {
        throw new SieveAppError("VALIDATION_ERROR", "Either signedTransaction or signature is required");
      }
    } else {
      // Practice / Testnet mode: accept simulated execution
      isConfirmed = true;
      signature = signature || `sim-testnet-sig-${buildIntent.id.slice(0, 8)}`;
      realizedTargetAmount = buildIntent.summary.expectedTargetAmount;
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
      targetSymbol: buildIntent.summary.targetSymbol,
      targetMint: check.asset.mint,
      expectedTargetAmount: buildIntent.summary.expectedTargetAmount,
      realizedTargetAmount: isConfirmed ? (realizedTargetAmount || buildIntent.summary.expectedTargetAmount) : null,
      referencePriceUsd: buildIntent.summary.referencePriceUsd,
      checkedBuyPriceUsd: buildIntent.summary.currentBuyPriceUsd,
      maxPremiumBps: check.maxPremiumBps,
      premiumBps: check.decision.premiumBps ?? 0,
      submittedAt: new Date().toISOString(),
      confirmedAt,
      failureCode,
    };

    // Store receipt idempotently
    const savedReceipt = await this.repo.saveTradeReceipt(receipt);
    receiptsBySignatureStore.set(signature, savedReceipt);

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

