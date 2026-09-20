import { NextRequest, NextResponse } from "next/server";
import { defaultMarketService } from "@/server/services/market-service";
import type { NetworkMode } from "@/core/domain/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const network = (searchParams.get("network") || "testnet") as NetworkMode;

    if (network !== "mainnet" && network !== "testnet") {
      return NextResponse.json(
        { error: { code: "INVALID_NETWORK", message: "Network must be 'mainnet' or 'testnet'" } },
        { status: 400 }
      );
    }

    const markets = await defaultMarketService.getMarkets(network);
    const observedAt = new Date().toISOString();

    const responseMarkets = markets.map((m) => {
      let diffPct: string | null = null;
      if (m.tokenPriceUsd && m.referencePriceUsd) {
        const ref = parseFloat(m.referencePriceUsd);
        const tok = parseFloat(m.tokenPriceUsd);
        if (ref > 0) {
          diffPct = (((tok - ref) / ref) * 100).toFixed(2);
        }
      }

      return {
        name: m.name,
        symbol: m.symbol,
        mint: m.mint,
        imageUrl: m.imageUrl,
        referencePriceUsd: m.referencePriceUsd,
        sourceTokenPriceUsd: m.tokenPriceUsd,
        differencePct: diffPct,
      };
    });

    return NextResponse.json({
      network,
      source: network === "mainnet" ? "PRESTOCKS" : "PRACTICE_FIXTURE",
      observedAt,
      markets: responseMarkets,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch markets";
    return NextResponse.json(
      { error: { code: "MARKET_FETCH_FAILED", message } },
      { status: 500 }
    );
  }
}
