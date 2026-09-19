import { FIXTURE_ASSETS, FIXTURE_SCENARIOS, type FixtureScenario } from "../../lib/fixtures/scenarios";
import type { MarketAsset, MarketQuote, FundingValuation } from "../../core/domain/types";

export class PracticeAdapter {
  /**
   * Returns deterministic practice assets for Testnet mode.
   * All assets are explicitly labeled source: "PRACTICE_FIXTURE" and network: "testnet".
   */
  async getMarkets(): Promise<MarketAsset[]> {
    return FIXTURE_ASSETS;
  }

  /**
   * Resolves a practice asset by mint.
   */
  async getMarketByMint(mint: string): Promise<MarketAsset | null> {
    return FIXTURE_ASSETS.find((a) => a.mint === mint) ?? null;
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
    return {
      quote: scenario.quote,
      funding: scenario.funding,
      maxPremiumPct: scenario.maxPremiumPct,
      asset: scenario.asset,
    };
  }

  /**
   * Simulates a build-time revalidation quote for Practice/Testnet mode.
   */
  async getRevalidationQuote(scenarioId?: string): Promise<MarketQuote> {
    const scenario = this.getScenario(scenarioId);
    return scenario.revalidationQuote ?? scenario.quote;
  }
}

export const defaultPracticeAdapter = new PracticeAdapter();
