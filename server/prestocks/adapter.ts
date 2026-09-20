import { RawPreStocksResponseSchema } from "./schema";
import type { MarketAsset } from "../../core/domain/types";

export interface PreStocksAdapterConfig {
  apiUrl?: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
}

let cache: { data: MarketAsset[]; timestamp: number } | null = null;

export class PreStocksAdapter {
  private apiUrl: string;
  private timeoutMs: number;
  private cacheTtlMs: number;

  constructor(config: PreStocksAdapterConfig = {}) {
    this.apiUrl = config.apiUrl || process.env.PRESTOCKS_API_URL || "https://prestocks.com/api/prestocks";
    this.timeoutMs = config.timeoutMs ?? 8000;
    this.cacheTtlMs = config.cacheTtlMs ?? 15000; // 15s cache
  }

  /**
   * Fetches and normalizes the current list of PreStocks assets from the official API.
   */
  async fetchMarkets(bypassCache: boolean = false): Promise<MarketAsset[]> {
    const now = Date.now();
    if (!bypassCache && cache && now - cache.timestamp < this.cacheTtlMs) {
      return cache.data;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.apiUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Sieve-App/1.0",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`PreStocks API returned HTTP status ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      const parseResult = RawPreStocksResponseSchema.safeParse(json);

      if (!parseResult.success) {
        throw new Error(`PreStocks API response schema validation failed: ${parseResult.error.message}`);
      }

      const observedAt = new Date().toISOString();
      const normalized: MarketAsset[] = parseResult.data.map((item) => ({
        name: item.name,
        symbol: item.symbol,
        mint: item.contract_address,
        imageUrl: item.image ?? null,
        productUrl: item.external_url ?? null,
        referencePriceUsd: item.markPrice.toString(),
        tokenPriceUsd: item.tokenPrice != null ? item.tokenPrice.toString() : null,
        referenceValuationUsd: item.markValuation != null ? item.markValuation.toString() : null,
        impliedValuationUsd: item.impliedValuation != null ? item.impliedValuation.toString() : null,
        supply: item.supply != null ? item.supply.toString() : null,
        source: "PRESTOCKS",
        observedAt,
        network: "mainnet",
      }));

      cache = { data: normalized, timestamp: now };
      return normalized;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`PreStocks API request timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Resolves a specific PreStocks asset by its SPL token mint address.
   */
  async getMarketByMint(mint: string, options?: { bypassCache?: boolean }): Promise<MarketAsset | null> {
    const markets = await this.fetchMarkets(options?.bypassCache ?? false);
    return markets.find((m) => m.mint === mint) ?? null;
  }
}

export const defaultPreStocksAdapter = new PreStocksAdapter();
