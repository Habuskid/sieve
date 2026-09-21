import { Decimal, toDecimal, rawToEconomicDisplay, rawToDisplay } from "../money/decimal";
import { deriveMaximumBuyPrice, deriveMinimumSellPrice } from "../pricing/calculator";
import type { ProtectionResult } from "../domain/types";

export interface ProtectionDerivationInput {
  fundingUsdValue: string | number | Decimal;
  referencePriceUsd: string | number | Decimal;
  maxPremiumPct: string | number | Decimal;
  expectedTargetTokens: string | number | Decimal; // Expected net economic units
  targetDecimals: number;
  activeMultiplier?: string | number | Decimal;
  maxAllowedSlippageBps?: number;
}

export const DEFAULT_MAX_SLIPPAGE_BPS_CAP = 500; // 5.00% cap

/**
 * Calculates the absolute minimum raw integer token output required to guarantee
 * that the effective purchase price does not exceed maximumBuyPrice:
 * minEconomicTokens = fundingUsdValue / maximumBuyPrice
 *
 * Solana's ScaledUiAmount conversion uses truncated floating-point arithmetic.
 * Therefore, naive continuous division ceil(E * 10^d / mult) can produce a raw
 * integer R that yields LESS than minEconomicTokens when converted back by Solana!
 *
 * To guarantee that the effective price NEVER exceeds maximumBuyPrice, Sieve solves
 * for the exact SMALLEST non-negative raw integer R such that:
 * rawToEconomicDisplay(R, targetDecimals, activeMultiplier) >= minEconomicTokens
 *
 * Because rawToEconomicDisplay is monotonically non-decreasing in R, we compute R
 * using binary search over the monotonic domain around the continuous estimate.
 */
export function calculateMinimumTargetTokensRaw(
  fundingUsdValue: string | number | Decimal,
  maximumBuyPrice: string | number | Decimal,
  targetDecimals: number,
  activeMultiplier?: string | number | Decimal
): bigint {
  const U = toDecimal(fundingUsdValue);
  const M = toDecimal(maximumBuyPrice);
  if (M.lessThanOrEqualTo(0)) {
    throw new Error("Maximum buy price must be positive");
  }
  const minEconomicTokens = U.div(M);
  if (minEconomicTokens.lessThanOrEqualTo(0)) {
    return 0n;
  }
  const mult = activeMultiplier ? toDecimal(activeMultiplier) : new Decimal(1);
  if (mult.lessThanOrEqualTo(0)) {
    throw new Error("Active scaled UI multiplier must be positive");
  }

  // Initial continuous estimate
  const factor = new Decimal(10).pow(targetDecimals);
  const rawEst = minEconomicTokens.mul(factor).div(mult);
  const center = BigInt(rawEst.toDecimalPlaces(0, Decimal.ROUND_FLOOR).toFixed(0));

  // Search bounds around the center estimate
  const slack = BigInt(Math.max(10, Math.ceil(2 / mult.toNumber())));
  let low = center > slack ? center - slack : 0n;
  let high = center + slack;

  // Expand high if needed to ensure it satisfies the condition
  while (rawToEconomicDisplay(high, targetDecimals, mult).lessThan(minEconomicTokens)) {
    high += slack;
    if (high > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Calculated minimum raw output exceeds Number.MAX_SAFE_INTEGER");
    }
  }

  // Monotonic binary search for the smallest R in [low, high] satisfying rawToEconomicDisplay(R) >= minEconomicTokens
  let result = high;
  while (low <= high) {
    const mid = (low + high) / 2n;
    const economic = rawToEconomicDisplay(mid, targetDecimals, mult);
    if (economic.greaterThanOrEqualTo(minEconomicTokens)) {
      result = mid;
      if (mid === 0n) break;
      high = mid - 1n;
    } else {
      low = mid + 1n;
    }
  }

  return result;
}


/**
 * Derives the execution protection parameters (minimum target output and slippage bps)
 * that guarantee the transaction cannot execute outside the user's price limit.
 */
export function deriveAllowedExecutionTolerance(
  input: ProtectionDerivationInput
): ProtectionResult {
  const U = toDecimal(input.fundingUsdValue);
  const R = toDecimal(input.referencePriceUsd);
  const maxPremiumPct = toDecimal(input.maxPremiumPct);
  const Q = toDecimal(input.expectedTargetTokens);
  const capBps = input.maxAllowedSlippageBps ?? DEFAULT_MAX_SLIPPAGE_BPS_CAP;
  const mult = input.activeMultiplier ? toDecimal(input.activeMultiplier) : new Decimal(1);

  // Maximum acceptable buy price: M = R * (1 + P)
  const M = deriveMaximumBuyPrice(R, maxPremiumPct);

  // Minimum required economic tokens to satisfy user boundary: minimumTargetTokens = U / M
  const minTargetTokens = U.div(M);

  // Raw minimum integer representation - MUST use CEIL to guarantee price <= M
  const minTargetRaw = calculateMinimumTargetTokensRaw(U, M, input.targetDecimals, mult);
  const minTargetDisplay = rawToEconomicDisplay(minTargetRaw, input.targetDecimals, mult).toString();

  // If the quoted output is strictly less than the required minimum tokens, it is outside boundary
  if (Q.lessThan(minTargetTokens)) {
    return {
      minimumAcceptableOutputRaw: minTargetRaw,
      minimumAcceptableOutputDisplay: minTargetDisplay,
      slippageBps: 0,
      isExecutable: false,
    };
  }

  // Maximum policy slippage: 1 - (minTargetTokens / Q)
  const policySlippage = new Decimal(1).minus(minTargetTokens.div(Q));
  const policySlippageBps = policySlippage
    .mul(10000)
    .toDecimalPlaces(0, Decimal.ROUND_FLOOR)
    .toNumber();

  // Clamp: never negative, never exceed cap
  const clampedBps = Math.min(Math.max(0, policySlippageBps), capBps);

  return {
    minimumAcceptableOutputRaw: minTargetRaw,
    minimumAcceptableOutputDisplay: minTargetDisplay,
    slippageBps: clampedBps,
    isExecutable: true,
  };
}



export interface SellProtectionDerivationInput {
  economicTokensSold: string | number | Decimal;
  referencePriceUsd: string | number | Decimal;
  maxDiscountPct: string | number | Decimal;
  expectedNetProceedsUsd: string | number | Decimal;
  outputDecimals: number;
  maxAllowedSlippageBps?: number;
}

/**
 * Returns the smallest integer output amount that still satisfies the sell floor.
 * ROUND_CEIL is mandatory: rounding down could permit execution below the user's
 * minimum sell price by one raw output unit.
 */
export function calculateMinimumSellProceedsRaw(
  economicTokensSold: string | number | Decimal,
  minimumSellPriceUsd: string | number | Decimal,
  outputDecimals: number
): bigint {
  const T = toDecimal(economicTokensSold);
  const M = toDecimal(minimumSellPriceUsd);

  if (T.lessThanOrEqualTo(0)) {
    throw new Error("Economic tokens sold must be positive");
  }
  if (M.lessThanOrEqualTo(0)) {
    throw new Error("Minimum sell price must be positive");
  }

  const factor = new Decimal(10).pow(outputDecimals);
  const minimumProceeds = T.mul(M);
  const raw = minimumProceeds
    .mul(factor)
    .toDecimalPlaces(0, Decimal.ROUND_CEIL);

  return BigInt(raw.toFixed(0));
}

/**
 * Derives the minimum USDC output and maximum route slippage compatible with the
 * user's sell-price boundary.
 */
export function deriveAllowedSellExecutionTolerance(
  input: SellProtectionDerivationInput
): ProtectionResult {
  const T = toDecimal(input.economicTokensSold);
  const R = toDecimal(input.referencePriceUsd);
  const maxDiscountPct = toDecimal(input.maxDiscountPct);
  const Q = toDecimal(input.expectedNetProceedsUsd);
  const capBps =
    input.maxAllowedSlippageBps ?? DEFAULT_MAX_SLIPPAGE_BPS_CAP;

  const M = deriveMinimumSellPrice(R, maxDiscountPct);
  const minimumProceeds = T.mul(M);
  const minimumRaw = calculateMinimumSellProceedsRaw(
    T,
    M,
    input.outputDecimals
  );
  const minimumDisplay = rawToDisplay(
    minimumRaw,
    input.outputDecimals
  ).toString();

  if (Q.lessThan(minimumProceeds)) {
    return {
      minimumAcceptableOutputRaw: minimumRaw,
      minimumAcceptableOutputDisplay: minimumDisplay,
      slippageBps: 0,
      isExecutable: false,
    };
  }

  const policySlippage = new Decimal(1).minus(minimumProceeds.div(Q));
  const policySlippageBps = policySlippage
    .mul(10000)
    .toDecimalPlaces(0, Decimal.ROUND_FLOOR)
    .toNumber();

  const clampedBps = Math.min(Math.max(0, policySlippageBps), capBps);

  return {
    minimumAcceptableOutputRaw: minimumRaw,
    minimumAcceptableOutputDisplay: minimumDisplay,
    slippageBps: clampedBps,
    isExecutable: true,
  };
}
