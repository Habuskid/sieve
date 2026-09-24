// UI tests inject an authenticated transport; cryptographic auth is tested separately.
vi.mock("../../lib/wallet-fetch", () => ({ walletFetch: (url: string, init: RequestInit) => fetch(url, init) }));
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { BuyView } from "@/components/buy/buy-view";
import { StateBanner } from "@/components/buy/state-banner";
import { ERROR_REGISTRY, SieveAppError } from "@/server/services/errors";
import { publicError } from "@/server/security/http";
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

describe("Route Availability & Error Mapping UX", () => {
  let fetchSpy: any;

  beforeEach(() => {
    mockConnected = true;
    mockPublicKey = { toBase58: () => "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" };
    mockSignTransaction = vi.fn().mockImplementation(async (tx) => tx);
    mockSetVisible.mockClear();

    fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/markets")) {
        return { ok: true, json: async () => ({ markets: mockMarkets }) } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });
  });

  it("ERROR_REGISTRY contains exact user-facing copy for NO_ROUTE and ROUTE_RISK", () => {
    expect(ERROR_REGISTRY.NO_ROUTE.userTitle).toBe("Route unavailable.");
    expect(ERROR_REGISTRY.NO_ROUTE.userMessage).toBe(
      "No executable Jupiter route is available for this market right now. Try another funding asset or market."
    );
    expect(ERROR_REGISTRY.ROUTE_RISK.userTitle).toBe("Route not supported.");
    expect(ERROR_REGISTRY.ROUTE_RISK.userMessage).toBe(
      "A market route exists, but it is not currently supported by Sieve's verified execution path."
    );
  });

  it("publicError defensively maps raw error strings without leaking internal provider details", async () => {
    const resNoRoute = publicError(new Error("Jupiter quote error: No routes found between mintA and mintB"));
    const dataNoRoute = await resNoRoute.json();
    expect(resNoRoute.status).toBe(404);
    expect(dataNoRoute.error.code).toBe("NO_ROUTE");
    expect(dataNoRoute.error.message).toBe(
      "No executable Jupiter route is available for this market right now. Try another funding asset or market."
    );

    const resRouteRisk = publicError(new Error("Multi-hop route rejected: only direct Meteora DLMM allowed"));
    const dataRouteRisk = await resRouteRisk.json();
    expect(resRouteRisk.status).toBe(400);
    expect(dataRouteRisk.error.code).toBe("ROUTE_RISK");
    expect(dataRouteRisk.error.message).toBe(
      "A market route exists, but it is not currently supported by Sieve's verified execution path."
    );
  });

  it("StateBanner renders explicit copy for NO_ROUTE", () => {
    const { container } = render(<StateBanner state="NO_ROUTE" />);
    expect(container.textContent).toContain("Route unavailable");
    expect(container.textContent).toContain(
      "No executable Jupiter route is available for this market right now. Try another funding asset or market."
    );
    expect(container.textContent).not.toContain("Check failed");
  });

  it("StateBanner renders explicit copy for ROUTE_RISK", () => {
    const { container } = render(<StateBanner state="ROUTE_RISK" />);
    expect(container.textContent).toContain("Route not supported");
    expect(container.textContent).toContain(
      "A market route exists, but it is not currently supported by Sieve's verified execution path."
    );
    expect(container.textContent).not.toContain("Check failed");
  });

  it("BuyView renders NO_ROUTE banner when capacity returns NO_ROUTE (404)", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/markets")) {
        return { ok: true, json: async () => ({ markets: mockMarkets }) } as any;
      }
      if (urlStr.includes("/api/capacity/buy")) {
        return {
          ok: false,
          status: 404,
          json: async () => ({
            error: {
              code: "NO_ROUTE",
              message: "No executable Jupiter route is available for this market right now. Try another funding asset or market.",
            },
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() => {
      expect(screen.getByText("Route unavailable")).toBeInTheDocument();
      expect(
        screen.getByText("No executable Jupiter route is available for this market right now. Try another funding asset or market.")
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("Check failed")).not.toBeInTheDocument();
  });

  it("BuyView renders ROUTE_RISK banner when capacity returns ROUTE_RISK (400)", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/markets")) {
        return { ok: true, json: async () => ({ markets: mockMarkets }) } as any;
      }
      if (urlStr.includes("/api/capacity/buy")) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: {
              code: "ROUTE_RISK",
              message: "A market route exists, but it is not currently supported by Sieve's verified execution path.",
            },
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    render(<BuyView />);
    await waitFor(() => expect(screen.getByText("OpenAI (OPENAI)")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Check boundary" }));

    await waitFor(() => {
      expect(screen.getByText("Route not supported")).toBeInTheDocument();
      expect(
        screen.getByText("A market route exists, but it is not currently supported by Sieve's verified execution path.")
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("Check failed")).not.toBeInTheDocument();
  });
});
