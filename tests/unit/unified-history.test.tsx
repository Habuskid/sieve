import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import "@testing-library/jest-dom/vitest";

import { InMemorySieveRepository } from "@/server/database/repository";
import { HistoryService } from "@/server/services/history-service";
import { HistoryView } from "@/components/history/history-view";
import type { PriceCheck, TradeReceipt } from "@/core/domain/types";
import type { SellPriceCheck, SellTradeReceipt } from "@/core/domain/sell-types";

// Mocks for Wallet & Navigation
let mockConnected = false;
let mockPublicKey: { toBase58: () => string } | null = null;
const mockDisconnect = vi.fn().mockResolvedValue(undefined);
const mockReplace = vi.fn();
const mockPush = vi.fn();
const mockSetVisible = vi.fn();

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({
    connected: mockConnected,
    publicKey: mockPublicKey,
    disconnect: mockDisconnect,
    connecting: false,
  }),
}));

vi.mock("@solana/wallet-adapter-react-ui", () => ({
  useWalletModal: () => ({
    setVisible: mockSetVisible,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/history",
}));

const WALLET_A = "WalletA1111111111111111111111111111111111111";
const WALLET_B = "WalletB2222222222222222222222222222222222222";

describe("FINAL HISTORY CORRECTNESS PASS — COMPREHENSIVE SUITE", () => {
  let repo: InMemorySieveRepository;
  let service: HistoryService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnected = true;
    mockPublicKey = { toBase58: () => WALLET_A };

    repo = new InMemorySieveRepository();
    service = new HistoryService(repo);

    globalThis.fetch = vi.fn();
  });

  // Helper test data generators
  function makeBuyCheck(
    id: string,
    wallet: string,
    time: string,
    status: "GOOD_TO_GO" | "PRICE_TOO_HIGH" = "GOOD_TO_GO"
  ): PriceCheck {
    return {
      id,
      network: "mainnet",
      wallet,
      clientIntentVersion: "1.0",
      asset: {
        name: "OpenAI PreStock",
        symbol: "OPENAI",
        mint: "mint-openai",
        imageUrl: null,
        productUrl: null,
        referencePriceUsd: "500.00",
        tokenPriceUsd: null,
        referenceValuationUsd: null,
        impliedValuationUsd: null,
        supply: null,
        source: "PRESTOCKS",
        observedAt: time,
        network: "mainnet",
      },
      funding: {
        fundingAsset: "USDC",
        inputRaw: BigInt(50000000),
        inputDisplay: "50.00",
        inputUsdValue: "50.00",
        method: "USDC_PAR",
        observedAt: time,
      },
      quote: null,
      maxPremiumPct: "5.00",
      maxPremiumBps: 500,
      decision: {
        status,
        isExecutable: status === "GOOD_TO_GO",
        referencePriceUsd: "500.00",
        currentBuyPriceUsd: status === "GOOD_TO_GO" ? "510.00" : "540.00",
        maximumBuyPriceUsd: "525.00",
        premiumPct: status === "GOOD_TO_GO" ? "2.00" : "8.00",
        maxPremiumPct: "5.00",
        premiumBps: status === "GOOD_TO_GO" ? 200 : 800,
        maxPremiumBps: 500,
        differenceUsd: null,
        displayTitle: status === "GOOD_TO_GO" ? "Within boundary" : "Outside boundary",
        displayMessage: "",
      },
      createdAt: time,
      expiresAt: time,
    };
  }

  function makeSellCheck(
    id: string,
    wallet: string,
    time: string,
    status: "GOOD_TO_GO" | "PRICE_TOO_LOW" = "GOOD_TO_GO"
  ): SellPriceCheck {
    return {
      id,
      network: "mainnet",
      wallet,
      clientIntentVersion: "1.0",
      asset: {
        name: "SpaceX PreStock",
        symbol: "SPACEX",
        mint: "mint-spacex",
        imageUrl: null,
        productUrl: null,
        referencePriceUsd: "200.00",
        tokenPriceUsd: null,
        referenceValuationUsd: null,
        impliedValuationUsd: null,
        supply: null,
        source: "PRESTOCKS",
        observedAt: time,
        network: "mainnet",
      },
      input: {
        requestedEconomicAmount: "1.500000",
        actualEconomicAmount: "1.500000",
        rawWalletInput: BigInt(1500000000),
        rawTransferFee: BigInt(0),
        rawRouteInput: BigInt(1500000000),
        decimals: 9,
        activeMultiplier: "1",
      },
      expectedUsdcProceedsRaw: BigInt(294000000),
      expectedUsdcProceeds: "294.00",
      priceImpactPct: "0.10",
      routeFingerprint: "rfp-sell",
      maxDiscountPct: "4.00",
      maxDiscountBps: 400,
      decision: {
        status,
        isExecutable: status === "GOOD_TO_GO",
        referencePriceUsd: "200.00",
        currentSellPriceUsd: status === "GOOD_TO_GO" ? "196.00" : "185.00",
        minimumSellPriceUsd: "192.00",
        discountPct: status === "GOOD_TO_GO" ? "2.00" : "7.50",
        maxDiscountPct: "4.00",
        discountBps: status === "GOOD_TO_GO" ? 200 : 750,
        maxDiscountBps: 400,
        differenceUsd: null,
        displayTitle: status === "GOOD_TO_GO" ? "Within boundary" : "Outside boundary",
        displayMessage: "",
      },
      source: "JUPITER",
      createdAt: time,
      expiresAt: time,
    };
  }

  function makeBuyReceipt(
    id: string,
    checkId: string,
    wallet: string,
    time: string,
    status: "CONFIRMED" | "FAILED" = "CONFIRMED"
  ): TradeReceipt {
    return {
      id,
      checkId,
      buildIntentId: `build-${id}`,
      wallet,
      network: "mainnet",
      signature: status !== "FAILED" ? `sig-buy-${id}` : null,
      internalExecutionId: `exec-${id}`,
      status,
      fundingAsset: "USDC",
      fundingAmount: "100.00",
      requestedFundingAmount: "100.00",
      actualFundingAmount: "100.00",
      targetSymbol: "OPENAI",
      targetMint: "mint-openai",
      expectedTargetAmount: "0.196",
      realizedTargetAmount: status === "CONFIRMED" ? "0.196" : null,
      referencePriceUsd: "500.00",
      checkedBuyPriceUsd: "510.00",
      maxPremiumBps: 500,
      premiumBps: 200,
      submittedAt: time,
      confirmedAt: status === "CONFIRMED" ? time : null,
    };
  }

  function makeSellReceipt(
    id: string,
    checkId: string,
    wallet: string,
    time: string,
    status: "CONFIRMED" | "FAILED" = "CONFIRMED"
  ): SellTradeReceipt {
    return {
      id,
      side: "SELL",
      checkId,
      buildIntentId: `build-sell-${id}`,
      wallet,
      network: "mainnet",
      signature: status !== "FAILED" ? `sig-sell-${id}` : null,
      internalExecutionId: `exec-sell-${id}`,
      status,
      targetSymbol: "SPACEX",
      targetMint: "mint-spacex",
      requestedEconomicAmount: "2.000000",
      actualEconomicInput: "2.000000",
      rawInput: "2000000000",
      expectedUsdcProceeds: "392.00",
      realizedUsdcProceeds: status === "CONFIRMED" ? "392.00" : null,
      referencePriceUsd: "200.00",
      checkedSellPriceUsd: "196.00",
      minimumSellPriceUsd: "192.00",
      maxDiscountBps: 400,
      realizedDiscountBps: status === "CONFIRMED" ? 200 : null,
      submittedAt: time,
      confirmedAt: status === "CONFIRMED" ? time : null,
    };
  }

  // --- SECTION 1: RECEIPT STATUS CLASSIFICATION ---
  describe("1. Receipt Status Classification (Audit & Objective Mapping)", () => {
    it("maps CONFIRMED Buy receipt to TRADE_CONFIRMED with statusLabel 'Confirmed'", async () => {
      await repo.saveTradeReceipt(makeBuyReceipt("r-buy-c", "c1", WALLET_A, "2026-09-23T10:00:00.000Z", "CONFIRMED"));
      const items = await service.getUserHistory({ wallet: WALLET_A });
      expect(items[0].type).toBe("TRADE_CONFIRMED");
      expect(items[0].status).toBe("CONFIRMED");
      expect(items[0].statusLabel).toBe("Confirmed");
    });

    it("maps FAILED Buy receipt to TRADE_FAILED with statusLabel 'Failed'", async () => {
      await repo.saveTradeReceipt(makeBuyReceipt("r-buy-f", "c2", WALLET_A, "2026-09-23T10:00:00.000Z", "FAILED"));
      const items = await service.getUserHistory({ wallet: WALLET_A });
      expect(items[0].type).toBe("TRADE_FAILED");
      expect(items[0].status).toBe("FAILED");
      expect(items[0].statusLabel).toBe("Failed");
    });

    it("maps CONFIRMED Sell receipt to TRADE_CONFIRMED with statusLabel 'Confirmed'", async () => {
      await repo.saveSellTradeReceipt(makeSellReceipt("r-sell-c", "c4", WALLET_A, "2026-09-23T10:00:00.000Z", "CONFIRMED"));
      const items = await service.getUserHistory({ wallet: WALLET_A });
      expect(items[0].type).toBe("TRADE_CONFIRMED");
      expect(items[0].status).toBe("CONFIRMED");
      expect(items[0].statusLabel).toBe("Confirmed");
    });

    it("maps FAILED Sell receipt to TRADE_FAILED with statusLabel 'Failed'", async () => {
      await repo.saveSellTradeReceipt(makeSellReceipt("r-sell-f", "c5", WALLET_A, "2026-09-23T10:00:00.000Z", "FAILED"));
      const items = await service.getUserHistory({ wallet: WALLET_A });
      expect(items[0].type).toBe("TRADE_FAILED");
      expect(items[0].status).toBe("FAILED");
      expect(items[0].statusLabel).toBe("Failed");
    });

  });

  // --- SECTION 2: SIDE-NEUTRAL CANONICAL MODEL ---
  describe("2. Side-Neutral Canonical Model (No Buy-Specific Fields on Sell)", () => {
    it("exposes side-neutral fields on Buy check and receipt", async () => {
      await repo.savePriceCheck(makeBuyCheck("bc1", WALLET_A, "2026-09-23T10:00:00.000Z"));
      await repo.saveTradeReceipt(makeBuyReceipt("br1", "bc1-other", WALLET_A, "2026-09-23T10:05:00.000Z"));

      const items = await service.getUserHistory({ wallet: WALLET_A });
      const receipt = items[0];
      const check = items[1];

      // Buy Receipt
      expect(receipt.side).toBe("BUY");
      expect(receipt.executionPriceUsd).toBe("510.00");
      expect(receipt.boundary).toEqual({
        type: "MAX_PREMIUM",
        bps: 500,
        pct: "5.00",
      });
      expect(receipt.realizedBoundaryBps).toBe(200);
      expect(receipt.realizedBoundaryPct).toBe("2.00");

      // Buy Check
      expect(check.side).toBe("BUY");
      expect(check.executionPriceUsd).toBe("510.00");
      expect(check.boundary).toEqual({
        type: "MAX_PREMIUM",
        bps: 500,
        pct: "5.00",
      });
      expect(check.realizedBoundaryBps).toBe(200);
      expect(check.realizedBoundaryPct).toBe("2.00");
    });

    it("exposes side-neutral fields on Sell check and receipt without encoding into buy-specific names", async () => {
      await repo.saveSellPriceCheck(makeSellCheck("sc1", WALLET_A, "2026-09-23T10:00:00.000Z"));
      await repo.saveSellTradeReceipt(makeSellReceipt("sr1", "sc1-other", WALLET_A, "2026-09-23T10:05:00.000Z"));

      const items = await service.getUserHistory({ wallet: WALLET_A });
      const receipt = items[0];
      const check = items[1];

      // Sell Receipt
      expect(receipt.side).toBe("SELL");
      expect(receipt.executionPriceUsd).toBe("196.00");
      expect(receipt.boundary).toEqual({
        type: "MAX_DISCOUNT",
        bps: 400,
        pct: "4.00",
      });
      expect(receipt.realizedBoundaryBps).toBe(200);
      expect(receipt.realizedBoundaryPct).toBe("2.00");
      expect(receipt.funding.asset).toBe("SPACEX");
      expect(receipt.funding.amount).toBe("2.000000");

      // Sell Check
      expect(check.side).toBe("SELL");
      expect(check.executionPriceUsd).toBe("196.00");
      expect(check.boundary).toEqual({
        type: "MAX_DISCOUNT",
        bps: 400,
        pct: "4.00",
      });
      expect(check.realizedBoundaryBps).toBe(200);
      expect(check.realizedBoundaryPct).toBe("2.00");
      expect(check.funding.asset).toBe("SPACEX");
      expect(check.funding.amount).toBe("1.500000");
    });
  });

  // --- SECTION 3: DEDUPLICATION AUDIT ---
  describe("3. Deduplication Audit (One Lifecycle Representation Per Check/Receipt)", () => {
    it("deduplicates Buy check when receipt is CONFIRMED", async () => {
      await repo.savePriceCheck(makeBuyCheck("check-b-conf", WALLET_A, "2026-09-23T10:00:00.000Z"));
      await repo.saveTradeReceipt(makeBuyReceipt("r-b-conf", "check-b-conf", WALLET_A, "2026-09-23T10:01:00.000Z", "CONFIRMED"));

      const items = await service.getUserHistory({ wallet: WALLET_A });
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe("r-b-conf");
      expect(items[0].status).toBe("CONFIRMED");
    });

    it("deduplicates Buy check when receipt is FAILED", async () => {
      await repo.savePriceCheck(makeBuyCheck("check-b-fail", WALLET_A, "2026-09-23T10:00:00.000Z"));
      await repo.saveTradeReceipt(makeBuyReceipt("r-b-fail", "check-b-fail", WALLET_A, "2026-09-23T10:01:00.000Z", "FAILED"));

      const items = await service.getUserHistory({ wallet: WALLET_A });
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe("r-b-fail");
      expect(items[0].status).toBe("FAILED");
    });

    it("deduplicates Sell check when receipt is CONFIRMED", async () => {
      await repo.saveSellPriceCheck(makeSellCheck("check-s-conf", WALLET_A, "2026-09-23T10:00:00.000Z"));
      await repo.saveSellTradeReceipt(makeSellReceipt("r-s-conf", "check-s-conf", WALLET_A, "2026-09-23T10:01:00.000Z", "CONFIRMED"));

      const items = await service.getUserHistory({ wallet: WALLET_A });
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe("r-s-conf");
      expect(items[0].status).toBe("CONFIRMED");
    });

    it("deduplicates Sell check when receipt is FAILED", async () => {
      await repo.saveSellPriceCheck(makeSellCheck("check-s-fail", WALLET_A, "2026-09-23T10:00:00.000Z"));
      await repo.saveSellTradeReceipt(makeSellReceipt("r-s-fail", "check-s-fail", WALLET_A, "2026-09-23T10:01:00.000Z", "FAILED"));

      const items = await service.getUserHistory({ wallet: WALLET_A });
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe("r-s-fail");
      expect(items[0].status).toBe("FAILED");
    });

    it("retains unexecuted and blocked checks when no receipt exists", async () => {
      await repo.savePriceCheck(makeBuyCheck("check-unexec", WALLET_A, "2026-09-23T10:00:00.000Z", "GOOD_TO_GO"));
      await repo.saveSellPriceCheck(makeSellCheck("check-blocked", WALLET_A, "2026-09-23T10:01:00.000Z", "PRICE_TOO_LOW"));

      const items = await service.getUserHistory({ wallet: WALLET_A });
      expect(items).toHaveLength(2);
      expect(items.map((i) => i.id)).toEqual(["check-blocked", "check-unexec"]);
      expect(items[0].status).toBe("BLOCKED");
      expect(items[1].status).toBe("CHECKED");
    });
  });

  // --- SECTION 4: ADVERSARIAL PAGINATION TESTS ---
  describe("4. Adversarial Interleaved Pagination", () => {
    it("pages past five receipt-shadowed checks to five older standalone checks", async () => {
      for (let i = 1; i <= 10; i++) {
        const checkTime = new Date(Date.UTC(2026, 8, 23, 10, i)).toISOString();
        await repo.savePriceCheck(makeBuyCheck(`C${i}`, WALLET_A, checkTime));
        if (i >= 6) {
          const receiptTime = new Date(Date.UTC(2026, 8, 23, 11, i)).toISOString();
          await repo.saveTradeReceipt(makeBuyReceipt(`R${i}`, `C${i}`, WALLET_A, receiptTime));
        }
      }

      const firstPage = await service.getUserHistory({ wallet: WALLET_A, limit: 5, offset: 0 });
      const secondPage = await service.getUserHistory({ wallet: WALLET_A, limit: 5, offset: 5 });

      expect(firstPage.map((item) => item.id)).toEqual(["R10", "R9", "R8", "R7", "R6"]);
      expect(secondPage.map((item) => item.id)).toEqual(["C5", "C4", "C3", "C2", "C1"]);
      expect(new Set([...firstPage, ...secondPage].map((item) => item.id)).size).toBe(10);
      expect([...firstPage, ...secondPage].every((item) => !["C10", "C9", "C8", "C7", "C6"].includes(item.id))).toBe(true);
      expect(firstPage[4].timestamp > secondPage[0].timestamp).toBe(true);
    });

    it("correctly pages across 10 strictly interleaved sources: limit=3 across offsets 0, 3, 6, 9", async () => {
      // Intentionally interleaved timestamps:
      // T10 (Buy check)
      // T9  (Sell receipt)
      // T8  (Sell check)
      // T7  (Buy receipt)
      // T6  (Buy check)
      // T5  (Sell receipt)
      // T4  (Sell check)
      // T3  (Buy receipt)
      // T2  (Sell check)
      // T1  (Buy check)

      await repo.savePriceCheck(makeBuyCheck("T1", WALLET_A, "2026-09-23T10:01:00.000Z"));
      await repo.saveSellPriceCheck(makeSellCheck("T2", WALLET_A, "2026-09-23T10:02:00.000Z"));
      await repo.saveTradeReceipt(makeBuyReceipt("T3", "orig-3", WALLET_A, "2026-09-23T10:03:00.000Z"));
      await repo.saveSellPriceCheck(makeSellCheck("T4", WALLET_A, "2026-09-23T10:04:00.000Z"));
      await repo.saveSellTradeReceipt(makeSellReceipt("T5", "orig-5", WALLET_A, "2026-09-23T10:05:00.000Z"));
      await repo.savePriceCheck(makeBuyCheck("T6", WALLET_A, "2026-09-23T10:06:00.000Z"));
      await repo.saveTradeReceipt(makeBuyReceipt("T7", "orig-7", WALLET_A, "2026-09-23T10:07:00.000Z"));
      await repo.saveSellPriceCheck(makeSellCheck("T8", WALLET_A, "2026-09-23T10:08:00.000Z"));
      await repo.saveSellTradeReceipt(makeSellReceipt("T9", "orig-9", WALLET_A, "2026-09-23T10:09:00.000Z"));
      await repo.savePriceCheck(makeBuyCheck("T10", WALLET_A, "2026-09-23T10:10:00.000Z"));

      // Page 1: limit=3 offset=0 -> T10, T9, T8
      const page1 = await service.getUserHistory({ wallet: WALLET_A, limit: 3, offset: 0 });
      expect(page1.map((i) => i.id)).toEqual(["T10", "T9", "T8"]);

      // Page 2: limit=3 offset=3 -> T7, T6, T5
      const page2 = await service.getUserHistory({ wallet: WALLET_A, limit: 3, offset: 3 });
      expect(page2.map((i) => i.id)).toEqual(["T7", "T6", "T5"]);

      // Page 3: limit=3 offset=6 -> T4, T3, T2
      const page3 = await service.getUserHistory({ wallet: WALLET_A, limit: 3, offset: 6 });
      expect(page3.map((i) => i.id)).toEqual(["T4", "T3", "T2"]);

      // Page 4: limit=3 offset=9 -> T1
      const page4 = await service.getUserHistory({ wallet: WALLET_A, limit: 3, offset: 9 });
      expect(page4.map((i) => i.id)).toEqual(["T1"]);
    });

    it("proves a large volume of records from one source does not distort global offset when another source has interspersed records", async () => {
      // 15 Buy checks (T1..T15)
      for (let i = 1; i <= 15; i++) {
        const time = new Date(1790000000000 + i * 1000).toISOString();
        await repo.savePriceCheck(makeBuyCheck(`buy-bulk-${i}`, WALLET_A, time));
      }

      // 2 Sell receipts at T8.5 and T14.5
      await repo.saveSellTradeReceipt(makeSellReceipt("sell-interspersed-1", "s1", WALLET_A, new Date(1790000000000 + 8500).toISOString()));
      await repo.saveSellTradeReceipt(makeSellReceipt("sell-interspersed-2", "s2", WALLET_A, new Date(1790000000000 + 14500).toISOString()));

      // Total records = 17
      // Expected order:
      // buy-bulk-15 (15000)
      // sell-interspersed-2 (14500)
      // buy-bulk-14 (14000)
      // buy-bulk-13 (13000)
      // buy-bulk-12 (12000)
      // buy-bulk-11 (11000)
      // buy-bulk-10 (10000)
      // buy-bulk-9  (9000)
      // sell-interspersed-1 (8500)
      // buy-bulk-8  (8000)
      // ...

      const p1 = await service.getUserHistory({ wallet: WALLET_A, limit: 3, offset: 0 });
      expect(p1.map((i) => i.id)).toEqual(["buy-bulk-15", "sell-interspersed-2", "buy-bulk-14"]);

      const p2 = await service.getUserHistory({ wallet: WALLET_A, limit: 3, offset: 3 });
      expect(p2.map((i) => i.id)).toEqual(["buy-bulk-13", "buy-bulk-12", "buy-bulk-11"]);

      const p3 = await service.getUserHistory({ wallet: WALLET_A, limit: 3, offset: 6 });
      expect(p3.map((i) => i.id)).toEqual(["buy-bulk-10", "buy-bulk-9", "sell-interspersed-1"]);
    });
  });

  // --- SECTION 5: WALLET ISOLATION SECURITY ---
  describe("5. Wallet Isolation Security", () => {
    it("guarantees complete isolation between Wallet A and Wallet B across all four sources", async () => {
      await repo.savePriceCheck(makeBuyCheck("buy-check-a", WALLET_A, "2026-09-23T10:00:00.000Z"));
      await repo.saveTradeReceipt(makeBuyReceipt("buy-rec-a", "ca", WALLET_A, "2026-09-23T10:01:00.000Z"));
      await repo.saveSellPriceCheck(makeSellCheck("sell-check-a", WALLET_A, "2026-09-23T10:02:00.000Z"));
      await repo.saveSellTradeReceipt(makeSellReceipt("sell-rec-a", "csa", WALLET_A, "2026-09-23T10:03:00.000Z"));

      await repo.savePriceCheck(makeBuyCheck("buy-check-b", WALLET_B, "2026-09-23T10:00:00.000Z"));
      await repo.saveTradeReceipt(makeBuyReceipt("buy-rec-b", "cb", WALLET_B, "2026-09-23T10:01:00.000Z"));
      await repo.saveSellPriceCheck(makeSellCheck("sell-check-b", WALLET_B, "2026-09-23T10:02:00.000Z"));
      await repo.saveSellTradeReceipt(makeSellReceipt("sell-rec-b", "csb", WALLET_B, "2026-09-23T10:03:00.000Z"));

      const historyA = await service.getUserHistory({ wallet: WALLET_A });
      const historyB = await service.getUserHistory({ wallet: WALLET_B });

      expect(historyA).toHaveLength(4);
      expect(historyB).toHaveLength(4);

      expect(historyA.every((i) => i.id.endsWith("-a"))).toBe(true);
      expect(historyB.every((i) => i.id.endsWith("-b"))).toBe(true);
      expect(historyA.some((i) => i.id.endsWith("-b"))).toBe(false);
      expect(historyB.some((i) => i.id.endsWith("-a"))).toBe(false);
    });
  });

  // --- SECTION 6: UI RENDERING & FILTERING ---
  describe("6. UI Rendering & Filtering Correctness", () => {
    it("renders failed execution in Executions and excludes checks", async () => {
      const items = [
        {
          id: "failed-1",
          side: "BUY" as const,
          type: "TRADE_FAILED" as const,
          kind: "TRADE_FAILED" as const,
          status: "FAILED" as const,
          statusLabel: "Failed",
          timestamp: "2026-09-23T10:00:00.000Z",
          tokenSymbol: "OPENAI",
          amount: "50.00",
          asset: { name: "OpenAI PreStock", symbol: "OPENAI", mint: "m1" },
          funding: { asset: "USDC", amount: "50.00" },
          referencePriceUsd: "500.00",
          executionPriceUsd: "510.00",
          boundary: { type: "MAX_PREMIUM" as const, bps: 500, pct: "5.00" },
          realizedBoundaryBps: 200,
          realizedBoundaryPct: "2.00",
          network: "mainnet" as const,
          signature: "5VERv8NMvzbJMEdV8xnrLkEaMaWRqfZ8xTuU8xnrLkEaMaWRqfZ8xTuU8xnrLkEaMaWRqfZ8xTuU8xnrLkEaMaWR",
        },
        {
          id: "check-1",
          side: "SELL" as const,
          type: "CHECK_PASSED" as const,
          kind: "CHECK_PASSED" as const,
          status: "CHECKED" as const,
          statusLabel: "Checked",
          timestamp: "2026-09-23T10:05:00.000Z",
          tokenSymbol: "SPACEX",
          amount: "2.00",
          asset: { name: "SpaceX PreStock", symbol: "SPACEX", mint: "m2" },
          funding: { asset: "SPACEX", amount: "2.00" },
          referencePriceUsd: "200.00",
          executionPriceUsd: "196.00",
          boundary: { type: "MAX_DISCOUNT" as const, bps: 400, pct: "4.00" },
          realizedBoundaryBps: 200,
          realizedBoundaryPct: "2.00",
          network: "mainnet" as const,
        },
      ];

      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items }),
      });

      render(<HistoryView />);

      await waitFor(() => {
        expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Checked").length).toBeGreaterThan(0);
      });

      // Filter by Executions -> Failed receipt must be present, Check must be absent
      const execTab = screen.getByRole("tab", { name: "Executions" });
      fireEvent.click(execTab);

      expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
      expect(screen.queryByText("Checked")).not.toBeInTheDocument();

      // Filter by Boundary checks -> Check must be present, Failed receipt must be absent
      const checkTab = screen.getByRole("tab", { name: "Boundary checks" });
      fireEvent.click(checkTab);

      expect(screen.getAllByText("Checked").length).toBeGreaterThan(0);
      expect(screen.queryByText("Failed")).not.toBeInTheDocument();
    });

    it("renders side-neutral boundary labels: Max +5.00% for Buy and Max discount 4.00% for Sell", async () => {
      const items = [
        {
          id: "buy-item",
          side: "BUY" as const,
          type: "TRADE_CONFIRMED" as const,
          kind: "TRADE_CONFIRMED" as const,
          status: "CONFIRMED" as const,
          statusLabel: "Confirmed",
          timestamp: "2026-09-23T10:00:00.000Z",
          tokenSymbol: "OPENAI",
          amount: "50.00",
          asset: { name: "OpenAI PreStock", symbol: "OPENAI", mint: "m1" },
          funding: { asset: "USDC", amount: "50.00" },
          referencePriceUsd: "500.00",
          executionPriceUsd: "510.00",
          boundary: { type: "MAX_PREMIUM" as const, bps: 500, pct: "5.00" },
          realizedBoundaryBps: 200,
          realizedBoundaryPct: "2.00",
          network: "mainnet" as const,
        },
        {
          id: "sell-item",
          side: "SELL" as const,
          type: "TRADE_CONFIRMED" as const,
          kind: "TRADE_CONFIRMED" as const,
          status: "CONFIRMED" as const,
          statusLabel: "Confirmed",
          timestamp: "2026-09-23T10:05:00.000Z",
          tokenSymbol: "SPACEX",
          amount: "2.00",
          asset: { name: "SpaceX PreStock", symbol: "SPACEX", mint: "m2" },
          funding: { asset: "SPACEX", amount: "2.00" },
          referencePriceUsd: "200.00",
          executionPriceUsd: "196.00",
          boundary: { type: "MAX_DISCOUNT" as const, bps: 400, pct: "4.00" },
          realizedBoundaryBps: 200,
          realizedBoundaryPct: "2.00",
          network: "mainnet" as const,
        },
      ];

      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items }),
      });

      render(<HistoryView />);

      await waitFor(() => {
        expect(screen.getAllByText(/Max \+5\.00%/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Max discount 4\.00%/).length).toBeGreaterThan(0);
      });
    });
  });
});
