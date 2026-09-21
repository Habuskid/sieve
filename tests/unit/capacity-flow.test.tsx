import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { BuyView } from "@/components/buy/buy-view";
import { VersionedTransaction } from "@solana/web3.js";
import "@testing-library/jest-dom/vitest";

// Wallet mock control
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
  {
    name: "SpaceX",
    symbol: "SPACEX",
    mint: "PreStocksSpaceXMint111111111111111111111111",
    referencePriceUsd: "250.00",
    status: "ACTIVE",
  },
];

describe("TASK 9 — Frontend Boundary Capacity User Action Flow (36 Invariant Tests)", () => {
  let fetchSpy: any;

  beforeEach(() => {
    mockConnected = true;
    mockPublicKey = { toBase58: () => "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" };
    mockSignTransaction = vi.fn().mockImplementation(async (tx) => tx);
    mockSetVisible.mockClear();

    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const urlStr = url.toString();
      if (urlStr === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { message: "Unhandled mock" } }), { status: 500 });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.clearAllMocks();
  });

  // 1. Initial render: defaults to BUY side
  it("01. defaults to BUY side on initial render", async () => {
    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("Buy PreStocks")).toBeInTheDocument());
    const buyTab = screen.getByRole("tab", { name: "BUY" });
    expect(buyTab).toHaveAttribute("aria-selected", "true");
  });

  // 2. Initial render: displays PreStock asset selector with available markets
  it("02. displays PreStock asset selector with available markets", async () => {
    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());
    expect(screen.getByText("SpaceX (SPACEX)")).toBeInTheDocument();
  });

  // 3. Initial render: displays funding selector (USDC / SOL) in BUY mode
  it("03. displays funding selector in BUY mode", async () => {
    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("USDC funding")).toBeInTheDocument());
    expect(screen.getByRole("radiogroup", { name: "Funding Asset" })).toBeInTheDocument();
  });

  // 4. Initial render: displays Amount input for spending amount
  it("04. displays Amount input with helper 'Amount to spend' in BUY mode", async () => {
    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("Amount to spend")).toBeInTheDocument());
  });

  // 5. Initial render: displays 'Maximum premium' slider with subtext 'You set this execution boundary.'
  it("05. displays 'Maximum premium' and subtext 'You set this execution boundary.'", async () => {
    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("Maximum premium")).toBeInTheDocument());
    expect(screen.getByText("You set this execution boundary.")).toBeInTheDocument();
  });

  // 6. Initial render: displays '+5.0%' as default premium limit
  it("06. displays '+5.0%' as default premium limit", async () => {
    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("+5.0%")).toBeInTheDocument());
  });

  // 7. Initial render: displays 'Check boundary' when wallet connected
  it("07. displays 'Check boundary' button when wallet is connected", async () => {
    render(<BuyView />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Check boundary" })).toBeInTheDocument());
  });

  // 8. Wallet disconnected: displays 'Connect wallet to check boundary'
  it("08. displays 'Connect wallet to check boundary' when wallet is disconnected", async () => {
    mockConnected = false;
    mockPublicKey = null;
    render(<BuyView />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Connect wallet to check boundary" })).toBeInTheDocument()
    );
  });

  // 9. Wallet disconnected: clicking 'Connect wallet to check boundary' opens wallet modal
  it("09. clicking 'Connect wallet to check boundary' opens wallet modal", async () => {
    mockConnected = false;
    mockPublicKey = null;
    render(<BuyView />);
    const btn = await screen.findByRole("button", { name: "Connect wallet to check boundary" });
    fireEvent.click(btn);
    expect(mockSetVisible).toHaveBeenCalledWith(true);
  });

  // 10. Side switch: switching from BUY to SELL changes active mode to SELL
  it("10. switching from BUY to SELL updates active tab and header", async () => {
    render(<BuyView />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "SELL" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "SELL" }));
    expect(screen.getByRole("tab", { name: "SELL" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Sell PreStocks")).toBeInTheDocument();
  });

  // 11. Side switch: switching to SELL hides funding selector
  it("11. switching to SELL hides funding selector", async () => {
    render(<BuyView />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "SELL" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "SELL" }));
    expect(screen.queryByRole("group", { name: "Funding asset" })).not.toBeInTheDocument();
  });

  // 12. Side switch: switching to SELL displays fixed USDC output indicator ('USDC (Fixed)')
  it("12. switching to SELL displays fixed USDC output indicator", async () => {
    render(<BuyView />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "SELL" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "SELL" }));
    expect(screen.getByText("USDC (Fixed)")).toBeInTheDocument();
    expect(screen.getByText("Sell proceeds are always paid in USDC.")).toBeInTheDocument();
  });

  // 13. Side switch: switching to SELL changes Amount helper to 'Amount to sell'
  it("13. switching to SELL changes Amount helper to 'Amount to sell'", async () => {
    render(<BuyView />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "SELL" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "SELL" }));
    expect(screen.getByText("Amount to sell")).toBeInTheDocument();
  });

  // 14. Side switch: switching to SELL changes boundary label to 'Maximum discount' with subtext
  it("14. switching to SELL changes boundary label to 'Maximum discount' with subtext", async () => {
    render(<BuyView />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "SELL" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "SELL" }));
    expect(screen.getByText("Maximum discount")).toBeInTheDocument();
    expect(screen.getByText("You set this execution boundary.")).toBeInTheDocument();
  });

  // 15. Side switch: switching to SELL formats boundary limit as negative percentage ('-5.0%')
  it("15. switching to SELL formats boundary limit as negative percentage", async () => {
    render(<BuyView />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "SELL" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "SELL" }));
    expect(screen.getByText("-5.0%")).toBeInTheDocument();
  });

  // 16. Side switch: switching side clears any previous check result, selected verified check, and build data
  it("16. switching side clears previous check result and resets to IDLE", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      if (url.toString() === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (url.toString() === "/api/capacity/buy") {
        return new Response(
          JSON.stringify({
            side: "BUY",
            asset: mockMarkets[0],
            fundingAsset: "USDC",
            requestedAmount: "100",
            status: "FULLY_WITHIN_BOUNDARY",
            checkId: "check-111",
            verifiedCapacity: { fundingAmount: "100", effectiveBuyPriceUsd: "505.00", expectedTargetAmount: "0.198" },
            display: { title: "Within boundary", message: "Verified" },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 500 });
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    // Enter amount and check
    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() => expect(screen.getByText("Within boundary")).toBeInTheDocument());

    // Switch side to SELL -> check result must disappear
    fireEvent.click(screen.getByRole("tab", { name: "SELL" }));
    expect(screen.queryByText("Within boundary")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check boundary" })).toBeInTheDocument();
  });

  // 17. Input change: changing amount clears check result and selected verified check
  it("17. changing amount clears check result immediately", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      if (url.toString() === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (url.toString() === "/api/capacity/buy") {
        return new Response(
          JSON.stringify({
            side: "BUY",
            asset: mockMarkets[0],
            fundingAsset: "USDC",
            requestedAmount: "100",
            status: "FULLY_WITHIN_BOUNDARY",
            checkId: "check-111",
            verifiedCapacity: { fundingAmount: "100", effectiveBuyPriceUsd: "505.00", expectedTargetAmount: "0.198" },
            display: { title: "Within boundary", message: "Verified" },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 500 });
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() => expect(screen.getByText("Within boundary")).toBeInTheDocument());

    // Change amount -> check result cleared
    fireEvent.change(input, { target: { value: "150" } });
    expect(screen.queryByText("Within boundary")).not.toBeInTheDocument();
  });

  // 18. Input change: changing limit percentage clears check result and selected verified check
  it("18. changing limit percentage clears check result immediately", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      if (url.toString() === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (url.toString() === "/api/capacity/buy") {
        return new Response(
          JSON.stringify({
            side: "BUY",
            asset: mockMarkets[0],
            fundingAsset: "USDC",
            requestedAmount: "100",
            status: "FULLY_WITHIN_BOUNDARY",
            checkId: "check-111",
            verifiedCapacity: { fundingAmount: "100", effectiveBuyPriceUsd: "505.00", expectedTargetAmount: "0.198" },
            display: { title: "Within boundary", message: "Verified" },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 500 });
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() => expect(screen.getByText("Within boundary")).toBeInTheDocument());

    // Change limit slider
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "7.0" } });
    expect(screen.queryByText("Within boundary")).not.toBeInTheDocument();
  });

  // 19. Input change: changing target mint clears check result
  it("19. changing target mint clears check result immediately", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      if (url.toString() === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (url.toString() === "/api/capacity/buy") {
        return new Response(
          JSON.stringify({
            side: "BUY",
            asset: mockMarkets[0],
            fundingAsset: "USDC",
            requestedAmount: "100",
            status: "FULLY_WITHIN_BOUNDARY",
            checkId: "check-111",
            verifiedCapacity: { fundingAmount: "100", effectiveBuyPriceUsd: "505.00", expectedTargetAmount: "0.198" },
            display: { title: "Within boundary", message: "Verified" },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 500 });
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() => expect(screen.getByText("Within boundary")).toBeInTheDocument());

    // Change asset select
    const select = screen.getByLabelText("Asset");
    fireEvent.change(select, { target: { value: mockMarkets[1].mint } });
    expect(screen.queryByText("Within boundary")).not.toBeInTheDocument();
  });

  // 20. Input change: changing funding asset in BUY clears check result
  it("20. changing funding asset in BUY clears check result immediately", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      if (url.toString() === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (url.toString() === "/api/capacity/buy") {
        return new Response(
          JSON.stringify({
            side: "BUY",
            asset: mockMarkets[0],
            fundingAsset: "USDC",
            requestedAmount: "100",
            status: "FULLY_WITHIN_BOUNDARY",
            checkId: "check-111",
            verifiedCapacity: { fundingAmount: "100", effectiveBuyPriceUsd: "505.00", expectedTargetAmount: "0.198" },
            display: { title: "Within boundary", message: "Verified" },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 500 });
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() => expect(screen.getByText("Within boundary")).toBeInTheDocument());

    // Change funding asset to SOL
    const solButton = screen.getByRole("radio", { name: /SOL/i });
    fireEvent.click(solButton);
    expect(screen.queryByText("Within boundary")).not.toBeInTheDocument();
  });

  // 21. Wallet change: disconnecting wallet immediately clears check result
  it("21. disconnecting wallet immediately clears check result and prepared transaction", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      if (url.toString() === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (url.toString() === "/api/capacity/buy") {
        return new Response(
          JSON.stringify({
            side: "BUY",
            asset: mockMarkets[0],
            fundingAsset: "USDC",
            requestedAmount: "100",
            status: "FULLY_WITHIN_BOUNDARY",
            checkId: "check-111",
            verifiedCapacity: { fundingAmount: "100", effectiveBuyPriceUsd: "505.00", expectedTargetAmount: "0.198" },
            display: { title: "Within boundary", message: "Verified" },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 500 });
    });

    const { rerender } = render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() => expect(screen.getByText("Within boundary")).toBeInTheDocument());

    // Disconnect wallet
    mockConnected = false;
    mockPublicKey = null;
    rerender(<BuyView />);

    await waitFor(() => expect(screen.queryByText("Within boundary")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Connect wallet to check boundary" })).toBeInTheDocument();
  });

  // 22. Wallet change: changing wallet address immediately clears check result
  it("22. changing wallet address immediately clears check result", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      if (url.toString() === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (url.toString() === "/api/capacity/buy") {
        return new Response(
          JSON.stringify({
            side: "BUY",
            asset: mockMarkets[0],
            fundingAsset: "USDC",
            requestedAmount: "100",
            status: "FULLY_WITHIN_BOUNDARY",
            checkId: "check-111",
            verifiedCapacity: { fundingAmount: "100", effectiveBuyPriceUsd: "505.00", expectedTargetAmount: "0.198" },
            display: { title: "Within boundary", message: "Verified" },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 500 });
    });

    const { rerender } = render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() => expect(screen.getByText("Within boundary")).toBeInTheDocument());

    // Change wallet address
    mockPublicKey = { toBase58: () => "DifferentWalletAddress1111111111111111111111" };
    rerender(<BuyView />);

    await waitFor(() => expect(screen.queryByText("Within boundary")).not.toBeInTheDocument());
  });

  // 23. BUY boundary check: sends POST /api/capacity/buy with required payload
  it("23. sends POST /api/capacity/buy with required payload", async () => {
    let capturedUrl = "";
    let capturedBody: any = null;

    fetchSpy.mockImplementation(async (url: any, init: any) => {
      if (url.toString() === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (url.toString() === "/api/capacity/buy") {
        capturedUrl = url.toString();
        capturedBody = JSON.parse(init.body);
        return new Response(
          JSON.stringify({
            side: "BUY",
            asset: mockMarkets[0],
            fundingAsset: "USDC",
            requestedAmount: "100",
            status: "FULLY_WITHIN_BOUNDARY",
            checkId: "check-111",
            verifiedCapacity: { fundingAmount: "100", effectiveBuyPriceUsd: "505.00", expectedTargetAmount: "0.198" },
            display: { title: "Within boundary", message: "Verified" },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 500 });
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() => expect(capturedUrl).toBe("/api/capacity/buy"));
    expect(capturedBody).toMatchObject({
      targetMint: mockMarkets[0].mint,
      fundingAsset: "USDC",
      amount: "100",
      maxPremiumPct: "5",
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    });
    expect(capturedBody.clientIntentVersion).toBeDefined();
  });

  // 24. SELL boundary check: sends POST /api/capacity/sell with required payload
  it("24. sends POST /api/capacity/sell with required payload", async () => {
    let capturedUrl = "";
    let capturedBody: any = null;

    fetchSpy.mockImplementation(async (url: any, init: any) => {
      if (url.toString() === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (url.toString() === "/api/capacity/sell") {
        capturedUrl = url.toString();
        capturedBody = JSON.parse(init.body);
        return new Response(
          JSON.stringify({
            side: "SELL",
            asset: mockMarkets[0],
            outputAsset: "USDC",
            requestedAmount: "2",
            status: "FULLY_WITHIN_BOUNDARY",
            checkId: "check-sell-111",
            verifiedCapacity: { economicAmount: "2", effectiveSellPriceUsd: "495.00", expectedUsdcProceeds: "990.00" },
            display: { title: "Within boundary", message: "Verified" },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 500 });
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "SELL" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "SELL" }));

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() => expect(capturedUrl).toBe("/api/capacity/sell"));
    expect(capturedBody).toMatchObject({
      targetMint: mockMarkets[0].mint,
      amount: "2",
      maxDiscountPct: "5",
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    });
  });

  // 25. Capacity result: FULLY_WITHIN_BOUNDARY displays 'Within boundary'
  it("25. displays 'Within boundary' when status is FULLY_WITHIN_BOUNDARY", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      if (url.toString() === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (url.toString() === "/api/capacity/buy") {
        return new Response(
          JSON.stringify({
            side: "BUY",
            asset: mockMarkets[0],
            fundingAsset: "USDC",
            requestedAmount: "100",
            status: "FULLY_WITHIN_BOUNDARY",
            checkId: "check-111",
            verifiedCapacity: { fundingAmount: "100", effectiveBuyPriceUsd: "505.00", expectedTargetAmount: "0.198" },
            display: { title: "Within boundary", message: "Verified" },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 500 });
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() => expect(screen.getByText("Within boundary")).toBeInTheDocument());
  });

  // 26. Capacity result: FULLY_WITHIN_BOUNDARY enables 'Prepare transaction' button immediately
  it("26. enables 'Prepare transaction' button immediately when FULLY_WITHIN_BOUNDARY", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      if (url.toString() === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (url.toString() === "/api/capacity/buy") {
        return new Response(
          JSON.stringify({
            side: "BUY",
            asset: mockMarkets[0],
            fundingAsset: "USDC",
            requestedAmount: "100",
            status: "FULLY_WITHIN_BOUNDARY",
            checkId: "check-111",
            verifiedCapacity: { fundingAmount: "100", effectiveBuyPriceUsd: "505.00", expectedTargetAmount: "0.198" },
            display: { title: "Within boundary", message: "Verified" },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 500 });
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Prepare transaction" })).toBeInTheDocument()
    );
  });

  // 27. Capacity result: PARTIALLY_WITHIN_BOUNDARY displays required text
  it("27. displays partial capacity notification with requested and verified amounts", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      if (url.toString() === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (url.toString() === "/api/capacity/buy") {
        return new Response(
          JSON.stringify({
            side: "BUY",
            asset: mockMarkets[0],
            fundingAsset: "USDC",
            requestedAmount: "500",
            status: "PARTIALLY_WITHIN_BOUNDARY",
            checkId: "check-partial-111",
            verifiedCapacity: { fundingAmount: "300", effectiveBuyPriceUsd: "510.00", expectedTargetAmount: "0.588" },
            display: { title: "Partial capacity", message: "300 USDC verified" },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 500 });
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "300 USDC of the requested 500 USDC is currently verified within your configured boundary."
        )
      ).toBeInTheDocument()
    );
  });

  // 28. Capacity result: PARTIALLY_WITHIN_BOUNDARY displays 'Use boundary amount' button
  it("28. displays 'Use boundary amount' button when PARTIALLY_WITHIN_BOUNDARY", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      if (url.toString() === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (url.toString() === "/api/capacity/buy") {
        return new Response(
          JSON.stringify({
            side: "BUY",
            asset: mockMarkets[0],
            fundingAsset: "USDC",
            requestedAmount: "500",
            status: "PARTIALLY_WITHIN_BOUNDARY",
            checkId: "check-partial-111",
            verifiedCapacity: { fundingAmount: "300", effectiveBuyPriceUsd: "510.00", expectedTargetAmount: "0.588" },
            display: { title: "Partial capacity", message: "300 USDC verified" },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 500 });
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Use boundary amount" }).length).toBeGreaterThan(0)
    );
  });

  // 29. Capacity result: clicking 'Use boundary amount' selects verified check and enables 'Prepare transaction'
  it("29. clicking 'Use boundary amount' selects verified check and enables 'Prepare transaction'", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      if (url.toString() === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (url.toString() === "/api/capacity/buy") {
        return new Response(
          JSON.stringify({
            side: "BUY",
            asset: mockMarkets[0],
            fundingAsset: "USDC",
            requestedAmount: "500",
            status: "PARTIALLY_WITHIN_BOUNDARY",
            checkId: "check-partial-111",
            verifiedCapacity: { fundingAmount: "300", effectiveBuyPriceUsd: "510.00", expectedTargetAmount: "0.588" },
            display: { title: "Partial capacity", message: "300 USDC verified" },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 500 });
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    const useBtn = await screen.findAllByRole("button", { name: "Use boundary amount" });
    fireEvent.click(useBtn[0]);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Prepare transaction" })).toBeInTheDocument()
    );
  });

  // 30. Capacity result: NO_VERIFIED_CAPACITY displays 'No verified capacity within this boundary.'
  it("30. displays 'No verified capacity within this boundary.' when status is NO_VERIFIED_CAPACITY", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      if (url.toString() === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (url.toString() === "/api/capacity/buy") {
        return new Response(
          JSON.stringify({
            side: "BUY",
            asset: mockMarkets[0],
            fundingAsset: "USDC",
            requestedAmount: "10000",
            status: "NO_VERIFIED_CAPACITY",
            checkId: null,
            verifiedCapacity: null,
            display: { title: "No verified capacity", message: "None" },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 500 });
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() =>
      expect(screen.getByText("No verified capacity within this boundary.")).toBeInTheDocument()
    );
  });

  // 31. Capacity result: NO_VERIFIED_CAPACITY displays 'Check again' button
  it("31. displays 'Check again' button when NO_VERIFIED_CAPACITY", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      if (url.toString() === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (url.toString() === "/api/capacity/buy") {
        return new Response(
          JSON.stringify({
            side: "BUY",
            asset: mockMarkets[0],
            fundingAsset: "USDC",
            requestedAmount: "10000",
            status: "NO_VERIFIED_CAPACITY",
            checkId: null,
            verifiedCapacity: null,
            display: { title: "No verified capacity", message: "None" },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 500 });
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument()
    );
  });

  // 32. Error handling: displays error message when capacity check API returns 400 or error
  it("32. displays error message when capacity check returns 400", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      if (url.toString() === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (url.toString() === "/api/capacity/buy") {
        return new Response(
          JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "Invalid amount" } }),
          { status: 400 }
        );
      }
      return new Response(null, { status: 500 });
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() => expect(screen.getByText("Invalid amount")).toBeInTheDocument());
  });

  // 33. Error handling: displays rate limit message when capacity check returns 429
  it("33. displays rate limit message when capacity check returns 429", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      if (url.toString() === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (url.toString() === "/api/capacity/buy") {
        return new Response(
          JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many capacity requests. Please wait a moment." } }),
          { status: 429 }
        );
      }
      return new Response(null, { status: 500 });
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() =>
      expect(screen.getByText("Too many capacity requests. Please wait a moment.")).toBeInTheDocument()
    );
  });

  // 34. Prepare transaction: BUY calls POST /api/build with ONLY { checkId, wallet }
  it("34. prepare transaction for BUY calls POST /api/build with ONLY { checkId, wallet }", async () => {
    let capturedBuildBody: any = null;

    fetchSpy.mockImplementation(async (url: any, init: any) => {
      const urlStr = url.toString();
      if (urlStr === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (urlStr === "/api/capacity/buy") {
        return new Response(
          JSON.stringify({
            side: "BUY",
            asset: mockMarkets[0],
            fundingAsset: "USDC",
            requestedAmount: "100",
            status: "FULLY_WITHIN_BOUNDARY",
            checkId: "check-authoritative-123",
            verifiedCapacity: { fundingAmount: "100", effectiveBuyPriceUsd: "505.00", expectedTargetAmount: "0.198" },
            display: { title: "Within boundary", message: "Verified" },
          }),
          { status: 200 }
        );
      }
      if (urlStr === "/api/build") {
        capturedBuildBody = JSON.parse(init.body);
        return new Response(
          JSON.stringify({
            status: "READY_FOR_WALLET",
            buildIntentId: "build-111",
            serializedTransaction: Buffer.from("dummy-tx").toString("base64"),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            summary: {
              fundingAsset: "USDC",
              fundingAmount: "100",
              targetSymbol: "OPENAI",
              expectedTargetAmount: "0.198",
              referencePriceUsd: "500.00",
              currentBuyPriceUsd: "505.00",
              premiumPct: "1.00",
              maxPremiumPct: "5.00",
              maxBuyPriceUsd: "525.00",
            },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 500 });
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    const prepareBtn = await screen.findByRole("button", { name: "Prepare transaction" });
    fireEvent.click(prepareBtn);

    await waitFor(() => expect(capturedBuildBody).toBeDefined());
    expect(capturedBuildBody).toEqual({
      checkId: "check-authoritative-123",
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    });
    // Ensure no other keys are present
    expect(Object.keys(capturedBuildBody)).toEqual(["checkId", "wallet"]);
  });

  // 35. Prepare transaction: SELL calls POST /api/sell/build with ONLY { checkId, wallet }
  it("35. prepare transaction for SELL calls POST /api/sell/build with ONLY { checkId, wallet }", async () => {
    let capturedBuildBody: any = null;

    fetchSpy.mockImplementation(async (url: any, init: any) => {
      const urlStr = url.toString();
      if (urlStr === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (urlStr === "/api/capacity/sell") {
        return new Response(
          JSON.stringify({
            side: "SELL",
            asset: mockMarkets[0],
            outputAsset: "USDC",
            requestedAmount: "2",
            status: "FULLY_WITHIN_BOUNDARY",
            checkId: "check-sell-authoritative-456",
            verifiedCapacity: { economicAmount: "2", effectiveSellPriceUsd: "495.00", expectedUsdcProceeds: "990.00" },
            display: { title: "Within boundary", message: "Verified" },
          }),
          { status: 200 }
        );
      }
      if (urlStr === "/api/sell/build") {
        capturedBuildBody = JSON.parse(init.body);
        return new Response(
          JSON.stringify({
            status: "READY_FOR_WALLET",
            buildIntentId: "build-sell-111",
            serializedTransaction: Buffer.from("dummy-tx").toString("base64"),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            summary: {
              side: "SELL",
              targetSymbol: "OPENAI",
              requestedEconomicAmount: "2",
              actualEconomicAmount: "2",
              expectedUsdcProceeds: "990.00",
              referencePriceUsd: "500.00",
              currentSellPriceUsd: "495.00",
              minimumSellPriceUsd: "475.00",
              maxDiscountPct: "5.00",
              discountBps: 100,
            },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 500 });
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "SELL" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "SELL" }));

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    const prepareBtn = await screen.findByRole("button", { name: "Prepare transaction" });
    fireEvent.click(prepareBtn);

    await waitFor(() => expect(capturedBuildBody).toBeDefined());
    expect(capturedBuildBody).toEqual({
      checkId: "check-sell-authoritative-456",
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    });
    expect(Object.keys(capturedBuildBody)).toEqual(["checkId", "wallet"]);
  });

  // 36. Review and confirmation: opening review dialog presents server summary, Token-2022 disclosures, and allows explicit confirmation
  it("36. opening review dialog presents server summary, Token-2022 disclosures, and allows explicit wallet confirmation", async () => {
    let confirmCalled = false;

    fetchSpy.mockImplementation(async (url: any, init: any) => {
      const urlStr = url.toString();
      if (urlStr === "/api/markets") {
        return new Response(JSON.stringify({ markets: mockMarkets }), { status: 200 });
      }
      if (urlStr === "/api/capacity/buy") {
        return new Response(
          JSON.stringify({
            side: "BUY",
            asset: mockMarkets[0],
            fundingAsset: "USDC",
            requestedAmount: "100",
            status: "FULLY_WITHIN_BOUNDARY",
            checkId: "check-authoritative-123",
            verifiedCapacity: { fundingAmount: "100", effectiveBuyPriceUsd: "505.00", expectedTargetAmount: "0.198" },
            display: { title: "Within boundary", message: "Verified" },
          }),
          { status: 200 }
        );
      }
      if (urlStr === "/api/build") {
        return new Response(
          JSON.stringify({
            status: "READY_FOR_WALLET",
            buildIntentId: "build-111",
            serializedTransaction: Buffer.from("dummy-tx").toString("base64"),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            summary: {
              fundingAsset: "USDC",
              fundingAmount: "100",
              targetSymbol: "OPENAI",
              expectedTargetAmount: "0.198",
              referencePriceUsd: "500.00",
              currentBuyPriceUsd: "505.00",
              premiumPct: "1.00",
              maxPremiumPct: "5.00",
              maxBuyPriceUsd: "525.00",
              issuerControls: {
                permanentDelegate: true,
                pausable: true,
                isPaused: false,
                defaultAccountState: "Initialized",
              },
            },
          }),
          { status: 200 }
        );
      }
      if (urlStr === "/api/confirm") {
        confirmCalled = true;
        return new Response(
          JSON.stringify({
            status: "CONFIRMED",
            receipt: {
              id: "receipt-111",
              status: "CONFIRMED",
              fundingAsset: "USDC",
              fundingAmount: "100",
              targetSymbol: "OPENAI",
              referencePriceUsd: "500.00",
              checkedBuyPriceUsd: "505.00",
              premiumBps: 100,
              signature: "5xyzRealSignatureOnMainnet11111111111111111111111",
              submittedAt: new Date().toISOString(),
              confirmedAt: new Date().toISOString(),
            },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 500 });
    });

    const deserializeSpy = vi.spyOn(VersionedTransaction, "deserialize").mockReturnValue({
      serialize: () => Buffer.from("signed-tx"),
    } as any);

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    const prepareBtn = await screen.findByRole("button", { name: "Prepare transaction" });
    fireEvent.click(prepareBtn);

    // Review dialog should be open
    await waitFor(() => expect(screen.getByText("Final transaction review")).toBeInTheDocument());

    // Check Token-2022 disclosures
    expect(screen.getByText("Issuer retains transfer/burn authority for this token.")).toBeInTheDocument();
    expect(screen.getByText("Issuer retains pause authority for this token.")).toBeInTheDocument();

    // User explicitly clicks "Confirm in wallet"
    const confirmBtn = screen.getByRole("button", { name: "Confirm in wallet" });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(confirmCalled).toBe(true));
    // Receipt should be displayed
    await waitFor(() => expect(screen.getByText("Trade complete")).toBeInTheDocument());

    deserializeSpy.mockRestore();
  });
});
