import { z } from "zod";
import { defaultSellBuildService } from "@/server/services/sell-build-service";
import { postHandler } from "@/server/security/http";
import { publicKeySchema } from "@/server/security/validation";
export const dynamic = "force-dynamic";
const schema = z.object({ checkId: z.string().uuid(), wallet: publicKeySchema }).strict();
export const POST = postHandler(schema, "sell/build", (data) => defaultSellBuildService.buildTransaction(data), 20);