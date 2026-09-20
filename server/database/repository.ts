import type {
  PriceCheck,
  BuildIntent,
  TradeReceipt,
  NetworkMode,
} from "../../core/domain/types";
import { SieveAppError } from "../services/errors";

export interface ListFilterParams {
  wallet?: string;
  network?: NetworkMode;
  limit?: number;
  offset?: number;
}

export interface ISieveRepository {
  savePriceCheck(check: PriceCheck): Promise<void>;
  getPriceCheck(id: string): Promise<PriceCheck | null>;
  listPriceChecks(params?: ListFilterParams): Promise<PriceCheck[]>;

  saveBuildIntent(intent: BuildIntent): Promise<void>;
  getBuildIntent(id: string): Promise<BuildIntent | null>;

  saveTradeReceipt(receipt: TradeReceipt): Promise<TradeReceipt>;
  getTradeReceiptBySignature(signature: string): Promise<TradeReceipt | null>;
  listTradeReceipts(params?: ListFilterParams): Promise<TradeReceipt[]>;
  clear?(): void | Promise<void>;
}

export class InMemorySieveRepository implements ISieveRepository {
  private checks = new Map<string, PriceCheck>();
  private buildIntents = new Map<string, BuildIntent>();
  private receipts = new Map<string, TradeReceipt>(); // Keyed by signature
  private receiptsById = new Map<string, TradeReceipt>();

  async savePriceCheck(check: PriceCheck): Promise<void> {
    this.checks.set(check.id, { ...check });
  }

  async getPriceCheck(id: string): Promise<PriceCheck | null> {
    const found = this.checks.get(id);
    return found ? { ...found } : null;
  }

  async listPriceChecks(params: ListFilterParams = {}): Promise<PriceCheck[]> {
    let list = Array.from(this.checks.values());
    if (params.network) {
      list = list.filter((c) => c.network === params.network);
    }
    if (params.wallet) {
      list = list.filter((c) => c.wallet === params.wallet);
    }
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 50;
    return list.slice(offset, offset + limit);
  }

  async saveBuildIntent(intent: BuildIntent): Promise<void> {
    this.buildIntents.set(intent.id, { ...intent });
  }

  async getBuildIntent(id: string): Promise<BuildIntent | null> {
    const found = this.buildIntents.get(id);
    return found ? { ...found } : null;
  }

  async saveTradeReceipt(receipt: TradeReceipt): Promise<TradeReceipt> {
    // Idempotency: if signature already exists, verify consistency or reject
    if (receipt.signature && this.receipts.has(receipt.signature)) {
      const existing = this.receipts.get(receipt.signature)!;
      if (
        existing.buildIntentId !== receipt.buildIntentId ||
        existing.checkId !== receipt.checkId ||
        existing.wallet !== receipt.wallet ||
        existing.network !== receipt.network
      ) {
        throw new SieveAppError(
          "IDEMPOTENCY_VIOLATION",
          "Signature belongs to a different trade receipt or build intent"
        );
      }
      return { ...existing };
    }
    const cloned = { ...receipt };
    if (receipt.signature) {
      this.receipts.set(receipt.signature, cloned);
    }
    this.receiptsById.set(receipt.id, cloned);
    return cloned;
  }

  async getTradeReceiptBySignature(signature: string): Promise<TradeReceipt | null> {
    const found = this.receipts.get(signature);
    return found ? { ...found } : null;
  }

  async listTradeReceipts(params: ListFilterParams = {}): Promise<TradeReceipt[]> {
    let list = Array.from(this.receiptsById.values());
    if (params.network) {
      list = list.filter((r) => r.network === params.network);
    }
    if (params.wallet) {
      list = list.filter((r) => r.wallet === params.wallet);
    }
    list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 50;
    return list.slice(offset, offset + limit);
  }

  clear(): void {
    this.checks.clear();
    this.buildIntents.clear();
    this.receipts.clear();
    this.receiptsById.clear();
  }
}
