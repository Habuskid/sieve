import { z } from "zod";
import { defaultTransactionBuildService } from "@/server/services/build-service";
import { postHandler } from "@/server/security/http";
import { publicKeySchema } from "@/server/security/validation";
export const dynamic = "force-dynamic";
const schema = z.object({ checkId: z.string().uuid(), wallet: publicKeySchema }).strict();
export const POST = postHandler(schema, "build", (data) => defaultTransactionBuildService.buildTransaction(data), 20);