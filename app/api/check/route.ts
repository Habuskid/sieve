import { z } from "zod";
import { defaultPriceCheckService } from "@/server/services/check-service";
import { postHandler } from "@/server/security/http";
import { publicKeySchema, amountSchema, premiumSchema, intentVersionSchema } from "@/server/security/validation";
export const dynamic = "force-dynamic";
const schema = z.object({ targetMint: publicKeySchema, fundingAsset: z.enum(["SOL", "USDC"]), amount: amountSchema, maxPremiumPct: premiumSchema, wallet: publicKeySchema.nullish(), clientIntentVersion: intentVersionSchema }).strict();
export const POST = postHandler(schema, "check", (data) => defaultPriceCheckService.executeCheck(data), 40);