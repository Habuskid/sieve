import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { defaultHistoryService } from "@/server/services/history-service";
import { publicKeySchema } from "@/server/security/validation";
import { requireWallet } from "@/server/security/wallet-auth";
import { limitRequest, publicError } from "@/server/security/http";
import { SieveAppError } from "@/server/services/errors";
export const dynamic = "force-dynamic";
const schema = z.object({ wallet: publicKeySchema, limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).max(1000).default(0) }).strict();
export async function GET(request: NextRequest) {
  try {
    limitRequest(request, "history", 40);
    const entries = Array.from(request.nextUrl.searchParams.entries());
    if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new SieveAppError("VALIDATION_ERROR");
    const parsed = schema.safeParse(Object.fromEntries(entries));
    if (!parsed.success) throw new SieveAppError("VALIDATION_ERROR");
    requireWallet(request, parsed.data.wallet);
    return NextResponse.json({ wallet: parsed.data.wallet, network: "mainnet", items: await defaultHistoryService.getUserHistory(parsed.data) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return publicError(error); }
}
