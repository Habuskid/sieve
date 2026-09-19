import { Decimal, toDecimal, displayToRaw } from "../money/decimal";
import { deriveMaximumBuyPrice } from "../pricing/calculator";
import type { ProtectionResult } from "../domain/types";

export interface ProtectionDerivationInput {
  fundingUsdValue: string | number | Decimal;
  referencePriceUsd: string | number | Decimal;
  maxPremiumPct: string | number | Decimal;
  expectedTargetTokens: string | number | Decimal;
  targetDecimals: number;
  maxAllowedSlippageBps?: number;
}

export const DEFAULT_MAX_SLIPPAGE_BPS_CAP = 500; // 5.00% cap

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

  // Maximum acceptable buy price: M = R * (1 + P)
  const M = deriveMaximumBuyPrice(R, maxPremiumPct);

  // Minimum required tokens to satisfy user boundary: minimumTargetTokens = U / M
  const minTargetTokens = U.div(M);

  // Raw minimum integer representation
  const minTargetRaw = displayToRaw(minTargetTokens, input.targetDecimals, Decimal.ROUND_FLOOR);

  // If the quoted output is strictly less than the required minimum tokens, it is outside boundary
  if (Q.lessThan(minTargetTokens)) {
    return {
      minimumAcceptableOutputRaw: minTargetRaw,
      minimumAcceptableOutputDisplay: minTargetTokens.toFixed(input.targetDecimals),
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
    minimumAcceptableOutputDisplay: minTargetTokens.toFixed(input.targetDecimals),
    slippageBps: clampedBps,
    isExecutable: true,
  };
}
