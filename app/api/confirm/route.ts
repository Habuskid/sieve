import { z } from "zod";
import { defaultConfirmationService } from "@/server/services/confirmation-service";
import { postHandler } from "@/server/security/http";
import { publicKeySchema, transactionSchema } from "@/server/security/validation";
export const dynamic = "force-dynamic";
const schema = z.object({ buildIntentId: z.string().uuid(), wallet: publicKeySchema, signedTransaction: transactionSchema, signature: z.string().min(64).max(88).optional() }).strict();
export const POST = postHandler(schema, "confirm", (data) => defaultConfirmationService.confirmTransaction(data), 20);