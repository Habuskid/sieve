import { z } from "zod";

export const JupiterSwapInfoSchema = z.object({
  ammKey: z.string(),
  label: z.string(),
  inputMint: z.string(),
  outputMint: z.string(),
  inAmount: z.string(),
  outAmount: z.string(),
});

export const JupiterRoutePlanStepSchema = z.object({
  swapInfo: JupiterSwapInfoSchema,
  percent: z.number(),
  bps: z.number(),
  usdValue: z.number().optional(),
});

/**
 * Jupiter /swap/v2/order response schema with authoritative fee and routing fields.
 * Field Classification:
 * - Pricing inputs: inAmount, outAmount, inUsdValue, outUsdValue, otherAmountThreshold, feeMint, feeBps, platformFee
 * - Wallet fee estimates: signatureFeeLamports, prioritizationFeeLamports, rentFeeLamports (paid by taker)
 * - Execution reconciliation: requestId, lastValidBlockHeight, transaction
 */
export const JupiterPlatformFeeSchema = z.object({
  amount: z.string().optional(),
  feeBps: z.number().optional(),
  feeMint: z.string().optional(),
});

export const JupiterOrderResponseSchema = z.object({
  inAmount: z.string(),
  outAmount: z.string(),
  inUsdValue: z.number().optional().nullable(),
  outUsdValue: z.number().optional().nullable(),
  priceImpact: z.number().optional().nullable(),
  priceImpactPct: z.string().optional().nullable(),
  otherAmountThreshold: z.string().optional().nullable(),
  swapMode: z.string().optional(),
  slippageBps: z.number().optional(),
  routePlan: z.array(JupiterRoutePlanStepSchema).optional().default([]),
  transaction: z.string().nullable().optional(),
  lastValidBlockHeight: z.string().optional().nullable(),
  requestId: z.string(),
  router: z.string().optional(),
  feeMint: z.string().nullable().optional(),
  feeBps: z.number().nullable().optional(),
  platformFee: JupiterPlatformFeeSchema.nullable().optional(),
  signatureFeeLamports: z.number().nullable().optional(),
  signatureFeePayer: z.string().nullable().optional(),
  prioritizationFeeLamports: z.number().nullable().optional(),
  prioritizationFeePayer: z.string().nullable().optional(),
  rentFeeLamports: z.number().nullable().optional(),
  rentFeePayer: z.string().nullable().optional(),
  errorCode: z.number().optional(),
  errorMessage: z.string().optional(),
  error: z.string().optional(),
});

/**
 * Jupiter /swap/v2/execute response schema.
 * Field Classification:
 * - Execution status: status, signature, slot, error, code
 * - Execution reconciliation data: totalInputAmount, totalOutputAmount, inputAmountResult, outputAmountResult, swapEvents
 */
export const JupiterExecuteResponseSchema = z.object({
  status: z.enum(["Success", "Failed"]),
  signature: z.string().nullable().optional(),
  slot: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  code: z.number().optional(),
  totalInputAmount: z.string().optional(),
  totalOutputAmount: z.string().optional(),
  inputAmountResult: z.string().optional(),
  outputAmountResult: z.string().optional(),
  swapEvents: z.array(z.any()).optional(),
});

export type JupiterOrderResponse = z.infer<typeof JupiterOrderResponseSchema>;
export type JupiterExecuteResponse = z.infer<typeof JupiterExecuteResponseSchema>;
