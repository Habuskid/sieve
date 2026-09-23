import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import Home from "@/app/page";
import { LandingHero } from "@/components/landing/landing-hero";
import "@testing-library/jest-dom/vitest";

let mockConnected = false;
let mockPublicKey: { toBase58: () => string } | null = null;
const mockSetVisible = vi.fn();
const mockPush = vi.fn();

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({
    connected: mockConnected,
    publicKey: mockPublicKey,
  }),
}));

vi.mock("@solana/wallet-adapter-react-ui", () => ({
  useWalletModal: () => ({
    setVisible: mockSetVisible,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

const forbiddenAdvisoryWords = [
  "safe",
  "unsafe",
  "recommended",
  "recommendation",
  "recommend",
  "suggested amount",
  "good price",
  "bad price",
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
  "best amount",
  "ideal amount",
];

describe("TASK 11 - Landing Page Positioning (20 Required Proofs)", () => {
  beforeEach(() => {
    mockConnected = false;
    mockPublicKey = null;
    mockSetVisible.mockClear();
    mockPush.mockClear();
  });

  // Proof 1: hero contains "You set the boundary"
  it("Proof 1: hero contains 'You set the boundary'", () => {
    render(<LandingHero />);
    expect(screen.getByText("You set the boundary.")).toBeInTheDocument();
  });

  // Proof 2: hero contains "Sieve enforces it"
  it("Proof 2: hero contains 'Sieve enforces it'", () => {
    render(<LandingHero />);
    expect(screen.getByText("Sieve enforces it.")).toBeInTheDocument();
  });

  // Proof 3: page identifies Sieve as a user-defined execution boundary product
  it("Proof 3: page identifies Sieve as a user-defined execution boundary product", () => {
    const { container } = render(<Home />);
    expect(container.textContent).toMatch(/user-defined execution boundary/i);
  });

  // Proof 4: PreStocks is named in the core product description
  it("Proof 4: PreStocks is named in the core product description", () => {
    const { container } = render(<LandingHero />);
    expect(container.textContent).toContain("PreStocks");
  });

  // Proof 5: Boundary Capacity is explained
  it("Proof 5: Boundary Capacity is explained", () => {
    const { container } = render(<Home />);
    expect(
      screen.getByText(
        "Boundary Capacity shows how much of your requested order was actually verified within your configured boundary."
      )
    ).toBeInTheDocument();
  });

  // Proof 6: BUY and SELL are both represented
  it("Proof 6: BUY and SELL are both represented", () => {
    render(<Home />);
    expect(screen.getByText("Buy PreStocks")).toBeInTheDocument();
    expect(screen.getByText("Sell PreStocks")).toBeInTheDocument();
  });

  // Proof 7: Maximum premium is associated with Buy
  it("Proof 7: Maximum premium is associated with Buy", () => {
    render(<Home />);
    expect(screen.getByText("User sets Maximum Premium")).toBeInTheDocument();
  });

  // Proof 8: Maximum discount is associated with Sell
  it("Proof 8: Maximum discount is associated with Sell", () => {
    render(<Home />);
    expect(screen.getByText("User sets Maximum Discount")).toBeInTheDocument();
  });

  // Proof 9: PreStocks role is reference state
  it("Proof 9: PreStocks role is reference state", () => {
    render(<Home />);
    expect(screen.getByText("Reference state")).toBeInTheDocument();
    expect(
      screen.getAllByText(/Sieve evaluates executable routes against the current PreStocks reference/i).length
    ).toBeGreaterThan(0);
  });

  // Proof 10: Jupiter role is executable route/liquidity
  it("Proof 10: Jupiter role is executable route/liquidity", () => {
    render(<Home />);
    expect(screen.getByText("Executable liquidity")).toBeInTheDocument();
    expect(
      screen.getByText(/Jupiter shows what can execute; Sieve checks whether that execution still fits the boundary you set/i)
    ).toBeInTheDocument();
  });

  // Proof 11: Solana/Token-2022 role is onchain token state/economics
  it("Proof 11: Solana/Token-2022 role is onchain token state/economics", () => {
    render(<Home />);
    expect(screen.getByText("Token-2022 economic state")).toBeInTheDocument();
    expect(
      screen.getByText(/Sieve accounts for Token-2022 economic state such as scaled UI amounts and transfer fees/i)
    ).toBeInTheDocument();
  });

  // Proof 12: page does not say Sieve recommends an amount
  it("Proof 12: page does not say Sieve recommends an amount", () => {
    const { container } = render(<Home />);
    const text = container.textContent?.toLowerCase() || "";
    expect(text).not.toContain("recommend");
    expect(text).not.toContain("recommended amount");
    expect(text).not.toContain("suggested amount");
  });

  // Proof 13: page does not use forbidden advisory language
  it("Proof 13: page does not use forbidden advisory language", () => {
    const { container } = render(<Home />);
    const text = container.textContent?.toLowerCase() || "";
    for (const word of forbiddenAdvisoryWords) {
      expect(text).not.toContain(word);
    }
  });

  // Proof 14: no GOOD_TO_GO user-visible text
  it("Proof 14: no GOOD_TO_GO user-visible text", () => {
    const { container } = render(<Home />);
    expect(container.textContent).not.toContain("GOOD_TO_GO");
    expect(container.textContent).not.toMatch(/good to go/i);
  });

  // Proof 15: no PRICE_TOO_HIGH user-visible text
  it("Proof 15: no PRICE_TOO_HIGH user-visible text", () => {
    const { container } = render(<Home />);
    expect(container.textContent).not.toContain("PRICE_TOO_HIGH");
    expect(container.textContent).not.toMatch(/price too high/i);
  });

  // Proof 16: hardcoded illustrative demo values, if retained, are clearly labeled illustrative
  it("Proof 16: hardcoded illustrative demo values are clearly labeled illustrative", () => {
    render(<LandingHero />);
    expect(screen.getByText("Illustrative example")).toBeInTheDocument();
  });

  // Proof 17: no fake 'live' wording around illustrative data
  it("Proof 17: no fake 'live' wording around illustrative data", () => {
    render(<LandingHero />);
    expect(screen.getByText("Not live market data")).toBeInTheDocument();
    const heroText = screen.getByText("Illustrative example").parentElement?.textContent || "";
    expect(heroText.toLowerCase()).not.toContain("real-time");
    expect(heroText.toLowerCase()).not.toContain("current market rate");
  });

  // Proof 18: CTA routes to actual existing product route
  it("Proof 18: CTA routes to actual existing product route (/buy and /markets)", () => {
    render(<Home />);
    const primaryCtas = screen.getAllByRole("link", { name: /check a boundary/i });
    expect(primaryCtas.length).toBeGreaterThanOrEqual(1);
    for (const cta of primaryCtas) {
      expect(cta).toHaveAttribute("href", "/buy");
    }

    const secondaryCta = screen.getByRole("link", { name: /explore prestocks/i });
    expect(secondaryCta).toHaveAttribute("href", "/markets");
  });

  // Proof 19: no fake metrics/testimonials
  it("Proof 19: no fake metrics or testimonials", () => {
    const { container } = render(<Home />);
    const text = container.textContent?.toLowerCase() || "";
    expect(text).not.toMatch(/\b\d+k?\+?\s*users\b/);
    expect(text).not.toMatch(/\b\d+k?\+?\s*trades\b/);
    expect(text).not.toMatch(/\btvl\b/);
    expect(text).not.toMatch(/\bvolume\b/);
    expect(text).not.toMatch(/\btestimonial\b/);
  });

  // Proof 20: no new pre-IPO provider introduced
  it("Proof 20: no new pre-IPO provider introduced", () => {
    const { container } = render(<Home />);
    const text = container.textContent?.toLowerCase() || "";
    expect(text).not.toContain("forge");
    expect(text).not.toContain("equityzen");
    expect(text).not.toContain("carta");
    expect(text).not.toContain("secfi");
  });

  // Proof 21: Landing hero shows "Connect wallet" button when disconnected
  it("Proof 21: Landing hero shows 'Connect wallet' button when disconnected", () => {
    mockConnected = false;
    render(<LandingHero />);
    const button = screen.getByRole("button", { name: /connect wallet/i });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(mockSetVisible).toHaveBeenCalledWith(true);
  });

  // Proof 22: Landing hero shows "Open dashboard" link to /dashboard when connected
  it("Proof 22: Landing hero shows 'Open dashboard' link to /dashboard when connected", () => {
    mockConnected = true;
    mockPublicKey = { toBase58: () => "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" };
    render(<LandingHero />);
    const link = screen.getByRole("link", { name: /open dashboard/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/dashboard");
  });
});
