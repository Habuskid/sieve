import { NextResponse } from "next/server";
import { getRepository } from "@/server/database/db";
import { limitRequest, publicError } from "@/server/security/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    limitRequest(request, "health", 6);
    await getRepository().health();
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return publicError(error); }
}
