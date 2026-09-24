import { NextResponse } from "next/server";
import { z } from "zod";
import { publicKeySchema } from "@/server/security/validation";
import { createChallenge, requireOrigin } from "@/server/security/wallet-auth";
import { limitRequest, publicError, readJson } from "@/server/security/http";
export async function POST(request: Request) {
  try {
    limitRequest(request, "auth", 10); requireOrigin(request);
    const { wallet } = z.object({ wallet: publicKeySchema }).strict().parse(await readJson(request));
    const challenge = createChallenge(wallet);
    return NextResponse.json({ message: challenge.message }, { headers: { "Set-Cookie": challenge.cookie, "Cache-Control": "no-store" } });
  } catch (error) { return publicError(error); }
}
