import { getRepository } from "../database/db";
import type { ISieveRepository, ListFilterParams } from "../database/repository";
import type { NetworkMode, TradeReceipt, PriceCheck } from "../../core/domain/types";

export interface HistoryItem {
  id: string;
  type: "TRADE_CONFIRMED" | "TRADE_FAILED" | "CHECK_BLOCKED" | "CHECK_PASSED";
  timestamp: string;
  asset: {
    name: string;
    symbol: string;
    mint: string;
  };
  funding: {
    asset: string;
    amount: string;
  };
  price: {
    referenceUsd: string;
    checkedBuyUsd: string;
    premiumPct: string;
    limitPct: string;
  };
  network: NetworkMode;
  signature?: string;
  statusLabel: string;
}

export class HistoryService {
  constructor(private repo: ISieveRepository = getRepository()) {}

  async getUserHistory(params: {
    wallet: string;
    network?: NetworkMode;
    limit?: number;
    offset?: number;
  }): Promise<HistoryItem[]> {
    const filter: ListFilterParams = {
      wallet: params.wallet,
      network: params.network,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    };

    const [receipts, checks] = await Promise.all([
      this.repo.listTradeReceipts(filter),
      this.repo.listPriceChecks(filter),
    ]);

    const historyItems: HistoryItem[] = [];

    // Map receipts
    for (const r of receipts) {
      historyItems.push({
        id: r.id,
        type: r.status === "CONFIRMED" ? "TRADE_CONFIRMED" : "TRADE_FAILED",
        timestamp: r.confirmedAt || r.submittedAt,
        asset: {
          name: r.targetSymbol,
          symbol: r.targetSymbol,
          mint: r.targetMint,
        },
        funding: {
          asset: r.fundingAsset,
          amount: r.fundingAmount,
        },
        price: {
          referenceUsd: r.referencePriceUsd,
          checkedBuyUsd: r.checkedBuyPriceUsd,
          premiumPct: (r.premiumBps / 100).toFixed(2),
          limitPct: (r.maxPremiumBps / 100).toFixed(2),
        },
        network: r.network,
        signature: r.signature,
        statusLabel: r.status === "CONFIRMED" ? "Bought" : "Failed",
      });
    }

    // Map checks (only include blocked or unexecuted checks so receipts aren't duplicated)
    const receiptCheckIds = new Set(receipts.map((r) => r.checkId));

    for (const c of checks) {
      if (receiptCheckIds.has(c.id)) continue; // Already shown as trade

      const isBlocked = c.decision.status !== "GOOD_TO_GO";
      historyItems.push({
        id: c.id,
        type: isBlocked ? "CHECK_BLOCKED" : "CHECK_PASSED",
        timestamp: c.createdAt,
        asset: {
          name: c.asset.name,
          symbol: c.asset.symbol,
          mint: c.asset.mint,
        },
        funding: {
          asset: c.funding.fundingAsset,
          amount: c.funding.inputDisplay,
        },
        price: {
          referenceUsd: c.decision.referencePriceUsd,
          checkedBuyUsd: c.decision.currentBuyPriceUsd || "—",
          premiumPct: c.decision.premiumPct || "—",
          limitPct: c.decision.maxPremiumPct,
        },
        network: c.network,
        statusLabel: isBlocked ? "Blocked" : "Checked",
      });
    }

    // Sort by timestamp descending
    historyItems.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return historyItems.slice(0, params.limit ?? 50);
  }
}

export const defaultHistoryService = new HistoryService();
