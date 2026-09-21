export type JupiterOrderOutputField = "outAmount" | "otherAmountThreshold";

/**
 * Returns the USDC amount already guaranteed/quoted for the user's wallet.
 *
 * Jupiter Swap V2 documents that its platform fee is included in the quote and
 * deducted automatically, while otherAmountThreshold is the minimum output
 * after slippage. Consequently, outAmount and otherAmountThreshold are already
 * fee-inclusive wallet-output figures. Subtracting platformFee.amount here
 * would charge an output-mint fee twice.
 *
 * See:
 * https://developers.jup.ag/docs/swap/order-and-execute#jupiter-platform-fee
 * https://developers.jup.ag/docs/api-reference/swap/order#otheramountthreshold
 */
export function guaranteedWalletUsdcOutput(input: {
  rawAmount: bigint;
  field: JupiterOrderOutputField;
  outputMint: string;
  expectedUsdcMint: string;
  feeMint?: string | null;
  platformFeeAmount?: string | null;
}): bigint {
  if (input.outputMint !== input.expectedUsdcMint) {
    throw new Error("Jupiter Sell output is not canonical USDC");
  }
  if (input.rawAmount < 0n) throw new Error(`${input.field} cannot be negative`);
  if (input.platformFeeAmount != null && BigInt(input.platformFeeAmount) < 0n) {
    throw new Error("Jupiter platform fee cannot be negative");
  }
  return input.rawAmount;
}
