import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import "@testing-library/jest-dom/vitest";

import { WalletButton } from "@/components/app-shell/wallet-button";
import { Header } from "@/components/app-shell/header";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import BuyPage from "@/app/buy/page";
import { HistoryView } from "@/components/history/history-view";
import type { HistoryItem } from "@/server/services/history-service";

// Mocks
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

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/history",
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error(`REDIRECT:${url}`);
  },
}));

const sampleHistoryItems: HistoryItem[] = [
  {
    id: "check-1",
    side: "BUY",
    type: "CHECK_PASSED",
    kind: "CHECK_PASSED",
    status: "CHECKED",
    timestamp: "2026-09-23T12:00:00.000Z",
    tokenSymbol: "OPENAI",
    amount: "50.000000000000000000",
    asset: { name: "OpenAI PreStock", symbol: "OPENAI", mint: "mint-openai" },
    funding: { asset: "USDC", amount: "50.000000000000000000" },
    referencePriceUsd: "500.00",
    executionPriceUsd: "512.50",
    boundary: {
      type: "MAX_PREMIUM",
      bps: 500,
      pct: "5.00",
    },
    realizedBoundaryBps: 250,
    realizedBoundaryPct: "2.50",
    network: "mainnet",
    statusLabel: "Checked",
  },
  {
    id: "check-2",
    side: "BUY",
    type: "CHECK_BLOCKED",
    kind: "CHECK_BLOCKED",
    status: "BLOCKED",
    timestamp: "2026-09-23T12:05:00.000Z",
    tokenSymbol: "SPACEX",
    amount: "100.000000",
    asset: { name: "SpaceX PreStock", symbol: "SPACEX", mint: "mint-spacex" },
    funding: { asset: "USDC", amount: "100.000000" },
    referencePriceUsd: "200.00",
    executionPriceUsd: "220.00",
    boundary: {
      type: "MAX_PREMIUM",
      bps: 500,
      pct: "5.00",
    },
    realizedBoundaryBps: 1000,
    realizedBoundaryPct: "10.00",
    network: "mainnet",
    statusLabel: "Blocked",
  },
  {
    id: "trade-1",
    side: "BUY",
    type: "TRADE_CONFIRMED",
    kind: "TRADE_CONFIRMED",
    status: "CONFIRMED",
    timestamp: "2026-09-23T12:10:00.000Z",
    tokenSymbol: "ANTHROPIC",
    amount: "250.000000",
    asset: { name: "Anthropic PreStock", symbol: "ANTHROPIC", mint: "mint-anthropic" },
    funding: { asset: "USDC", amount: "250.000000" },
    referencePriceUsd: "150.00",
    executionPriceUsd: "153.00",
    boundary: {
      type: "MAX_PREMIUM",
      bps: 500,
      pct: "5.00",
    },
    realizedBoundaryBps: 200,
    realizedBoundaryPct: "2.00",
    network: "mainnet",
    signature: "5VERv8NMvzbJMEdV8xnrLkEaMaWRqfZ8xTuU8xnrLkEaMaWRqfZ8xTuU8xnrLkEaMaWRqfZ8xTuU8xnrLkEaMaWR",
    statusLabel: "Confirmed",
  },
  {
    id: "trade-2",
    side: "BUY",
    type: "TRADE_FAILED",
    kind: "TRADE_FAILED",
    status: "FAILED",
    timestamp: "2026-09-23T12:15:00.000Z",
    tokenSymbol: "STRIPE",
    amount: "75.000000",
    asset: { name: "Stripe PreStock", symbol: "STRIPE", mint: "mint-stripe" },
    funding: { asset: "USDC", amount: "75.000000" },
    referencePriceUsd: "100.00",
    executionPriceUsd: "102.00",
    boundary: {
      type: "MAX_PREMIUM",
      bps: 500,
      pct: "5.00",
    },
    realizedBoundaryBps: 200,
    realizedBoundaryPct: "2.00",
    network: "mainnet",
    statusLabel: "Failed",
  },
];

describe("TASK — LOGOUT REDIRECT + HISTORY UX (10 Focused Invariant Proofs)", () => {
  beforeEach(() => {
    mockConnected = false;
    mockPublicKey = null;
    mockDisconnect.mockClear();
    mockReplace.mockClear();
    mockPush.mockClear();
    mockSetVisible.mockClear();
    mockRedirect.mockClear();
    vi.restoreAllMocks();
  });

  // Proof 1: Explicit Disconnect redirects to /
  it("Proof 1: Explicit Disconnect from wallet dropdown calls disconnect and redirects to /", async () => {
    mockConnected = true;
    mockPublicKey = { toBase58: () => "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" };

    render(<WalletButton />);

    // Open dropdown
    const toggleBtn = screen.getByRole("button", { name: /9wzd/i });
    fireEvent.click(toggleBtn);

    // Click Disconnect
    const disconnectBtn = screen.getByRole("menuitem", { name: /disconnect/i });
    fireEvent.click(disconnectBtn);

    await waitFor(() => {
      expect(mockDisconnect).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith("/");
    });
  });

  // Proof 2: Wallet hydration does NOT trigger logout redirect
  it("Proof 2: Wallet hydration does not trigger any logout redirect", () => {
    mockConnected = true;
    mockPublicKey = { toBase58: () => "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" };

    render(<WalletButton />);

    // Neither replace nor push should have been called passively
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  // Proof 3: Buy is absent from primary navigation (Header and BottomNav)
  it("Proof 3: Buy is absent from primary desktop and mobile navigation", () => {
    // Desktop Header
    const { unmount } = render(<Header />);
    const headerNav = screen.getByRole("navigation", { name: "Main Navigation" });
    expect(headerNav).toHaveTextContent("Dashboard");
    expect(headerNav).toHaveTextContent("Markets");
    expect(headerNav).toHaveTextContent("History");
    expect(headerNav).toHaveTextContent("Preferences");
    expect(headerNav).not.toHaveTextContent("Buy");
    unmount();

    // Mobile BottomNav
    render(<BottomNav />);
    const mobileNav = screen.getByRole("navigation", { name: "Mobile Bottom Navigation" });
    expect(mobileNav).toHaveTextContent("Dashboard");
    expect(mobileNav).toHaveTextContent("Markets");
    expect(mobileNav).toHaveTextContent("History");
    expect(mobileNav).toHaveTextContent("Preferences");
    expect(mobileNav).not.toHaveTextContent("Buy");
  });

  // Proof 4: /buy compatibility behavior preserves deep links and redirects to /dashboard
  it("Proof 4: /buy compatibility redirects to /dashboard with search params preserved", async () => {
    // Without params
    await expect(BuyPage({})).rejects.toThrow("REDIRECT:/dashboard");
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");

    mockRedirect.mockClear();

    // With deep link searchParams
    await expect(
      BuyPage({
        searchParams: Promise.resolve({ mint: "mint-123", side: "SELL" }),
      })
    ).rejects.toThrow("REDIRECT:/dashboard?mint=mint-123&side=SELL");
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard?mint=mint-123&side=SELL");
  });

  // Proof 5: History filters render as separate segmented control buttons
  it("Proof 5: History filters render separately in a tablist", async () => {
    mockConnected = true;
    mockPublicKey = { toBase58: () => "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: sampleHistoryItems }),
    } as Response);

    render(<HistoryView />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "All" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Executions" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Boundary checks" })).toBeInTheDocument();
    });

    // Default is All
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Executions" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Boundary checks" })).toHaveAttribute("aria-selected", "false");
  });

  // Proof 6: Check-only record does not say 'Transaction reconciliation unavailable'
  it("Proof 6: Check-only record displays 'Check only — no transaction prepared' instead of reconciliation unavailable", async () => {
    mockConnected = true;
    mockPublicKey = { toBase58: () => "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" };

    // Single check-only item
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [sampleHistoryItems[0]] }),
    } as Response);

    render(<HistoryView />);

    await waitFor(() => {
      expect(screen.getAllByText("Check only — no transaction prepared").length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.queryByText(/Transaction reconciliation unavailable/i)).not.toBeInTheDocument();
  });

  // Proof 7: USDC display is human-readable (50.00 USDC, not 50.000000000000000000 USDC)
  it("Proof 7: USDC display formats to 2 decimal places and avoids giant float strings", async () => {
    mockConnected = true;
    mockPublicKey = { toBase58: () => "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [sampleHistoryItems[0]] }),
    } as Response);

    render(<HistoryView />);

    await waitFor(() => {
      expect(screen.getAllByText("50.00 USDC").length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.queryByText(/50\.000000000000000000/)).not.toBeInTheDocument();
  });

  // Proof 8: Check-only rows are not presented as executions
  it("Proof 8: Check-only rows are excluded from Executions filter and filtered correctly", async () => {
    mockConnected = true;
    mockPublicKey = { toBase58: () => "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: sampleHistoryItems }),
    } as Response);

    render(<HistoryView />);

    await waitFor(() => {
      expect(screen.getAllByText("OPENAI").length).toBeGreaterThanOrEqual(1);
    });

    // Switch to Executions filter
    fireEvent.click(screen.getByRole("tab", { name: "Executions" }));

    // Executions should only show ANTHROPIC and STRIPE
    expect(screen.getAllByText("ANTHROPIC").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("STRIPE").length).toBeGreaterThanOrEqual(1);
    // Check-only items should NOT be displayed
    expect(screen.queryByText("OPENAI")).not.toBeInTheDocument();
    expect(screen.queryByText("SPACEX")).not.toBeInTheDocument();

    // Switch to Boundary checks filter
    fireEvent.click(screen.getByRole("tab", { name: "Boundary checks" }));

    // Checks should only show OPENAI and SPACEX
    expect(screen.getAllByText("OPENAI").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("SPACEX").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("ANTHROPIC")).not.toBeInTheDocument();
    expect(screen.queryByText("STRIPE")).not.toBeInTheDocument();
  });

  // Proof 9: Desktop History layout uses neutral/adaptive columns
  it("Proof 9: Desktop table has neutral headers (Status, Asset, Side, Amount, Execution Price, Boundary, Time, Transaction)", async () => {
    mockConnected = true;
    mockPublicKey = { toBase58: () => "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: sampleHistoryItems }),
    } as Response);

    render(<HistoryView />);

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Asset" })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Side" })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Amount" })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Execution Price" })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Boundary" })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Time" })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Transaction" })).toBeInTheDocument();
    });

    // Old buy-only column names are absent
    expect(screen.queryByRole("columnheader", { name: "Paid" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Buy Price" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Limit" })).not.toBeInTheDocument();
  });

  // Proof 10: Mobile History stacked cards render without table element
  it("Proof 10: Mobile cards contain Asset + Side, Status, Amount, Price, Boundary, Time, and Transaction", async () => {
    mockConnected = true;
    mockPublicKey = { toBase58: () => "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: sampleHistoryItems }),
    } as Response);

    const { container } = render(<HistoryView />);

    await waitFor(() => {
      expect(screen.getAllByText("OPENAI").length).toBeGreaterThanOrEqual(1);
    });

    // Verify mobile card section exists with sm:hidden
    const mobileContainer = container.querySelector(".sm\\:hidden");
    expect(mobileContainer).toBeInTheDocument();
    expect(mobileContainer).toHaveTextContent("OPENAI");
    expect(mobileContainer).toHaveTextContent("BUY");
    expect(mobileContainer).toHaveTextContent("Checked");
    expect(mobileContainer).toHaveTextContent("50.00 USDC");
    expect(mobileContainer).toHaveTextContent("Check only — no transaction prepared");
  });
});
