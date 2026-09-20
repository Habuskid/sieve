import { Decimal, toDecimal, rawToEconomicDisplay } from "../money/decimal";
import { deriveMaximumBuyPrice } from "../pricing/calculator";
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
 * minRaw = ceil((minEconomicTokens * 10^targetDecimals) / activeMultiplier)
 * Uses Decimal.ROUND_CEIL so that any executed trade with at least this amount
 * strictly satisfies: (fundingUsdValue / realizedEconomicTokens) <= maximumBuyPrice.
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
  const mult = activeMultiplier ? toDecimal(activeMultiplier) : new Decimal(1);
  if (mult.lessThanOrEqualTo(0)) {
    throw new Error("Active scaled UI multiplier must be positive");
  }
  const factor = new Decimal(10).pow(targetDecimals);
  const minRawDec = minEconomicTokens.mul(factor).div(mult).toDecimalPlaces(0, Decimal.ROUND_CEIL);
  return BigInt(minRawDec.toFixed(0));
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

