import { describe, it, expect } from "vitest";
import {
  toDecimal,
  rawToDisplay,
  displayToRaw,
  pctToBps,
  bpsToPct,
  deriveMaximumBuyPrice,
  deriveCurrentBuyPrice,
  derivePremiumPct,
  deriveDifferenceUsd,
  deriveMinimumSellPrice,
  deriveCurrentSellPrice,
  deriveDiscountPct,
  evaluateSellPriceBoundary,
  deriveAllowedSellExecutionTolerance,
  calculateMinimumSellProceedsRaw,
  isFresh,
  isExpired,
  evaluatePriceBoundary,
  deriveAllowedExecutionTolerance,
  calculateMinimumTargetTokensRaw,
  rawToEconomicDisplay,
  Decimal,
} from "../../core";


describe("Core Money and Decimal Layer", () => {
  it("converts raw bigint to display decimal correctly for various token decimals", () => {
    // USDC: 6 decimals (10 USDC)
    expect(rawToDisplay(10_000_000n, 6).toString()).toBe("10");

    // SOL: 9 decimals (1.5 SOL)
    expect(rawToDisplay(1_500_000_000n, 9).toString()).toBe("1.5");

    // Custom 8 decimals (0.00012345)
    expect(rawToDisplay(12345n, 8).toString()).toBe("0.00012345");
  });

  it("converts display decimal to raw bigint with floor rounding for safety", () => {
    expect(displayToRaw("10", 6)).toBe(10_000_000n);
    expect(displayToRaw("1.5", 9)).toBe(1_500_000_000n);
    expect(displayToRaw("0.00012345", 8)).toBe(12345n);

    // Floor rounding handles fractional sub-units without over-promising
    expect(displayToRaw("1.0000009", 6)).toBe(1_000_000n);
  });

  it("handles very large and very small numbers without precision loss", () => {
    const large = "1000000000000000.123456";
    const small = "0.000000000000001";
    expect(toDecimal(large).toString()).toBe(large);
    expect(toDecimal(small).toString()).toBe(small);
  });

  it("converts percentage to basis points and vice versa", () => {
    expect(pctToBps("5")).toBe(500);
    expect(pctToBps("5.25")).toBe(525);
    expect(pctToBps("0.01")).toBe(1);
    expect(pctToBps("0")).toBe(0);

    expect(bpsToPct(500)).toBe("5.00");
    expect(bpsToPct(525)).toBe("5.25");
    expect(bpsToPct(1)).toBe("0.01");
  });

  it("throws for invalid decimal inputs", () => {
    expect(() => toDecimal("invalid")).toThrow();
    expect(() => toDecimal(NaN)).toThrow();
    expect(() => toDecimal(Infinity)).toThrow();
  });
});

describe("Core Pricing Calculator (BR-002, BR-003, BR-004)", () => {
  it("derives maximum buy price: M = R * (1 + P)", () => {
    // R = 100, P = 5% -> M = 105
    const maxPrice = deriveMaximumBuyPrice("100.00", "5.00");
    expect(maxPrice.toString()).toBe("105");

    // R = 987.88, P = 10% -> M = 1086.668
    const maxPrice2 = deriveMaximumBuyPrice("987.88", "10.00");
    expect(maxPrice2.toString()).toBe("1086.668");
  });

  it("derives current buy price: C = U / T", () => {
    // $10 funding, 0.01 tokens -> $1000/token
    const currentPrice = deriveCurrentBuyPrice("10.00", "0.01");
    expect(currentPrice.toString()).toBe("1000");

    // $10 funding, 0.005798185 tokens
    const currentPrice2 = deriveCurrentBuyPrice("10.00", "0.005798185");
    expect(currentPrice2.toFixed(4)).toBe("1724.6776");
  });

  it("derives premium percentage: premium = ((C - R) / R) * 100", () => {
    // C = 105, R = 100 -> +5%
    expect(derivePremiumPct("105", "100").toString()).toBe("5");

    // C = 95, R = 100 -> -5% (discount)
    expect(derivePremiumPct("95", "100").toString()).toBe("-5");
  });

  it("derives difference in USD: diff = C - R", () => {
    expect(deriveDifferenceUsd("105", "100").toString()).toBe("5");
    expect(deriveDifferenceUsd("95", "100").toString()).toBe("-5");
  });
});

describe("Core Freshness and Expiration", () => {
  const now = 1700000000000;

  it("recognizes fresh timestamps within maxAge", () => {
    // Observed 10 seconds ago, maxAge 30s -> fresh
    expect(isFresh(now - 10_000, now, 30_000)).toBe(true);

    // Exactly at maxAge -> fresh
    expect(isFresh(now - 30_000, now, 30_000)).toBe(true);
  });

  it("identifies stale timestamps exceeding maxAge", () => {
    // Observed 31 seconds ago, maxAge 30s -> stale
    expect(isFresh(now - 31_000, now, 30_000)).toBe(false);
  });

  it("detects expired quote timestamps", () => {
    expect(isExpired(now - 1000, now)).toBe(true);
    expect(isExpired(now + 5000, now)).toBe(false);
    expect(isExpired(null, now)).toBe(false);
  });
});

describe("Policy Evaluator (BR-005, BR-006, BR-007, BR-008)", () => {
  const now = 1700000000000;

  it("PASS_BASIC: Reference 100, Current 103, Limit 5% -> GOOD_TO_GO", () => {
    const decision = evaluatePriceBoundary({
      referencePriceUsd: "100.00",
      referenceObservedAt: now - 5000,
      fundingUsdValue: "103.00",
      expectedTargetTokens: "1.00", // Current price = 103.00
      maxPremiumPct: "5.00",
      quoteObservedAt: now - 2000,
      now,
    });

    expect(decision.status).toBe("GOOD_TO_GO");
    expect(decision.isExecutable).toBe(true);
    expect(decision.premiumPct).toBe("3.00");
    expect(decision.currentBuyPriceUsd).toBe("103");
    expect(decision.maximumBuyPriceUsd).toBe("105");
  });

  it("PASS_EXACT_BOUNDARY: Reference 100, Current 105, Limit 5% -> GOOD_TO_GO", () => {
    const decision = evaluatePriceBoundary({
      referencePriceUsd: "100.00",
      referenceObservedAt: now - 5000,
      fundingUsdValue: "105.00",
      expectedTargetTokens: "1.00", // Current price = 105.00
      maxPremiumPct: "5.00",
      quoteObservedAt: now - 2000,
      now,
    });

    expect(decision.status).toBe("GOOD_TO_GO");
    expect(decision.isExecutable).toBe(true);
    expect(decision.premiumPct).toBe("5.00");
  });

  it("BLOCK_ONE_BP_OVER: Reference 100, Current 105.01, Limit 5% -> PRICE_TOO_HIGH", () => {
    const decision = evaluatePriceBoundary({
      referencePriceUsd: "100.00",
      referenceObservedAt: now - 5000,
      fundingUsdValue: "105.01",
      expectedTargetTokens: "1.00", // Current price = 105.01
      maxPremiumPct: "5.00",
      quoteObservedAt: now - 2000,
      now,
    });

    expect(decision.status).toBe("PRICE_TOO_HIGH");
    expect(decision.isExecutable).toBe(false);
    expect(decision.premiumPct).toBe("5.01");
  });

  it("DISCOUNT: Reference 100, Current 92, Limit 5% -> GOOD_TO_GO", () => {
    const decision = evaluatePriceBoundary({
      referencePriceUsd: "100.00",
      referenceObservedAt: now - 5000,
      fundingUsdValue: "92.00",
      expectedTargetTokens: "1.00",
      maxPremiumPct: "5.00",
      quoteObservedAt: now - 2000,
      now,
    });

    expect(decision.status).toBe("GOOD_TO_GO");
    expect(decision.isExecutable).toBe(true);
    expect(decision.premiumPct).toBe("-8.00");
  });

  it("STALE_REFERENCE: Expired reference fails closed", () => {
    const decision = evaluatePriceBoundary({
      referencePriceUsd: "100.00",
      referenceObservedAt: now - 65_000, // 65s old (> 60s)
      fundingUsdValue: "100.00",
      expectedTargetTokens: "1.00",
      maxPremiumPct: "5.00",
      quoteObservedAt: now - 2000,
      now,
    });

    expect(decision.status).toBe("STALE_REFERENCE");
    expect(decision.isExecutable).toBe(false);
  });

  it("STALE_QUOTE: Expired quote fails closed", () => {
    const decision = evaluatePriceBoundary({
      referencePriceUsd: "100.00",
      referenceObservedAt: now - 5000,
      fundingUsdValue: "100.00",
      expectedTargetTokens: "1.00",
      maxPremiumPct: "5.00",
      quoteObservedAt: now - 35_000, // 35s old (> 30s)
      now,
    });

    expect(decision.status).toBe("STALE_QUOTE");
    expect(decision.isExecutable).toBe(false);
  });

  it("NO_ROUTE: Zero target output fails closed", () => {
    const decision = evaluatePriceBoundary({
      referencePriceUsd: "100.00",
      referenceObservedAt: now - 5000,
      fundingUsdValue: "100.00",
      expectedTargetTokens: "0",
      maxPremiumPct: "5.00",
      quoteObservedAt: now - 2000,
      now,
    });

    expect(decision.status).toBe("NO_ROUTE");
    expect(decision.isExecutable).toBe(false);
  });

  it("ROUTE_RISK: Excessive price impact fails closed", () => {
    const decision = evaluatePriceBoundary({
      referencePriceUsd: "100.00",
      referenceObservedAt: now - 5000,
      fundingUsdValue: "100.00",
      expectedTargetTokens: "1.00",
      maxPremiumPct: "5.00",
      priceImpactPct: "15.5", // 15.5% > 10% max
      quoteObservedAt: now - 2000,
      now,
    });

    expect(decision.status).toBe("ROUTE_RISK");
    expect(decision.isExecutable).toBe(false);
  });
});

describe("Protection Derivation (BR-017, Audit Repair 3)", () => {
  it("calculates minimum raw target tokens using ROUND_CEIL to strictly prevent price limit breach", () => {
    // Exact integer division: $100 funding, $10 max price, 6 decimals -> exactly 10.0 tokens -> 10,000,000 units
    const exactRaw = calculateMinimumTargetTokensRaw("100.00", "10.00", 6);
    expect(exactRaw).toBe(10_000_000n);

    // Fractional raw units: $10 funding, $105 max price, 6 decimals
    // 10 / 105 = 0.095238095238... tokens = 95238.095238... raw units
    // Ceiling MUST yield 95239n (floor would yield 95238n)
    const ceilRaw = calculateMinimumTargetTokensRaw("10.00", "105.00", 6);
    expect(ceilRaw).toBe(95239n);

    // Mathematical verification:
    // With 95239 units (0.095239 tokens):
    // Buy price = 10 / 0.095239 = 104.99899... <= 105.00 (PASSES INVARIANT)
    const priceAtCeil = new Decimal(10).div(new Decimal(95239).div(1_000_000));
    expect(priceAtCeil.lessThanOrEqualTo(105)).toBe(true);

    // With 1 raw unit below (95238 units, 0.095238 tokens):
    // Buy price = 10 / 0.095238 = 105.000105... > 105.00 (VIOLATES INVARIANT!)
    const priceAtFloor = new Decimal(10).div(new Decimal(95238).div(1_000_000));
    expect(priceAtFloor.greaterThan(105)).toBe(true);
  });

  it("derives conservative slippage and minimum raw target output within policy limit using ceiling", () => {
    // Reference = 100, Limit = 5% -> Max Price M = 105
    // Funding = $10.00, Target Decimals = 6
    // Minimum required tokens = 10 / 105 = 0.095238095... tokens
    // Minimum raw target with ROUND_CEIL = 95,239 units
    // Quoted target = 0.098 tokens (current price = $102.04, inside limit)
    const result = deriveAllowedExecutionTolerance({
      fundingUsdValue: "10.00",
      referencePriceUsd: "100.00",
      maxPremiumPct: "5.00",
      expectedTargetTokens: "0.098",
      targetDecimals: 6,
    });

    expect(result.isExecutable).toBe(true);
    expect(result.minimumAcceptableOutputRaw).toBe(95239n);
    expect(result.minimumAcceptableOutputDisplay).toBe("0.095239");

    // Slippage = 1 - (0.095238 / 0.098) = 0.02818 -> 281 bps
    expect(result.slippageBps).toBe(281);
  });

  it("returns not executable when quoted output is already below required minimum", () => {
    // Quoted target = 0.090 tokens -> Buy price is $111.11, above $105 limit
    const result = deriveAllowedExecutionTolerance({
      fundingUsdValue: "10.00",
      referencePriceUsd: "100.00",
      maxPremiumPct: "5.00",
      expectedTargetTokens: "0.090",
      targetDecimals: 6,
    });

    expect(result.isExecutable).toBe(false);
    expect(result.slippageBps).toBe(0);
  });

  it("clamps slippage to maximum allowed cap", () => {
    // Huge room: Quoted = 1.0 token, Min required = 0.095 tokens
    // Raw policy slippage would be ~90%, but cap is 500 bps (5%)
    const result = deriveAllowedExecutionTolerance({
      fundingUsdValue: "10.00",
      referencePriceUsd: "100.00",
      maxPremiumPct: "5.00",
      expectedTargetTokens: "1.00",
      targetDecimals: 6,
      maxAllowedSlippageBps: 500,
    });

    expect(result.isExecutable).toBe(true);
    expect(result.slippageBps).toBe(500);
  });

  it("regression (Issue 4): preserves full Decimal precision and never rounds USD values downward to weaken boundary", () => {
    // Test values: 1.234, 1.239, 0.0149
    const testCases = [
      { fundingUsd: "1.234", referenceUsd: "10.00", maxPremiumPct: "5.00" },
      { fundingUsd: "1.239", referenceUsd: "10.00", maxPremiumPct: "5.00" },
      { fundingUsd: "0.0149", referenceUsd: "1.00", maxPremiumPct: "5.00" },
    ];

    for (const tc of testCases) {
      const maxPrice = deriveMaximumBuyPrice(tc.referenceUsd, tc.maxPremiumPct);
      // Derive minimum target tokens with full precision
      const minTokensRaw = calculateMinimumTargetTokensRaw(tc.fundingUsd, maxPrice, 6);
      const minTokens = new Decimal(minTokensRaw.toString()).div(1_000_000);

      // Verify that at minTokens, effective buy price is strictly <= maxPrice
      const effectivePrice = new Decimal(tc.fundingUsd).div(minTokens);
      expect(effectivePrice.lessThanOrEqualTo(maxPrice)).toBe(true);

      // Verify that if fundingUsd had been rounded down (e.g. 1.239 -> 1.23),
      // a lower output would have been allowed that breaches the true limit
      const roundedDownFunding = new Decimal(tc.fundingUsd).toDecimalPlaces(2, Decimal.ROUND_DOWN);
      if (roundedDownFunding.lessThan(tc.fundingUsd)) {
        const weakenedMinTokensRaw = calculateMinimumTargetTokensRaw(roundedDownFunding, maxPrice, 6);
        const weakenedMinTokens = new Decimal(weakenedMinTokensRaw.toString()).div(1_000_000);
        // If evaluated against true funding, weakened tokens would exceed max price
        const breachedPrice = new Decimal(tc.fundingUsd).div(weakenedMinTokens);
        expect(breachedPrice.greaterThan(maxPrice)).toBe(true);
      }
    }
  });

  it("ScaledUiAmount: rawToEconomicDisplay matches Solana's truncated integer arithmetic exactly", () => {
    // 1. Multiplier = 1: standard scaling
    expect(rawToEconomicDisplay(1_000_000n, 6, 1).toString()).toBe("1");
    expect(rawToEconomicDisplay(1_500_000n, 6, "1").toString()).toBe("1.5");

    // 2. Multiplier > 1 with truncation:
    // raw = 1,000,001n, multiplier = 1.4861347 (OpenAI live config)
    // 1000001 * 1.4861347 = 1486136.1861347 -> trunc = 1486136
    // 1486136 / 10^6 = 1.486136
    const openaiOut = rawToEconomicDisplay(1_000_001n, 6, "1.4861347");
    expect(openaiOut.toString()).toBe("1.486136");

    // 3. Multiplier < 1 with truncation:
    // raw = 1,000,001n, multiplier = 0.8
    // 1000001 * 0.8 = 800000.8 -> trunc = 800000
    // 800000 / 10^6 = 0.8
    const scaledDown = rawToEconomicDisplay(1_000_001n, 6, "0.8");
    expect(scaledDown.toString()).toBe("0.8");

    // 4. Fail closed when raw exceeds Number.MAX_SAFE_INTEGER
    const overLimit = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    expect(() => rawToEconomicDisplay(overLimit, 6, "1.5")).toThrow("exceeds Number.MAX_SAFE_INTEGER");
  });

  it("ScaledUiAmount: calculateMinimumTargetTokensRaw binary search finds exact smallest integer R", () => {
    // Test cases: mult = 1, mult > 1, mult < 1, SpaceX (mult = 5), OpenAI (mult = 1.4861347)
    const configs = [
      { name: "multiplier = 1", mult: "1", decimals: 6, fundingUsd: "100.00", maxPrice: "105.00" },
      { name: "multiplier = 1.5", mult: "1.5", decimals: 6, fundingUsd: "100.00", maxPrice: "105.00" },
      { name: "multiplier = 0.8", mult: "0.8", decimals: 6, fundingUsd: "50.00", maxPrice: "105.00" },
      { name: "SpaceX (mult = 5, dec = 9)", mult: "5", decimals: 9, fundingUsd: "100.00", maxPrice: "105.00" },
      { name: "OpenAI (mult = 1.4861347, dec = 9)", mult: "1.4861347", decimals: 9, fundingUsd: "100.00", maxPrice: "105.00" },
    ];

    for (const cfg of configs) {
      const minEconomic = new Decimal(cfg.fundingUsd).div(new Decimal(cfg.maxPrice));
      const R = calculateMinimumTargetTokensRaw(cfg.fundingUsd, cfg.maxPrice, cfg.decimals, cfg.mult);

      // R MUST satisfy: rawToEconomicDisplay(R) >= minEconomic
      const economicAtR = rawToEconomicDisplay(R, cfg.decimals, cfg.mult);
      expect(economicAtR.greaterThanOrEqualTo(minEconomic)).toBe(true);

      // R - 1 MUST fail: rawToEconomicDisplay(R - 1) < minEconomic
      if (R > 0n) {
        const economicBelowR = rawToEconomicDisplay(R - 1n, cfg.decimals, cfg.mult);
        expect(economicBelowR.lessThan(minEconomic)).toBe(true);
      }
    }
  });

});





describe("Sell Pricing Calculator", () => {
  it("derives minimum sell price: M = R * (1 - D)", () => {
    expect(deriveMinimumSellPrice("100", "5").toString()).toBe("95");
    expect(deriveMinimumSellPrice("987.88", "10").toString()).toBe("889.092");
  });

  it("derives current sell price from net proceeds per economic token sold", () => {
    expect(deriveCurrentSellPrice("97", "1").toString()).toBe("97");
    expect(deriveCurrentSellPrice("48.5", "0.5").toString()).toBe("97");
  });

  it("derives positive discount below reference and negative discount above reference", () => {
    expect(deriveDiscountPct("97", "100").toString()).toBe("3");
    expect(deriveDiscountPct("105", "100").toString()).toBe("-5");
  });

  it("rejects a 100% or greater maximum discount", () => {
    expect(() => deriveMinimumSellPrice("100", "100")).toThrow();
    expect(() => deriveMinimumSellPrice("100", "101")).toThrow();
  });
});

describe("Sell Policy Evaluator", () => {
  const now = 1700000000000;

  it("passes when sell price is above the minimum floor", () => {
    const decision = evaluateSellPriceBoundary({
      referencePriceUsd: "100",
      referenceObservedAt: now - 5_000,
      economicTokensSold: "1",
      netProceedsUsd: "97",
      maxDiscountPct: "5",
      quoteObservedAt: now - 2_000,
      now,
    });

    expect(decision.status).toBe("GOOD_TO_GO");
    expect(decision.isExecutable).toBe(true);
    expect(decision.currentSellPriceUsd).toBe("97");
    expect(decision.minimumSellPriceUsd).toBe("95");
    expect(decision.discountPct).toBe("3.00");
  });

  it("passes exactly at the sell boundary", () => {
    const decision = evaluateSellPriceBoundary({
      referencePriceUsd: "100",
      referenceObservedAt: now - 5_000,
      economicTokensSold: "1",
      netProceedsUsd: "95",
      maxDiscountPct: "5",
      quoteObservedAt: now - 2_000,
      now,
    });

    expect(decision.status).toBe("GOOD_TO_GO");
    expect(decision.isExecutable).toBe(true);
    expect(decision.discountPct).toBe("5.00");
  });

  it("blocks one cent below the sell boundary", () => {
    const decision = evaluateSellPriceBoundary({
      referencePriceUsd: "100",
      referenceObservedAt: now - 5_000,
      economicTokensSold: "1",
      netProceedsUsd: "94.99",
      maxDiscountPct: "5",
      quoteObservedAt: now - 2_000,
      now,
    });

    expect(decision.status).toBe("PRICE_TOO_LOW");
    expect(decision.isExecutable).toBe(false);
    expect(decision.discountPct).toBe("5.01");
  });

  it("accepts a route selling above reference", () => {
    const decision = evaluateSellPriceBoundary({
      referencePriceUsd: "100",
      referenceObservedAt: now - 5_000,
      economicTokensSold: "1",
      netProceedsUsd: "105",
      maxDiscountPct: "5",
      quoteObservedAt: now - 2_000,
      now,
    });

    expect(decision.status).toBe("GOOD_TO_GO");
    expect(decision.discountPct).toBe("-5.00");
  });

  it("fails closed on zero proceeds and excessive price impact", () => {
    const noRoute = evaluateSellPriceBoundary({
      referencePriceUsd: "100",
      referenceObservedAt: now - 5_000,
      economicTokensSold: "1",
      netProceedsUsd: "0",
      maxDiscountPct: "5",
      quoteObservedAt: now - 2_000,
      now,
    });
    expect(noRoute.status).toBe("NO_ROUTE");

    const routeRisk = evaluateSellPriceBoundary({
      referencePriceUsd: "100",
      referenceObservedAt: now - 5_000,
      economicTokensSold: "1",
      netProceedsUsd: "97",
      maxDiscountPct: "5",
      quoteObservedAt: now - 2_000,
      priceImpactPct: "12",
      now,
    });
    expect(routeRisk.status).toBe("ROUTE_RISK");
  });
});

describe("Sell Protection Derivation", () => {
  it("ceil-rounds minimum USDC output so one raw unit cannot weaken the sell floor", () => {
    const minimumRaw = calculateMinimumSellProceedsRaw(
      "0.333333333333",
      "95",
      6
    );

    expect(minimumRaw).toBe(31_666_667n);

    const minimumDisplay = new Decimal(minimumRaw.toString()).div(1_000_000);
    const effectiveSellPrice = minimumDisplay.div("0.333333333333");
    expect(effectiveSellPrice.greaterThanOrEqualTo(95)).toBe(true);

    const oneRawLower = new Decimal((minimumRaw - 1n).toString()).div(1_000_000);
    const weakenedPrice = oneRawLower.div("0.333333333333");
    expect(weakenedPrice.lessThan(95)).toBe(true);
  });

  it("derives a minimum USDC output and policy-compatible slippage", () => {
    const result = deriveAllowedSellExecutionTolerance({
      economicTokensSold: "1",
      referencePriceUsd: "100",
      maxDiscountPct: "5",
      expectedNetProceedsUsd: "100",
      outputDecimals: 6,
    });

    expect(result.isExecutable).toBe(true);
    expect(result.minimumAcceptableOutputRaw).toBe(95_000_000n);
    expect(result.minimumAcceptableOutputDisplay).toBe("95");
    expect(result.slippageBps).toBe(500);
  });

  it("blocks when the quoted sell proceeds are already below the user's floor", () => {
    const result = deriveAllowedSellExecutionTolerance({
      economicTokensSold: "1",
      referencePriceUsd: "100",
      maxDiscountPct: "5",
      expectedNetProceedsUsd: "94.99",
      outputDecimals: 6,
    });

    expect(result.isExecutable).toBe(false);
    expect(result.slippageBps).toBe(0);
    expect(result.minimumAcceptableOutputRaw).toBe(95_000_000n);
  });
});
