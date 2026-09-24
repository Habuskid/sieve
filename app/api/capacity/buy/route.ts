import { z } from "zod";
import { defaultBuyCapacityService } from "@/server/services/buy-capacity-service";
import { postHandler } from "@/server/security/http";
import { publicKeySchema, amountSchema, premiumSchema, intentVersionSchema } from "@/server/security/validation";
export const dynamic = "force-dynamic";
const schema = z.object({ targetMint: publicKeySchema, fundingAsset: z.enum(["SOL", "USDC"]), amount: amountSchema, maxPremiumPct: premiumSchema, wallet: publicKeySchema, clientIntentVersion: intentVersionSchema }).strict();
export const POST = postHandler(schema, "capacity/buy", (data) => defaultBuyCapacityService.executeCapacity(data), 6);