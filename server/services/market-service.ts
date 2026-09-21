import { defaultPreStocksAdapter, type PreStocksAdapter } from "../prestocks/adapter";
import type { MarketAsset } from "../../core/domain/types";

export class MarketService {
  constructor(private prestocksAdapter: PreStocksAdapter = defaultPreStocksAdapter) {}

  /**
   * Fetches supported private markets from the authoritative Mainnet source.
   */
  async getMarkets(): Promise<MarketAsset[]> {
    return this.prestocksAdapter.fetchMarkets();
  }

  /**
   * Resolves a single market asset by mint address.
   */
  async getMarketByMint(
    mint: string,
    options?: { bypassCache?: boolean }
  ): Promise<MarketAsset | null> {
    return this.prestocksAdapter.getMarketByMint(mint, options);
  }
}

export const defaultMarketService = new MarketService();
