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


/**
 * Minimum acceptable sell price.
 * M = R * (1 - D)
 * Where R is the reference price in USD and D is the maximum discount percentage.
 */
export function deriveMinimumSellPrice(
  referencePriceUsd: string | number | Decimal,
  maxDiscountPct: string | number | Decimal
): Decimal {
  const R = toDecimal(referencePriceUsd);
  const D = toDecimal(maxDiscountPct).div(100);

  if (R.lessThanOrEqualTo(0)) {
    throw new Error(`Reference price must be positive, got: ${R.toString()}`);
  }
  if (D.lessThan(0) || D.greaterThanOrEqualTo(1)) {
    throw new Error(`Maximum discount must be between 0% and less than 100%, got: ${toDecimal(maxDiscountPct).toString()}%`);
  }

  return R.mul(new Decimal(1).minus(D));
}

/**
 * Current sell price.
 * C = U / T
 * Where U is the net USDC/USD proceeds and T is the actual economic PreStock units sold.
 */
export function deriveCurrentSellPrice(
  netProceedsUsd: string | number | Decimal,
  economicTokensSold: string | number | Decimal
): Decimal {
  const U = toDecimal(netProceedsUsd);
  const T = toDecimal(economicTokensSold);

  if (U.lessThanOrEqualTo(0)) {
    throw new Error(`Net sell proceeds must be positive, got: ${U.toString()}`);
  }
  if (T.lessThanOrEqualTo(0)) {
    throw new Error(`Economic tokens sold must be positive, got: ${T.toString()}`);
  }

  return U.div(T);
}

/**
 * Sell discount relative to reference.
 * discountPct = ((R - C) / R) * 100
 * Positive values mean the route sells below reference.
 * Negative values mean the route sells above reference.
 */
export function deriveDiscountPct(
  currentSellPriceUsd: string | number | Decimal,
  referencePriceUsd: string | number | Decimal
): Decimal {
  const C = toDecimal(currentSellPriceUsd);
  const R = toDecimal(referencePriceUsd);

  if (R.lessThanOrEqualTo(0)) {
    throw new Error(`Reference price must be positive, got: ${R.toString()}`);
  }

  return R.minus(C).div(R).mul(100);
}
