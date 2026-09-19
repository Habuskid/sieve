import { Decimal, toDecimal } from "../money/decimal";

/**
 * BR-002: Maximum Acceptable Buy Price
 * M = R * (1 + P)
 * Where R is the reference price in USD and P is the maximum premium as a decimal fraction (e.g. 0.05 for 5%).
 */
export function deriveMaximumBuyPrice(
  referencePriceUsd: string | number | Decimal,
  maxPremiumPct: string | number | Decimal
): Decimal {
  const R = toDecimal(referencePriceUsd);
  const P = toDecimal(maxPremiumPct).div(100);
  if (R.lessThanOrEqualTo(0)) {
    throw new Error(`Reference price must be positive, got: ${R.toString()}`);
  }
  return R.mul(new Decimal(1).plus(P));
}

/**
 * BR-003: Current Buy Price
 * C = U / T
 * Where U is the normalized USD value of the funding amount, and T is the expected net target tokens received.
 */
export function deriveCurrentBuyPrice(
  fundingUsdValue: string | number | Decimal,
  expectedTargetTokens: string | number | Decimal
): Decimal {
  const U = toDecimal(fundingUsdValue);
  const T = toDecimal(expectedTargetTokens);
  if (U.lessThanOrEqualTo(0)) {
    throw new Error(`Funding USD value must be positive, got: ${U.toString()}`);
  }
  if (T.lessThanOrEqualTo(0)) {
    throw new Error(`Expected target tokens must be positive, got: ${T.toString()}`);
  }
  return U.div(T);
}

/**
 * BR-004: Premium calculation
 * premiumPct = ((C - R) / R) * 100
 */
export function derivePremiumPct(
  currentBuyPriceUsd: string | number | Decimal,
  referencePriceUsd: string | number | Decimal
): Decimal {
  const C = toDecimal(currentBuyPriceUsd);
  const R = toDecimal(referencePriceUsd);
  if (R.lessThanOrEqualTo(0)) {
    throw new Error(`Reference price must be positive, got: ${R.toString()}`);
  }
  return C.minus(R).div(R).mul(100);
}

/**
 * Derives difference in USD between current buy price and reference price:
 * diff = C - R
 */
export function deriveDifferenceUsd(
  currentBuyPriceUsd: string | number | Decimal,
  referencePriceUsd: string | number | Decimal
): Decimal {
  const C = toDecimal(currentBuyPriceUsd);
  const R = toDecimal(referencePriceUsd);
  return C.minus(R);
}
