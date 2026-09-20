import { calculateFee } from "@solana/spl-token";
import { Decimal, rawToEconomicDisplay, toDecimal } from "./decimal";
import type { SellInputConversion } from "../domain/sell-types";

type TransferFeeLike = { basisPoints: number; maximumFee: bigint; epoch?: bigint };

/** Greatest raw wallet debit whose Solana ScaledUiAmount value does not exceed intent. */
export function economicSellAmountToRaw(
  economicAmount: string | number | Decimal,
  decimals: number,
  activeMultiplier: string | number | Decimal = "1"
): bigint {
  const requested = toDecimal(economicAmount);
  const multiplier = toDecimal(activeMultiplier);
  if (!requested.isFinite() || requested.lessThanOrEqualTo(0)) throw new Error("Sell amount must be positive");
  if (!Number.isInteger(decimals) || decimals < 0) throw new Error("Token decimals must be a non-negative integer");
  if (!multiplier.isFinite() || multiplier.lessThanOrEqualTo(0)) throw new Error("Active multiplier must be positive");
  const estimate = requested.mul(new Decimal(10).pow(decimals)).div(multiplier)
    .toDecimalPlaces(0, Decimal.ROUND_FLOOR);
  let low = 0n;
  let high = BigInt(estimate.toFixed(0)) + 4n;
  while (rawToEconomicDisplay(high, decimals, multiplier).lessThanOrEqualTo(requested)) high = high * 2n + 1n;
  let result = 0n;
  while (low <= high) {
    const mid = (low + high) / 2n;
    if (rawToEconomicDisplay(mid, decimals, multiplier).lessThanOrEqualTo(requested)) {
      result = mid; low = mid + 1n;
    } else high = mid - 1n;
  }
  if (result === 0n) throw new Error("Sell amount is below one raw token unit");
  return result;
}

export function deriveSellInputConversion(input: {
  requestedEconomicAmount: string; decimals: number; activeMultiplier?: string;
  transferFee: TransferFeeLike | null;
}): SellInputConversion {
  const multiplier = input.activeMultiplier ?? "1";
  const rawWalletInput = economicSellAmountToRaw(input.requestedEconomicAmount, input.decimals, multiplier);
  const rawTransferFee = input.transferFee ? calculateFee({
    epoch: input.transferFee.epoch ?? 0n, maximumFee: input.transferFee.maximumFee,
    transferFeeBasisPoints: input.transferFee.basisPoints,
  }, rawWalletInput) : 0n;
  return {
    requestedEconomicAmount: toDecimal(input.requestedEconomicAmount).toString(),
    actualEconomicAmount: rawToEconomicDisplay(rawWalletInput, input.decimals, multiplier).toString(),
    rawWalletInput, rawTransferFee, rawRouteInput: rawWalletInput - rawTransferFee,
    decimals: input.decimals, activeMultiplier: toDecimal(multiplier).toString(),
  };
}
