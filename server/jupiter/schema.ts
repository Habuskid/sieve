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
  errorCode: z.number().optional(),
  errorMessage: z.string().optional(),
  error: z.string().optional(),
});

export const JupiterExecuteResponseSchema = z.object({
  status: z.enum(["Success", "Failed"]),
  signature: z.string().nullable().optional(),
  slot: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  code: z.number().optional(),
  totalInputAmount: z.string().optional(),
  totalOutputAmount: z.string().optional(),
});

export type JupiterOrderResponse = z.infer<typeof JupiterOrderResponseSchema>;
export type JupiterExecuteResponse = z.infer<typeof JupiterExecuteResponseSchema>;
