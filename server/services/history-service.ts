import { getRepository } from "../database/db";
import type { ISieveRepository, ListFilterParams } from "../database/repository";
import type { MainnetNetwork } from "../../core/domain/types";
import { SieveAppError } from "./errors";

export type HistorySide = "BUY" | "SELL";

export type HistoryItemType =
  | "TRADE_CONFIRMED"
  | "TRADE_FAILED"
  | "CHECK_BLOCKED"
  | "CHECK_PASSED";

export type HistoryItemStatus =
  | "CONFIRMED"
  | "FAILED"
  | "BLOCKED"
  | "CHECKED";

export interface HistoryBoundary {
  type: "MAX_PREMIUM" | "MAX_DISCOUNT";
  bps: number;
  pct: string;
}

export interface HistoryItem {
  id: string;
  side: HistorySide;
  type: HistoryItemType;
  kind: HistoryItemType;
  status: HistoryItemStatus;
  statusLabel: string;
  timestamp: string;
  tokenSymbol: string;
  amount: string;
  asset: {
    name: string;
    symbol: string;
    mint: string;
  };
  funding: {
    asset: string;
    amount: string;
  };
  referencePriceUsd: string;
  executionPriceUsd: string | null;
  boundary: HistoryBoundary;
  realizedBoundaryBps?: number | null;
  realizedBoundaryPct?: string | null;
  network: MainnetNetwork;
  signature?: string;
}

function mapReceiptStatus(status: "CONFIRMED" | "FAILED"): {
  type: HistoryItemType;
  kind: HistoryItemType;
  status: HistoryItemStatus;
  statusLabel: string;
} {
  if (status === "CONFIRMED") {
    return {
      type: "TRADE_CONFIRMED",
      kind: "TRADE_CONFIRMED",
      status: "CONFIRMED",
      statusLabel: "Confirmed",
    };
  }
  if (status === "FAILED") {
    return {
      type: "TRADE_FAILED",
      kind: "TRADE_FAILED",
      status: "FAILED",
      statusLabel: "Failed",
    };
  }
  throw new SieveAppError("DATABASE_INTEGRITY_ERROR", "Unexpected persisted receipt status");
}

export class HistoryService {
  constructor(private repo: ISieveRepository = getRepository()) {}

  async getUserHistory(params: {
    wallet: string;
    limit?: number;
    offset?: number;
  }): Promise<HistoryItem[]> {
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;
    // Bounded global window: fetch up to (offset + limit) newest records from each source starting at 0
    const requiredWindow = offset + limit;

    const filter: ListFilterParams = {
      wallet: params.wallet,
      network: "mainnet",
      limit: requiredWindow,
      offset: 0,
    };

    const [buyReceipts, buyChecks, sellReceipts, sellChecks] = await Promise.all([
      this.repo.listTradeReceipts(filter),
      this.repo.listPriceChecks(filter),
      this.repo.listSellTradeReceipts(filter),
      this.repo.listSellPriceChecks(filter),
    ]);

    const historyItems: HistoryItem[] = [];

    // 1. Map Buy receipts
    for (const r of buyReceipts) {
      const statusMapping = mapReceiptStatus(r.status);
      const boundaryPct = (r.maxPremiumBps / 100).toFixed(2);
      const realizedPct = (r.premiumBps / 100).toFixed(2);

      historyItems.push({
        id: r.id,
        side: "BUY",
        ...statusMapping,
        timestamp: r.confirmedAt || r.submittedAt,
        tokenSymbol: r.targetSymbol,
        amount: r.fundingAmount,
        asset: {
          name: r.targetSymbol,
          symbol: r.targetSymbol,
          mint: r.targetMint,
        },
        funding: {
          asset: r.fundingAsset,
          amount: r.fundingAmount,
        },
        referencePriceUsd: r.referencePriceUsd,
        executionPriceUsd: r.checkedBuyPriceUsd,
        boundary: {
          type: "MAX_PREMIUM",
          bps: r.maxPremiumBps,
          pct: boundaryPct,
        },
        realizedBoundaryBps: null,
        realizedBoundaryPct: null,
        network: r.network,
        signature: r.signature ?? undefined,
      });
    }

    // 2. Map Buy checks (deduplicate checks that already have a corresponding receipt)
    const buyReceiptCheckIds = new Set(buyReceipts.map((r) => r.checkId));

    for (const c of buyChecks) {
      if (buyReceiptCheckIds.has(c.id)) continue;

      const isBlocked = c.decision.status !== "GOOD_TO_GO";
      const itemType: HistoryItemType = isBlocked ? "CHECK_BLOCKED" : "CHECK_PASSED";
      const boundaryPct = c.decision.maxPremiumPct;
      const realizedPct = c.decision.premiumPct ?? null;

      historyItems.push({
        id: c.id,
        side: "BUY",
        type: itemType,
        kind: itemType,
        status: isBlocked ? "BLOCKED" : "CHECKED",
        statusLabel: isBlocked ? "Blocked" : "Checked",
        timestamp: c.createdAt,
        tokenSymbol: c.asset.symbol,
        amount: c.funding.inputDisplay,
        asset: {
          name: c.asset.name,
          symbol: c.asset.symbol,
          mint: c.asset.mint,
        },
        funding: {
          asset: c.funding.fundingAsset,
          amount: c.funding.inputDisplay,
        },
        referencePriceUsd: c.decision.referencePriceUsd,
        executionPriceUsd: c.decision.currentBuyPriceUsd,
        boundary: {
          type: "MAX_PREMIUM",
          bps: c.maxPremiumBps,
          pct: boundaryPct,
        },
        realizedBoundaryBps: c.decision.premiumBps,
        realizedBoundaryPct: realizedPct,
        network: c.network,
      });
    }

    // 3. Map Sell receipts
    for (const r of sellReceipts) {
      const statusMapping = mapReceiptStatus(r.status);
      const boundaryPct = (r.maxDiscountBps / 100).toFixed(2);
      const realizedPct = r.realizedDiscountBps != null ? (r.realizedDiscountBps / 100).toFixed(2) : null;

      historyItems.push({
        id: r.id,
        side: "SELL",
        ...statusMapping,
        timestamp: r.confirmedAt || r.submittedAt,
        tokenSymbol: r.targetSymbol,
        amount: r.requestedEconomicAmount,
        asset: {
          name: r.targetSymbol,
          symbol: r.targetSymbol,
          mint: r.targetMint,
        },
        funding: {
          asset: r.targetSymbol,
          amount: r.requestedEconomicAmount,
        },
        referencePriceUsd: r.referencePriceUsd,
        executionPriceUsd: r.checkedSellPriceUsd,
        boundary: {
          type: "MAX_DISCOUNT",
          bps: r.maxDiscountBps,
          pct: boundaryPct,
        },
        realizedBoundaryBps: r.realizedDiscountBps,
        realizedBoundaryPct: realizedPct,
        network: r.network,
        signature: r.signature ?? undefined,
      });
    }

    // 4. Map Sell checks (deduplicate sell checks that already have a corresponding sell receipt)
    const sellReceiptCheckIds = new Set(sellReceipts.map((r) => r.checkId));

    for (const c of sellChecks) {
      if (sellReceiptCheckIds.has(c.id)) continue;

      const isBlocked = c.decision.status !== "GOOD_TO_GO";
      const itemType: HistoryItemType = isBlocked ? "CHECK_BLOCKED" : "CHECK_PASSED";
      const boundaryPct = c.decision.maxDiscountPct;
      const realizedPct = c.decision.discountPct ?? null;

      historyItems.push({
        id: c.id,
        side: "SELL",
        type: itemType,
        kind: itemType,
        status: isBlocked ? "BLOCKED" : "CHECKED",
        statusLabel: isBlocked ? "Blocked" : "Checked",
        timestamp: c.createdAt,
        tokenSymbol: c.asset.symbol,
        amount: c.input.requestedEconomicAmount,
        asset: {
          name: c.asset.name,
          symbol: c.asset.symbol,
          mint: c.asset.mint,
        },
        funding: {
          asset: c.asset.symbol,
          amount: c.input.requestedEconomicAmount,
        },
        referencePriceUsd: c.decision.referencePriceUsd,
        executionPriceUsd: c.decision.currentSellPriceUsd,
        boundary: {
          type: "MAX_DISCOUNT",
          bps: c.maxDiscountBps,
          pct: boundaryPct,
        },
        realizedBoundaryBps: c.decision.discountBps,
        realizedBoundaryPct: realizedPct,
        network: c.network,
      });
    }

    // 5. Sort globally by authoritative timestamp descending
    historyItems.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // 6. Slice to global requested window
    return historyItems.slice(offset, offset + limit);
  }
}

export const defaultHistoryService = new HistoryService();
