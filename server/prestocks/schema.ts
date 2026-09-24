import { z } from "zod";
import { publicKeySchema } from "../security/validation";
import { requireCanonicalPreStock } from "./registry";

export const RawPreStockItemSchema = z.object({
  name: z.string().min(1).max(128),
  symbol: z.string().min(1).max(32),
  description: z.string().optional().default(""),
  image: z.string().nullable().optional(),
  external_url: z.string().nullable().optional(),
  contract_address: publicKeySchema,
  markPrice: z.number().finite().positive(),
  markValuation: z.number().finite().positive().optional().nullable(),
  tokenPrice: z.number().finite().positive().optional().nullable(),
  impliedValuation: z.number().finite().positive().optional().nullable(),
  supply: z.number().finite().nonnegative().optional().nullable(),
});

export const RawPreStocksResponseSchema = z.array(RawPreStockItemSchema).max(1000).refine(
  (items) => new Set(items.map((item) => item.contract_address)).size === items.length,
  "Duplicate PreStocks mint"
).refine(items => items.every(item => {
  try { requireCanonicalPreStock(item.contract_address, item.symbol); return true; } catch { return false; }
}), "Unreviewed or substituted PreStocks identity");

export type RawPreStockItem = z.infer<typeof RawPreStockItemSchema>;
