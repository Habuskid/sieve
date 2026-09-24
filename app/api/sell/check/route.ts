import { z } from "zod";
import { defaultSellCheckService } from "@/server/services/sell-check-service";
import { postHandler } from "@/server/security/http";
import { publicKeySchema, amountSchema, discountSchema, intentVersionSchema } from "@/server/security/validation";
export const dynamic = "force-dynamic";
const schema = z.object({ targetMint: publicKeySchema, amount: amountSchema, maxDiscountPct: discountSchema, wallet: publicKeySchema.nullish(), clientIntentVersion: intentVersionSchema }).strict();
export const POST = postHandler(schema, "sell/check", (data) => defaultSellCheckService.executeCheck(data), 40);