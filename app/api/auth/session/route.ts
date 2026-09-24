import { NextResponse } from "next/server";
import { z } from "zod";
import { publicKeySchema } from "@/server/security/validation";
import { authCookie, CHALLENGE, finishChallenge, requireOrigin, sessionWallet } from "@/server/security/wallet-auth";
import { limitRequest, publicError, readJson } from "@/server/security/http";
export async function GET(request: Request) {
  return NextResponse.json({ wallet: sessionWallet(request) }, { headers: { "Cache-Control": "no-store" } });
}
export async function DELETE(request: Request) {
  try {
    requireOrigin(request);
    const response = NextResponse.json({ wallet: null });
    response.headers.append("Set-Cookie", authCookie("sieve_session", "", 0));
    response.headers.append("Set-Cookie", authCookie(CHALLENGE, "", 0));
    return response;
  } catch (error) { return publicError(error); }
}
export async function POST(request: Request) {
  try {
    limitRequest(request, "auth", 10); requireOrigin(request);
    const data = z.object({ wallet: publicKeySchema, signature: z.string().length(88).regex(/^[A-Za-z0-9+/]+={0,2}$/) }).strict().parse(await readJson(request));
    const response = NextResponse.json({ wallet: data.wallet }, { headers: { "Cache-Control": "no-store" } });
    response.headers.append("Set-Cookie", finishChallenge(request, data.wallet, data.signature));
    response.headers.append("Set-Cookie", authCookie(CHALLENGE, "", 0));
    return response;
  } catch (error) { return publicError(error); }
}
