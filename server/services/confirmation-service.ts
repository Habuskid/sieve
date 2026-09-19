import { v4 as uuidv4 } from "uuid";
import { activeBuildIntentsStore } from "./build-service";
import { activeChecksStore } from "./check-service";
import { defaultSolanaAdapter, SolanaAdapter } from "../solana/adapter";
import { getRepository } from "../database/db";
import type { ISieveRepository } from "../database/repository";
import { SieveAppError } from "./errors";
import type { TradeReceipt, NetworkMode } from "../../core/domain/types";

export interface ConfirmRequestInput {
  buildIntentId: string;
  signature: string;
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
    private repo: ISieveRepository = getRepository()
  ) {}

  async confirmTransaction(input: ConfirmRequestInput): Promise<ConfirmResponseDto> {
    // 1. Idempotency check: if already confirmed in repo or memory, return existing receipt
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

    // 2. Validate build intent exists
    const buildIntent = (await this.repo.getBuildIntent(input.buildIntentId)) ?? activeBuildIntentsStore.get(input.buildIntentId);
    if (!buildIntent) {
      throw new SieveAppError("TRANSACTION_EXPIRED", "Build intent not found or expired");
    }

    const check = (await this.repo.getPriceCheck(buildIntent.checkId)) ?? activeChecksStore.get(buildIntent.checkId);
    if (!check) {
      throw new SieveAppError("QUOTE_EXPIRED", "Associated price check not found");
    }

    const network = input.network ?? buildIntent.network;

    // 3. Confirm on-chain status
    let isConfirmed = false;
    let failureCode: string | null = null;

    if (network === "mainnet") {
      const result = await this.solanaAdapter.confirmSignature(input.signature, "mainnet");
      isConfirmed = result.confirmed;
      if (result.err) {
        failureCode = JSON.stringify(result.err);
      }
    } else {
      // Practice / Testnet mode: accept valid signature
      isConfirmed = true;
    }

    const receiptId = uuidv4();
    const confirmedAt = isConfirmed ? new Date().toISOString() : null;

    const receipt: TradeReceipt = {
      id: receiptId,
      checkId: check.id,
      buildIntentId: buildIntent.id,
      wallet: buildIntent.wallet,
      network,
      signature: input.signature,
      status: isConfirmed ? "CONFIRMED" : "FAILED",
      fundingAsset: buildIntent.summary.fundingAsset,
      fundingAmount: buildIntent.summary.fundingAmount,
      targetSymbol: buildIntent.summary.targetSymbol,
      targetMint: check.asset.mint,
      expectedTargetAmount: buildIntent.summary.expectedTargetAmount,
      realizedTargetAmount: isConfirmed ? buildIntent.summary.expectedTargetAmount : null,
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
    receiptsBySignatureStore.set(input.signature, savedReceipt);

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
