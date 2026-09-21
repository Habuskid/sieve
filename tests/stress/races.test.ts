import { describe, expect, it } from "vitest";
import { evaluatePriceBoundary, evaluateSellPriceBoundary } from "../../core";

const observedAt = () => new Date().toISOString();

describe("deterministic policy concurrency", () => {
  it("evaluates concurrent Buy boundaries without shared mutable state", async () => {
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, index) => Promise.resolve(evaluatePriceBoundary({
        referencePriceUsd: "100",
        referenceObservedAt: observedAt(),
        fundingUsdValue: "100",
        expectedTargetTokens: index % 2 === 0 ? "0.97" : "0.90",
        maxPremiumPct: "5",
        quoteObservedAt: observedAt(),
        quoteExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      })))
    );
    expect(results.filter((result) => result.status === "GOOD_TO_GO")).toHaveLength(50);
    expect(results.filter((result) => result.status === "PRICE_TOO_HIGH")).toHaveLength(50);
  });

  it("evaluates concurrent Sell boundaries without shared mutable state", async () => {
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, index) => Promise.resolve(evaluateSellPriceBoundary({
        referencePriceUsd: "100",
        referenceObservedAt: observedAt(),
        economicTokensSold: "1",
        netProceedsUsd: index % 2 === 0 ? "97" : "94",
        maxDiscountPct: "5",
      })))
    );
    expect(results.filter((result) => result.status === "GOOD_TO_GO")).toHaveLength(50);
    expect(results.filter((result) => result.status === "PRICE_TOO_LOW")).toHaveLength(50);
  });
});
