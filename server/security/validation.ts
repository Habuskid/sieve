import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { SieveAppError } from "../services/errors";

export const publicKeySchema = z.string().min(32).max(44).refine((value) => {
  try { return new PublicKey(value).toBase58() === value; } catch { return false; }
}, "Invalid canonical Solana public key");
export const amountSchema = z.string().max(40).regex(/^(0|[1-9]\d{0,18})(\.\d{1,18})?$/)
  .refine((v) => /[1-9]/.test(v), "Amount must be positive");
// Persistence stores integer BPS. Reject precision that cannot round-trip exactly.
export const premiumSchema = z.string().max(8).regex(/^(0|[1-9]\d{0,3})(\.\d{1,2})?$/);
export const discountSchema = premiumSchema.refine((v) => Number(v) < 100, "Discount must be below 100%");
export const rawAmountSchema = z.string().max(20).regex(/^(0|[1-9]\d*)$/)
  .refine((v) => v.length <= 20 && /^\d+$/.test(v) && BigInt(v) <= 18446744073709551615n, "Raw amount exceeds u64");
export const positiveRawSchema = rawAmountSchema.refine((v) => v.length <= 20 && /^\d+$/.test(v) && BigInt(v) > 0n, "Raw amount must be positive");
export const intentVersionSchema = z.string().min(1).max(64).default("v1");
export const transactionSchema = z.string().min(4).max(1644).regex(/^[A-Za-z0-9+/]+={0,2}$/);

export function validateCheckInput(input: { targetMint: string; amount: string; wallet?: string | null; maxPremiumPct?: string; maxDiscountPct?: string; clientIntentVersion: string }) {
  const schema = z.object({ targetMint: publicKeySchema, amount: amountSchema,
    wallet: publicKeySchema.nullish(), maxPremiumPct: premiumSchema.optional(),
    maxDiscountPct: discountSchema.optional(), clientIntentVersion: intentVersionSchema });
  if (!schema.safeParse(input).success) throw new SieveAppError("VALIDATION_ERROR");
}
