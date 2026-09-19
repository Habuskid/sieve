import { defaultPreStocksAdapter, type PreStocksAdapter } from "../prestocks/adapter";
import { defaultPracticeAdapter, type PracticeAdapter } from "../practice/adapter";
import type { MarketAsset, NetworkMode } from "../../core/domain/types";

export class MarketService {
  constructor(
    private prestocksAdapter: PreStocksAdapter = defaultPreStocksAdapter,
    private practiceAdapter: PracticeAdapter = defaultPracticeAdapter
  ) {}

  /**
   * Fetches supported private markets for the requested network mode.
   */
  async getMarkets(network: NetworkMode): Promise<MarketAsset[]> {
    if (network === "mainnet") {
      return this.prestocksAdapter.fetchMarkets();
    }
    return this.practiceAdapter.getMarkets();
  }

  /**
   * Resolves a single market asset by mint address.
   */
  async getMarketByMint(mint: string, network: NetworkMode): Promise<MarketAsset | null> {
    if (network === "mainnet") {
      return this.prestocksAdapter.getMarketByMint(mint);
    }
    return this.practiceAdapter.getMarketByMint(mint);
  }
}

export const defaultMarketService = new MarketService();
