import { z } from "zod";
import { publicKeySchema, rawAmountSchema, positiveRawSchema, transactionSchema } from "../security/validation";
const bps = z.number().int().min(0).max(10000);
const lamports = z.number().int().nonnegative().safe();
export const JupiterSwapInfoSchema = z.object({
  ammKey: publicKeySchema, label: z.string().max(128), inputMint: publicKeySchema,
  outputMint: publicKeySchema, inAmount: rawAmountSchema, outAmount: rawAmountSchema,
});
export const JupiterRoutePlanStepSchema = z.object({
  swapInfo: JupiterSwapInfoSchema, percent: z.number().finite().min(0).max(100),
  bps, usdValue: z.number().finite().nonnegative().optional(),
});
export const JupiterPlatformFeeSchema = z.object({ amount: rawAmountSchema.optional(), feeBps: bps.optional(), feeMint: publicKeySchema.optional() });
export const JupiterOrderResponseSchema = z.object({
  inputMint: publicKeySchema, outputMint: publicKeySchema,
  taker: publicKeySchema.nullish(), inAmount: positiveRawSchema, outAmount: positiveRawSchema,
  inUsdValue: z.number().finite().positive().nullish(), outUsdValue: z.number().finite().positive().nullish(),
  priceImpact: z.number().finite().nullish(), priceImpactPct: z.string().max(40).regex(/^-?\d+(\.\d+)?$/).nullish(),
  otherAmountThreshold: rawAmountSchema.nullish(), swapMode: z.literal("ExactIn"), slippageBps: bps.optional(),
  routePlan: z.array(JupiterRoutePlanStepSchema).max(128).optional().default([]),
  transaction: transactionSchema.nullish(), lastValidBlockHeight: positiveRawSchema.nullish(),
  requestId: z.string().min(1).max(256), router: z.string().max(64).optional(),
  feeMint: publicKeySchema.nullish(), feeBps: bps.nullish(), platformFee: JupiterPlatformFeeSchema.nullish(),
  signatureFeeLamports: lamports.nullish(), signatureFeePayer: publicKeySchema.nullish(),
  prioritizationFeeLamports: lamports.nullish(), prioritizationFeePayer: publicKeySchema.nullish(),
  rentFeeLamports: lamports.nullish(), rentFeePayer: publicKeySchema.nullish(), gasless: z.boolean().nullish(),
  errorCode: z.number().int().optional(), errorMessage: z.string().max(1024).optional(), error: z.string().max(1024).optional(),
});
export const JupiterExecuteResponseSchema = z.object({
  status: z.enum(["Success", "Failed", "Submitted"]), signature: z.string().min(64).max(88).nullish(),
  slot: positiveRawSchema.nullish(), error: z.string().max(1024).nullish(), code: z.number().int().optional(),
  totalInputAmount: rawAmountSchema.optional(), totalOutputAmount: rawAmountSchema.optional(),
  inputAmountResult: rawAmountSchema.optional(), outputAmountResult: rawAmountSchema.optional(),
  swapEvents: z.array(z.unknown()).max(128).optional(),
});
export type JupiterOrderResponse = z.infer<typeof JupiterOrderResponseSchema>;
export type JupiterExecuteResponse = z.infer<typeof JupiterExecuteResponseSchema>;

export const JupiterInstructionSchema = z.object({
  programId: publicKeySchema,
  accounts: z.array(z.object({ pubkey: publicKeySchema, isSigner: z.boolean(), isWritable: z.boolean() }).strict()).max(64),
  data: z.string().max(4096).regex(/^[A-Za-z0-9+/]*={0,2}$/),
}).strict();
export const JupiterBuildResponseSchema = JupiterOrderResponseSchema.omit({ requestId: true }).extend({
  computeBudgetInstructions: z.array(JupiterInstructionSchema).max(2),
  setupInstructions: z.array(JupiterInstructionSchema).max(4),
  swapInstruction: JupiterInstructionSchema,
  cleanupInstruction: JupiterInstructionSchema.nullish(),
  otherInstructions: z.array(JupiterInstructionSchema).max(4),
  tipInstruction: JupiterInstructionSchema.nullish(),
  addressesByLookupTableAddress: z.record(publicKeySchema, z.array(publicKeySchema).max(256)).nullish(),
});
