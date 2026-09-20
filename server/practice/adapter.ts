import { FIXTURE_ASSETS, FIXTURE_SCENARIOS, type FixtureScenario } from "../../lib/fixtures/scenarios";
import type { MarketAsset, MarketQuote, FundingValuation } from "../../core/domain/types";

export class PracticeAdapter {
  /**
   * Returns deterministic practice assets for Testnet mode.
   * All assets are explicitly labeled source: "PRACTICE_FIXTURE" and network: "testnet".
   */
  async getMarkets(): Promise<MarketAsset[]> {
    const now = Date.now();
    return FIXTURE_ASSETS.map((a) => ({
      ...a,
      observedAt: new Date(now - 2000).toISOString(),
    }));
  }

  /**
   * Resolves a practice asset by mint.
   */
  async getMarketByMint(mint: string): Promise<MarketAsset | null> {
    const markets = await this.getMarkets();
    return markets.find((a) => a.mint === mint) ?? null;
  }

  /**
   * Returns a deterministic scenario by ID or matches based on input parameters.
   */
  getScenario(scenarioId?: string): FixtureScenario {
    if (scenarioId && FIXTURE_SCENARIOS[scenarioId]) {
      return FIXTURE_SCENARIOS[scenarioId];
    }
    return FIXTURE_SCENARIOS.PASS_BASIC;
  }

  /**
   * Simulates a quote for Practice/Testnet mode.
   */
  async getQuote(scenarioId?: string): Promise<{
    quote: MarketQuote;
    funding: FundingValuation;
    maxPremiumPct: string;
    asset: MarketAsset;
  }> {
    const scenario = this.getScenario(scenarioId);
    const now = Date.now();

    // Preserve intentionally stale fixture timestamps
    if (scenario.id === "STALE_REFERENCE" || scenario.id === "STALE_QUOTE") {
      return {
        quote: scenario.quote,
        funding: scenario.funding,
        maxPremiumPct: scenario.maxPremiumPct,
        asset: scenario.asset,
      };
    }

    const freshAsset: MarketAsset = {
      ...scenario.asset,
      observedAt: new Date(now - 2000).toISOString(),
    };

    const freshFunding: FundingValuation = {
      ...scenario.funding,
      observedAt: new Date(now - 2000).toISOString(),
    };

    const freshQuote: MarketQuote = {
      ...scenario.quote,
      observedAt: new Date(now - 1000).toISOString(),
      expiresAt: scenario.quote.expiresAt ? new Date(now + 30_000).toISOString() : null,
    };

    return {
      quote: freshQuote,
      funding: freshFunding,
      maxPremiumPct: scenario.maxPremiumPct,
      asset: freshAsset,
    };
  }

  /**
   * Simulates a build-time revalidation quote for Practice/Testnet mode.
   */
  async getRevalidationQuote(scenarioId?: string): Promise<MarketQuote> {
    const scenario = this.getScenario(scenarioId);
    const q = scenario.revalidationQuote ?? scenario.quote;
    const now = Date.now();
    return {
      ...q,
      observedAt: new Date(now - 1000).toISOString(),
      expiresAt: q.expiresAt ? new Date(now + 30_000).toISOString() : null,
    };
  }
}

export const defaultPracticeAdapter = new PracticeAdapter();
