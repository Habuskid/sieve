import { Decimal, toDecimal, isPositiveFinite, pctToBps } from "../money/decimal";
import {
  deriveMaximumBuyPrice,
  deriveCurrentBuyPrice,
  derivePremiumPct,
  deriveDifferenceUsd,
  deriveMinimumSellPrice,
  deriveCurrentSellPrice,
  deriveDiscountPct,
} from "../pricing/calculator";
import {
  isFresh,
  isExpired,
  DEFAULT_REFERENCE_MAX_AGE_MS,
  DEFAULT_QUOTE_MAX_AGE_MS,
} from "../freshness/freshness";
import type {
  PriceDecision,
  DecisionStatus,
  SellPriceDecision,
  SellDecisionStatus,
} from "../domain/types";

export interface PriceBoundaryInput {
  referencePriceUsd: string | number | Decimal;
  referenceObservedAt: string | number | Date;
  fundingUsdValue: string | number | Decimal;
  expectedTargetTokens: string | number | Decimal;
  maxPremiumPct: string | number | Decimal;
  quoteObservedAt?: string | number | Date | null;
  quoteExpiresAt?: string | number | Date | null;
  priceImpactPct?: string | number | Decimal | null;
  maxAllowedPriceImpactPct?: string | number | Decimal;
  now?: number | Date;
}

export const DEFAULT_MAX_ALLOWED_PRICE_IMPACT_PCT = "10.0"; // 10% max price impact guard

export function evaluatePriceBoundary(input: PriceBoundaryInput): PriceDecision {
  const now = input.now ?? Date.now();
  const maxPremiumPctDec = toDecimal(input.maxPremiumPct);
  const maxPremiumBps = pctToBps(maxPremiumPctDec);

  // 1. Validate reference price
  if (!isPositiveFinite(input.referencePriceUsd)) {
    return createUnavailableDecision(
      "DATA_UNAVAILABLE",
      "Reference price unavailable",
      "We couldn't obtain a valid reference price for this asset.",
      maxPremiumPctDec.toString(),
      maxPremiumBps
    );
  }
  const R = toDecimal(input.referencePriceUsd);

  // 2. Validate funding USD value
  if (!isPositiveFinite(input.fundingUsdValue)) {
    return createUnavailableDecision(
      "DATA_UNAVAILABLE",
      "Funding amount invalid",
      "The funding amount must have a valid positive value.",
      maxPremiumPctDec.toString(),
      maxPremiumBps,
      R.toString()
    );
  }
  const U = toDecimal(input.fundingUsdValue);

  // 3. Validate expected target tokens (route output)
  if (!isPositiveFinite(input.expectedTargetTokens)) {
    return createUnavailableDecision(
      "NO_ROUTE",
      "No market route found",
      "There is currently no executable market route for this token and amount.",
      maxPremiumPctDec.toString(),
      maxPremiumBps,
      R.toString()
    );
  }
  const T = toDecimal(input.expectedTargetTokens);

  // 4. Validate freshness
  if (!isFresh(input.referenceObservedAt, now, DEFAULT_REFERENCE_MAX_AGE_MS)) {
    return createUnavailableDecision(
      "STALE_REFERENCE",
      "Reference price expired",
      "The reference price has expired. Please check today's price again.",
      maxPremiumPctDec.toString(),
      maxPremiumBps,
      R.toString()
    );
  }

  if (input.quoteObservedAt && !isFresh(input.quoteObservedAt, now, DEFAULT_QUOTE_MAX_AGE_MS)) {
    return createUnavailableDecision(
      "STALE_QUOTE",
      "Market quote expired",
      "The market quote has expired. Please check today's price again.",
      maxPremiumPctDec.toString(),
      maxPremiumBps,
      R.toString()
    );
  }

  if (isExpired(input.quoteExpiresAt, now)) {
    return createUnavailableDecision(
      "STALE_QUOTE",
      "Market quote expired",
      "The market quote has expired. Please check today's price again.",
      maxPremiumPctDec.toString(),
      maxPremiumBps,
      R.toString()
    );
  }

  // 5. Validate price impact
  if (input.priceImpactPct !== undefined && input.priceImpactPct !== null) {
    const impact = toDecimal(input.priceImpactPct).abs();
    const maxImpact = toDecimal(input.maxAllowedPriceImpactPct ?? DEFAULT_MAX_ALLOWED_PRICE_IMPACT_PCT);
    if (impact.greaterThan(maxImpact)) {
      return createUnavailableDecision(
        "ROUTE_RISK",
        "Price impact exceeds allowable threshold",
        `This order would move the market price by ${impact.toFixed(2)}%, which exceeds allowable execution thresholds.`,
        maxPremiumPctDec.toString(),
        maxPremiumBps,
        R.toString()
      );
    }
  }

  // 6. Calculate pricing metrics
  const M = deriveMaximumBuyPrice(R, maxPremiumPctDec);
  const C = deriveCurrentBuyPrice(U, T);
  const premiumPct = derivePremiumPct(C, R);
  const premiumBps = pctToBps(premiumPct);
  const differenceUsd = deriveDifferenceUsd(C, R);

  // 7. BR-005 & BR-006: Decision evaluation (<= is GOOD_TO_GO)
  const isInsideLimit = C.lessThanOrEqualTo(M);

  if (isInsideLimit) {
    return {
      status: "GOOD_TO_GO",
      isExecutable: true,
      referencePriceUsd: R.toString(),
      currentBuyPriceUsd: C.toString(),
      maximumBuyPriceUsd: M.toString(),
      premiumPct: premiumPct.toFixed(2),
      maxPremiumPct: maxPremiumPctDec.toFixed(2),
      premiumBps,
      maxPremiumBps,
      differenceUsd: differenceUsd.toString(),
      displayTitle: "Within boundary",
      displayMessage: `Current execution is ${premiumPct.toFixed(2)}% relative to reference price. Your configured maximum premium is ${maxPremiumPctDec.toFixed(2)}%.`,
    };
  } else {
    return {
      status: "PRICE_TOO_HIGH",
      isExecutable: false,
      referencePriceUsd: R.toString(),
      currentBuyPriceUsd: C.toString(),
      maximumBuyPriceUsd: M.toString(),
      premiumPct: premiumPct.toFixed(2),
      maxPremiumPct: maxPremiumPctDec.toFixed(2),
      premiumBps,
      maxPremiumBps,
      differenceUsd: differenceUsd.toString(),
      displayTitle: "Boundary exceeded",
      displayMessage: `Current execution is ${premiumPct.toFixed(2)}% relative to reference price, which exceeds your configured maximum premium of ${maxPremiumPctDec.toFixed(2)}%.`,
    };
  }
}

function createUnavailableDecision(
  status: DecisionStatus,
  displayTitle: string,
  displayMessage: string,
  maxPremiumPct: string,
  maxPremiumBps: number,
  referencePriceUsd: string = "0.00"
): PriceDecision {
  return {
    status,
    isExecutable: false,
    referencePriceUsd,
    currentBuyPriceUsd: null,
    maximumBuyPriceUsd: "0.00",
    premiumPct: null,
    maxPremiumPct,
    premiumBps: null,
    maxPremiumBps,
    differenceUsd: null,
    displayTitle,
    displayMessage,
  };
}


export interface SellPriceBoundaryInput {
  referencePriceUsd: string | number | Decimal;
  referenceObservedAt: string | number | Date;
  economicTokensSold: string | number | Decimal;
  netProceedsUsd: string | number | Decimal;
  maxDiscountPct: string | number | Decimal;
  quoteObservedAt?: string | number | Date | null;
  quoteExpiresAt?: string | number | Date | null;
  priceImpactPct?: string | number | Decimal | null;
  maxAllowedPriceImpactPct?: string | number | Decimal;
  now?: number | Date;
}

/**
 * Evaluates a PreStock -> USDC sell against the user's minimum execution price.
 *
 * Invariant:
 * currentSellPrice = net USDC proceeds / actual economic PreStock units sold
 * minimumSellPrice = referencePrice * (1 - maxDiscount)
 * executable iff currentSellPrice >= minimumSellPrice
 */
export function evaluateSellPriceBoundary(
  input: SellPriceBoundaryInput
): SellPriceDecision {
  const now = input.now ?? Date.now();
  const maxDiscountPctDec = toDecimal(input.maxDiscountPct);
  const maxDiscountBps = pctToBps(maxDiscountPctDec);

  if (
    maxDiscountPctDec.lessThan(0) ||
    maxDiscountPctDec.greaterThanOrEqualTo(100)
  ) {
    return createUnavailableSellDecision(
      "DATA_UNAVAILABLE",
      "Sell limit invalid",
      "Maximum discount must be between 0% and less than 100%.",
      maxDiscountPctDec.toString(),
      maxDiscountBps
    );
  }

  if (!isPositiveFinite(input.referencePriceUsd)) {
    return createUnavailableSellDecision(
      "DATA_UNAVAILABLE",
      "Reference price unavailable",
      "We couldn't obtain a valid reference price for this asset.",
      maxDiscountPctDec.toString(),
      maxDiscountBps
    );
  }
  const R = toDecimal(input.referencePriceUsd);

  if (!isPositiveFinite(input.economicTokensSold)) {
    return createUnavailableSellDecision(
      "DATA_UNAVAILABLE",
      "Sell amount invalid",
      "The amount to sell must be a valid positive token amount.",
      maxDiscountPctDec.toString(),
      maxDiscountBps,
      R.toString()
    );
  }
  const T = toDecimal(input.economicTokensSold);

  if (!isPositiveFinite(input.netProceedsUsd)) {
    return createUnavailableSellDecision(
      "NO_ROUTE",
      "No market route found",
      "There is currently no executable USDC route for this token and amount.",
      maxDiscountPctDec.toString(),
      maxDiscountBps,
      R.toString()
    );
  }
  const U = toDecimal(input.netProceedsUsd);

  if (!isFresh(input.referenceObservedAt, now, DEFAULT_REFERENCE_MAX_AGE_MS)) {
    return createUnavailableSellDecision(
      "STALE_REFERENCE",
      "Reference price expired",
      "The reference price has expired. Please check the sell price again.",
      maxDiscountPctDec.toString(),
      maxDiscountBps,
      R.toString()
    );
  }

  if (
    input.quoteObservedAt &&
    !isFresh(input.quoteObservedAt, now, DEFAULT_QUOTE_MAX_AGE_MS)
  ) {
    return createUnavailableSellDecision(
      "STALE_QUOTE",
      "Market quote expired",
      "The market quote has expired. Please check the sell price again.",
      maxDiscountPctDec.toString(),
      maxDiscountBps,
      R.toString()
    );
  }

  if (isExpired(input.quoteExpiresAt, now)) {
    return createUnavailableSellDecision(
      "STALE_QUOTE",
      "Market quote expired",
      "The market quote has expired. Please check the sell price again.",
      maxDiscountPctDec.toString(),
      maxDiscountBps,
      R.toString()
    );
  }

  if (input.priceImpactPct !== undefined && input.priceImpactPct !== null) {
    const impact = toDecimal(input.priceImpactPct).abs();
    const maxImpact = toDecimal(
      input.maxAllowedPriceImpactPct ?? DEFAULT_MAX_ALLOWED_PRICE_IMPACT_PCT
    );
    if (impact.greaterThan(maxImpact)) {
      return createUnavailableSellDecision(
        "ROUTE_RISK",
        "Price impact exceeds allowable threshold",
        `This order would move the market price by ${impact.toFixed(2)}%, which exceeds allowable execution thresholds.`,
        maxDiscountPctDec.toString(),
        maxDiscountBps,
        R.toString()
      );
    }
  }

  const M = deriveMinimumSellPrice(R, maxDiscountPctDec);
  const C = deriveCurrentSellPrice(U, T);
  const discountPct = deriveDiscountPct(C, R);
  const discountBps = pctToBps(discountPct);
  const differenceUsd = deriveDifferenceUsd(C, R);
  const isInsideLimit = C.greaterThanOrEqualTo(M);

  if (isInsideLimit) {
    return {
      status: "GOOD_TO_GO",
      isExecutable: true,
      referencePriceUsd: R.toString(),
      currentSellPriceUsd: C.toString(),
      minimumSellPriceUsd: M.toString(),
      discountPct: discountPct.toFixed(2),
      maxDiscountPct: maxDiscountPctDec.toFixed(2),
      discountBps,
      maxDiscountBps,
      differenceUsd: differenceUsd.toString(),
      displayTitle: "Within boundary",
      displayMessage: `Current execution is ${discountPct.toFixed(2)}% relative to reference price. Your configured maximum discount is ${maxDiscountPctDec.toFixed(2)}%.`,
    };
  }

  return {
    status: "PRICE_TOO_LOW",
    isExecutable: false,
    referencePriceUsd: R.toString(),
    currentSellPriceUsd: C.toString(),
    minimumSellPriceUsd: M.toString(),
    discountPct: discountPct.toFixed(2),
    maxDiscountPct: maxDiscountPctDec.toFixed(2),
    discountBps,
    maxDiscountBps,
    differenceUsd: differenceUsd.toString(),
    displayTitle: "Boundary exceeded",
    displayMessage: `Current execution is ${discountPct.toFixed(2)}% relative to reference price, which exceeds your configured maximum discount of ${maxDiscountPctDec.toFixed(2)}%.`,
  };
}

function createUnavailableSellDecision(
  status: SellDecisionStatus,
  displayTitle: string,
  displayMessage: string,
  maxDiscountPct: string,
  maxDiscountBps: number,
  referencePriceUsd: string = "0.00"
): SellPriceDecision {
  return {
    status,
    isExecutable: false,
    referencePriceUsd,
    currentSellPriceUsd: null,
    minimumSellPriceUsd: "0.00",
    discountPct: null,
    maxDiscountPct,
    discountBps: null,
    maxDiscountBps,
    differenceUsd: null,
    displayTitle,
    displayMessage,
  };
}
