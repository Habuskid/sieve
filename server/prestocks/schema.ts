import { z } from "zod";

export const RawPreStockItemSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  description: z.string().optional().default(""),
  image: z.string().nullable().optional(),
  external_url: z.string().nullable().optional(),
  contract_address: z.string().min(32).max(44),
  markPrice: z.number().positive(),
  markValuation: z.number().positive().optional().nullable(),
  tokenPrice: z.number().positive().optional().nullable(),
  impliedValuation: z.number().positive().optional().nullable(),
  supply: z.number().nonnegative().optional().nullable(),
});

export const RawPreStocksResponseSchema = z.array(RawPreStockItemSchema);

export type RawPreStockItem = z.infer<typeof RawPreStockItemSchema>;
