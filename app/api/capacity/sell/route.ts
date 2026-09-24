import { z } from "zod";
import { defaultSellCapacityService } from "@/server/services/sell-capacity-service";
import { postHandler } from "@/server/security/http";
import { publicKeySchema, amountSchema, discountSchema, intentVersionSchema } from "@/server/security/validation";
export const dynamic = "force-dynamic";
const schema = z.object({ targetMint: publicKeySchema, amount: amountSchema, maxDiscountPct: discountSchema, wallet: publicKeySchema, clientIntentVersion: intentVersionSchema }).strict();
export const POST = postHandler(schema, "capacity/sell", (data) => defaultSellCapacityService.executeCapacity(data), 6);