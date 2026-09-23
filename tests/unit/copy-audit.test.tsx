import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { BuyView } from "@/components/buy/buy-view";
import { StateBanner } from "@/components/buy/state-banner";
import { ReviewDialog } from "@/components/receipt/review-dialog";
import { TradeReceiptView } from "@/components/receipt/trade-receipt-view";
import { SearchFilter } from "@/components/markets/search-filter";
import { PreferencesView } from "@/components/preferences/preferences-view";
import { ERROR_REGISTRY } from "@/server/services/errors";
import type { TradeReceipt } from "@/core/domain/types";
import type { SellTradeReceipt } from "@/core/domain/sell-types";
import "@testing-library/jest-dom/vitest";

// Mocks for Wallet & Navigation
let mockConnected = true;
let mockPublicKey: { toBase58: () => string } | null = {
  toBase58: () => "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
};
let mockSignTransaction = vi.fn().mockImplementation(async (tx) => tx);
const mockSetVisible = vi.fn();

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({
    connected: mockConnected,
    publicKey: mockPublicKey,
    signTransaction: mockSignTransaction,
  }),
}));

vi.mock("@solana/wallet-adapter-react-ui", () => ({
  useWalletModal: () => ({
    setVisible: mockSetVisible,
  }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === "mint" ? "PreStocksOpenAIMint111111111111111111111111" : null),
  }),
}));

const mockMarkets = [
  {
    name: "OpenAI",
    symbol: "OPENAI",
    mint: "PreStocksOpenAIMint111111111111111111111111",
    referencePriceUsd: "500.00",
    status: "ACTIVE",
  },
];

const forbiddenAdvisoryWords = [
  "safe",
  "unsafe",
  "recommended",
  "recommendation",
  "recommend",
  "suggested",
  "good price",
  "bad price",
  "good trade",
  "bad trade",
  "fair price",
  "fair value",
  "overvalued",
  "undervalued",
  "too expensive",
  "opportunity",
  "should buy",
  "should sell",
  "buy now",
  "sell now",
  "wait for a better price",
  "conservative",
  "balanced",
  "aggressive",
  "risk profile",
  "risk tolerance",
  "low risk",
  "high risk",
  "smart amount",
  "ideal amount",
  "best amount",
  "optimal amount",
];

describe("TASK 10 - Non-Advisory Copy Audit (15 Required Proofs)", () => {
  let fetchSpy: any;

  beforeEach(() => {
    mockConnected = true;
    mockPublicKey = { toBase58: () => "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" };
    mockSignTransaction = vi.fn().mockImplementation(async (tx) => tx);
    mockSetVisible.mockClear();

    fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/markets")) {
        return {
          ok: true,
          json: async () => ({ markets: mockMarkets }),
        } as any;
      }
      return {
        ok: true,
        json: async () => ({}),
      } as any;
    });
  });

  // Proof 1: BUY full-pass UI uses: "Within boundary"
  it("Proof 1: BUY full-pass UI uses 'Within boundary'", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/markets")) {
        return { ok: true, json: async () => ({ markets: mockMarkets }) } as any;
      }
      if (urlStr.includes("/api/capacity/buy")) {
        return {
          ok: true,
          json: async () => ({
            side: "BUY",
            asset: { name: "OpenAI", symbol: "OPENAI", mint: "PreStocksOpenAIMint111111111111111111111111" },
            fundingAsset: "USDC",
            requestedAmount: "1000",
            status: "FULLY_WITHIN_BOUNDARY",
            checkId: "check-123",
            verifiedCapacity: {
              fundingAmount: "1000",
              effectiveBuyPriceUsd: "510.00",
              expectedTargetAmount: "1.96",
            },
            display: {
              title: "Within boundary",
              message: "Full order of 1000 USDC is verified within your configured boundary.",
            },
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    const { container } = render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    const amountInput = screen.getByLabelText("Amount");
    fireEvent.change(amountInput, { target: { value: "1000" } });

    const checkButton = screen.getByRole("button", { name: "Check boundary" });
    fireEvent.click(checkButton);

    await waitFor(() => {
      expect(screen.getAllByText("Within boundary").length).toBeGreaterThan(0);
    });

    // Verify no forbidden words in the rendered container
    const text = container.textContent?.toLowerCase() || "";
    for (const word of forbiddenAdvisoryWords) {
      expect(text).not.toContain(word);
    }
  });

  // Proof 2: BUY fail/partial states do not say: Good to go / Price too high / Safe / Unsafe
  it("Proof 2: BUY fail and partial states do not say Good to go, Price too high, Safe, or Unsafe", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/markets")) {
        return { ok: true, json: async () => ({ markets: mockMarkets }) } as any;
      }
      if (urlStr.includes("/api/capacity/buy")) {
        return {
          ok: true,
          json: async () => ({
            side: "BUY",
            asset: { name: "OpenAI", symbol: "OPENAI", mint: "PreStocksOpenAIMint111111111111111111111111" },
            fundingAsset: "USDC",
            requestedAmount: "1000",
            status: "PARTIALLY_WITHIN_BOUNDARY",
            checkId: "check-partial",
            verifiedCapacity: {
              fundingAmount: "500",
              effectiveBuyPriceUsd: "520.00",
              expectedTargetAmount: "0.96",
            },
            display: {
              title: "Partial capacity verified within boundary",
              message: "500 USDC of the requested amount is currently verified within your configured boundary.",
            },
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    const { container } = render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() => {
      expect(screen.getByText("Partial capacity")).toBeInTheDocument();
    });

    const renderedText = container.textContent || "";
    expect(renderedText).not.toMatch(/good to go/i);
    expect(renderedText).not.toMatch(/price too high/i);
    expect(renderedText).not.toMatch(/\bsafe\b/i);
    expect(renderedText).not.toMatch(/\bunsafe\b/i);
  });

  // Proof 3: SELL full-pass UI uses objective boundary wording
  it("Proof 3: SELL full-pass UI uses objective boundary wording", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/markets")) {
        return { ok: true, json: async () => ({ markets: mockMarkets }) } as any;
      }
      if (urlStr.includes("/api/capacity/sell")) {
        return {
          ok: true,
          json: async () => ({
            side: "SELL",
            asset: { name: "OpenAI", symbol: "OPENAI", mint: "PreStocksOpenAIMint111111111111111111111111" },
            outputAsset: "USDC",
            requestedAmount: "2",
            status: "FULLY_WITHIN_BOUNDARY",
            checkId: "check-sell-123",
            verifiedCapacity: {
              economicAmount: "2",
              effectiveSellPriceUsd: "490.00",
              expectedUsdcProceeds: "980.00",
            },
            display: {
              title: "Within boundary",
              message: "Full order of 2 OPENAI is verified within your configured boundary.",
            },
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    const { container } = render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    // Switch to SELL
    fireEvent.click(screen.getByRole("tab", { name: "SELL" }));
    expect(screen.getByText("Sell PreStocks")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() => {
      expect(screen.getAllByText("Within boundary").length).toBeGreaterThan(0);
    });

    const text = container.textContent?.toLowerCase() || "";
    for (const word of forbiddenAdvisoryWords) {
      expect(text).not.toContain(word);
    }
  });

  // Proof 4: SELL fail/partial states use objective boundary wording
  it("Proof 4: SELL fail/partial states use objective boundary wording", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/markets")) {
        return { ok: true, json: async () => ({ markets: mockMarkets }) } as any;
      }
      if (urlStr.includes("/api/capacity/sell")) {
        return {
          ok: true,
          json: async () => ({
            side: "SELL",
            asset: { name: "OpenAI", symbol: "OPENAI", mint: "PreStocksOpenAIMint111111111111111111111111" },
            outputAsset: "USDC",
            requestedAmount: "2",
            status: "PARTIALLY_WITHIN_BOUNDARY",
            checkId: "check-sell-partial",
            verifiedCapacity: {
              economicAmount: "1",
              effectiveSellPriceUsd: "485.00",
              expectedUsdcProceeds: "485.00",
            },
            display: {
              title: "Partial capacity verified within boundary",
              message: "1 OPENAI of the requested amount is currently verified within your configured boundary.",
            },
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    const { container } = render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: "SELL" }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() => {
      expect(screen.getByText("Partial capacity")).toBeInTheDocument();
    });

    const renderedText = container.textContent || "";
    expect(renderedText).not.toMatch(/good to go/i);
    expect(renderedText).not.toMatch(/price too high/i);
    expect(renderedText).not.toMatch(/\bsafe\b/i);
    expect(renderedText).not.toMatch(/\bunsafe\b/i);
  });

  // Proof 5: NO_VERIFIED_CAPACITY remains: "No verified capacity within this boundary."
  it("Proof 5: NO_VERIFIED_CAPACITY remains 'No verified capacity within this boundary.'", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/markets")) {
        return { ok: true, json: async () => ({ markets: mockMarkets }) } as any;
      }
      if (urlStr.includes("/api/capacity/buy")) {
        return {
          ok: true,
          json: async () => ({
            side: "BUY",
            asset: { name: "OpenAI", symbol: "OPENAI", mint: "PreStocksOpenAIMint111111111111111111111111" },
            fundingAsset: "USDC",
            requestedAmount: "1000",
            status: "NO_VERIFIED_CAPACITY",
            checkId: null,
            verifiedCapacity: null,
            display: {
              title: "No verified capacity within boundary",
              message: "No amount within your requested order was verified within your configured boundary.",
            },
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() => {
      expect(screen.getByText("No verified capacity within this boundary.")).toBeInTheDocument();
    });
  });

  // Proof 6: partial copy contains: "currently verified within your configured boundary"
  it("Proof 6: partial copy contains 'currently verified within your configured boundary'", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/markets")) {
        return { ok: true, json: async () => ({ markets: mockMarkets }) } as any;
      }
      if (urlStr.includes("/api/capacity/buy")) {
        return {
          ok: true,
          json: async () => ({
            side: "BUY",
            asset: { name: "OpenAI", symbol: "OPENAI", mint: "PreStocksOpenAIMint111111111111111111111111" },
            fundingAsset: "USDC",
            requestedAmount: "1000",
            status: "PARTIALLY_WITHIN_BOUNDARY",
            checkId: "check-partial",
            verifiedCapacity: {
              fundingAmount: "347.28",
              effectiveBuyPriceUsd: "515.00",
              expectedTargetAmount: "0.67",
            },
            display: {
              title: "Partial capacity verified within boundary",
              message: "347.28 USDC of the requested amount is currently verified within your configured boundary.",
            },
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() => {
      expect(
        screen.getByText("347.28 USDC of the requested 1000 USDC is currently verified within your configured boundary.")
      ).toBeInTheDocument();
    });
  });

  // Proof 7: no recommendation language around "Use boundary amount"
  it("Proof 7: no recommendation language around 'Use boundary amount'", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/markets")) {
        return { ok: true, json: async () => ({ markets: mockMarkets }) } as any;
      }
      if (urlStr.includes("/api/capacity/buy")) {
        return {
          ok: true,
          json: async () => ({
            side: "BUY",
            asset: { name: "OpenAI", symbol: "OPENAI", mint: "PreStocksOpenAIMint111111111111111111111111" },
            fundingAsset: "USDC",
            requestedAmount: "1000",
            status: "PARTIALLY_WITHIN_BOUNDARY",
            checkId: "check-partial",
            verifiedCapacity: {
              fundingAmount: "500",
              effectiveBuyPriceUsd: "515.00",
              expectedTargetAmount: "0.97",
            },
            display: {
              title: "Partial capacity verified within boundary",
              message: "500 USDC of the requested amount is currently verified within your configured boundary.",
            },
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: "Use boundary amount" });
      expect(btn).toBeInTheDocument();
    });

    const helperText = screen.getByText('Select "Use boundary amount" below to proceed with the verified capacity.');
    expect(helperText).toBeInTheDocument();
    expect(helperText.textContent?.toLowerCase()).not.toMatch(/recommend|suggest|ideal|best/);
  });

  // Proof 8: build PRICE_MOVED error maps to objective recheck wording
  it("Proof 8: build PRICE_MOVED error maps to 'Boundary changed. Check again.'", async () => {
    expect(ERROR_REGISTRY.PRICE_MOVED_OUTSIDE_LIMIT.userTitle).toBe("Boundary changed. Check again.");
    expect(ERROR_REGISTRY.PRICE_MOVED_OUTSIDE_LIMIT.userMessage).toBe("Current execution no longer fits your configured boundary.");
  });

  // Proof 9: expiration maps to objective recheck wording
  it("Proof 9: expiration maps to 'Check expired.' and 'This check expired. Run a new boundary check.'", () => {
    expect(ERROR_REGISTRY.QUOTE_EXPIRED.userTitle).toBe("Check expired.");
    expect(ERROR_REGISTRY.QUOTE_EXPIRED.userMessage).toBe("This check expired. Run a new boundary check.");
    expect(ERROR_REGISTRY.TRANSACTION_EXPIRED.userTitle).toBe("Check expired.");
    expect(ERROR_REGISTRY.TRANSACTION_EXPIRED.userMessage).toBe("This check expired. Run a new boundary check.");
  });

  // Proof 10: review dialog has no investment recommendation
  it("Proof 10: review dialog has no investment recommendation", () => {
    const mockCheck = {
      asset: { name: "OpenAI PreStocks", symbol: "OPENAI" },
      funding: { amount: "100", asset: "USDC" },
      price: { referenceUsd: "500.00", maxBuyUsd: "525.00", currentBuyUsd: "510.00", premiumPct: "2.00" },
    };
    const { container } = render(
      <ReviewDialog
        isOpen={true}
        onClose={() => {}}
        check={mockCheck}
        onPrepareTransaction={() => {}}
        side="BUY"
      />
    );

    const text = container.textContent?.toLowerCase() || "";
    for (const word of forbiddenAdvisoryWords) {
      expect(text).not.toContain(word);
    }
  });

  // Proof 11: trade receipt has no investment recommendation
  it("Proof 11: trade receipt has no investment recommendation", () => {
    const mockReceipt: TradeReceipt = {
      id: "receipt-123",
      checkId: "check-123",
      buildIntentId: "build-123",
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      network: "mainnet",
      signature: "5VERv8NMvzbJMEkV8xnr5J2Kxnr5J2Kxnr5J2Kxnr5J2",
      status: "CONFIRMED",
      fundingAsset: "USDC",
      fundingAmount: "100.00",
      requestedFundingAmount: "100.00",
      actualFundingAmount: "100.00",
      targetSymbol: "OPENAI",
      targetMint: "PreStocksOpenAIMint111111111111111111111111",
      expectedTargetAmount: "0.20",
      realizedTargetAmount: "0.20",
      referencePriceUsd: "500.00",
      checkedBuyPriceUsd: "500.00",
      premiumBps: 0,
      maxPremiumBps: 500,
      submittedAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
    };

    const { container } = render(<TradeReceiptView receipt={mockReceipt} onDone={() => {}} />);
    const text = container.textContent?.toLowerCase() || "";
    for (const word of forbiddenAdvisoryWords) {
      expect(text).not.toContain(word);
    }
  });

  // Proof 12: markets page has no overvalued/undervalued judgment labels
  it("Proof 12: markets page has no overvalued/undervalued judgment labels", () => {
    const { container } = render(
      <SearchFilter
        searchQuery=""
        onSearchChange={() => {}}
        currentFilter="ALL"
        onFilterChange={() => {}}
      />
    );

    const text = container.textContent?.toLowerCase() || "";
    expect(text).not.toContain("overvalued");
    expect(text).not.toContain("undervalued");
    expect(text).not.toContain("opportunity");
    expect(text).not.toContain("best deal");
    expect(text).not.toContain("good entry");
    expect(text).not.toContain("avoid");
    expect(text).not.toContain("strong buy");
    expect(text).not.toContain("strong sell");
  });

  // Proof 13: preferences has no risk-profile presets
  it("Proof 13: preferences has no risk-profile presets", () => {
    const { container } = render(<PreferencesView />);
    const text = container.textContent?.toLowerCase() || "";
    expect(text).not.toContain("conservative");
    expect(text).not.toContain("balanced");
    expect(text).not.toContain("aggressive");
    expect(text).not.toContain("recommended");
    expect(text).not.toContain("safe");
  });

  // Proof 14: raw internal GOOD_TO_GO / PRICE_TOO_HIGH codes, if retained, are never rendered directly by the audited UI
  it("Proof 14: raw internal GOOD_TO_GO / PRICE_TOO_HIGH codes are never rendered directly", () => {
    const { container: container1 } = render(<StateBanner state="GOOD_TO_GO" />);
    expect(container1.textContent).not.toContain("GOOD_TO_GO");
    expect(container1.textContent).toContain("Within boundary");

    const { container: container2 } = render(<StateBanner state="PRICE_TOO_HIGH" />);
    expect(container2.textContent).not.toContain("PRICE_TOO_HIGH");
    expect(container2.textContent).toContain("Boundary exceeded");
  });

  // Proof 15: SELL does not display BUY-only policy language
  it("Proof 15: SELL does not display BUY-only policy language", async () => {
    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    // Switch to SELL
    fireEvent.click(screen.getByRole("tab", { name: "SELL" }));

    // Verify SELL labels are present
    expect(screen.getByText("Sell PreStocks")).toBeInTheDocument();
    expect(screen.getByText("USDC output")).toBeInTheDocument();
    expect(screen.getByText("Amount to sell")).toBeInTheDocument();
    expect(screen.getByText("Maximum discount")).toBeInTheDocument();
    expect(screen.getByText("Minimum price")).toBeInTheDocument();
    expect(screen.getByText("Sell proceeds are always paid in USDC.")).toBeInTheDocument();

    // Verify BUY-only labels are absent
    expect(screen.queryByText("Amount to spend")).not.toBeInTheDocument();
    expect(screen.queryByText("Maximum premium")).not.toBeInTheDocument();
    expect(screen.queryByText("Maximum price")).not.toBeInTheDocument();
    expect(screen.queryByText("Pay with")).not.toBeInTheDocument();
  });
});
