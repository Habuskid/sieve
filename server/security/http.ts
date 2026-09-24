import { NextResponse } from "next/server";
import { SieveAppError } from "../services/errors";
import { checkRateLimit, getClientIdentifier } from "../middleware/rate-limit";
import { z } from "zod";
import { requireWallet, requireOrigin } from "./wallet-auth";

export function publicError(error: unknown): NextResponse {
  if (error instanceof z.ZodError) return publicError(new SieveAppError("VALIDATION_ERROR"));
  if (error instanceof SieveAppError) return NextResponse.json({ error: {
    code: error.details.code, message: error.details.userMessage, retryable: error.details.retryable,
  } }, { status: error.details.status });
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("no route") || msg.includes("no routes found") || msg.includes("quote_no_route")) {
      return publicError(new SieveAppError("NO_ROUTE"));
    }
    if (msg.includes("route_risk") || msg.includes("direct route") || msg.includes("multi-hop") || msg.includes("dlmm")) {
      return publicError(new SieveAppError("ROUTE_RISK"));
    }
    if (msg.includes("rate limit") || msg.includes("too many requests")) {
      return publicError(new SieveAppError("RATE_LIMITED"));
    }
  }
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request could not be completed.", retryable: true } }, { status: 500 });
}

export function limitRequest(request: Request, key: string, max = 20): void {
  // Global process budget cannot be reset by spoofing client identity. Deployment
  // must also enforce a shared quota before traffic fans out to serverless workers.
  const global = checkRateLimit("all", { keyPrefix: "global", max: 200, windowMs: 60_000 });
  const client = checkRateLimit(getClientIdentifier(request), { keyPrefix: key, max, windowMs: 60_000 });
  if (!global.allowed || !client.allowed) throw new SieveAppError("RATE_LIMITED");
}

export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new SieveAppError("VALIDATION_ERROR");
  const reader = request.body?.getReader();
  if (!reader) throw new SieveAppError("VALIDATION_ERROR");
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 5000);
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 8192) { await reader.cancel(); throw new SieveAppError("VALIDATION_ERROR"); }
      chunks.push(part.value);
    }
    if (timedOut) throw new SieveAppError("VALIDATION_ERROR");
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { throw new SieveAppError("VALIDATION_ERROR"); }
  finally { clearTimeout(timer); reader.releaseLock(); }
}

export function postHandler<T extends z.ZodTypeAny>(schema: T, key: string, execute: (data: z.output<T>) => Promise<unknown>, max = 20) {
  return async (request: Request) => {
    try {
      limitRequest(request, key, max);
      const parsed = schema.safeParse(await readJson(request));
      if (!parsed.success) throw new SieveAppError("VALIDATION_ERROR");
      const wallet = (parsed.data as { wallet?: string | null }).wallet;
      if (wallet) { requireOrigin(request); requireWallet(request, wallet); }
      return NextResponse.json(await execute(parsed.data), { headers: { "Cache-Control": "no-store" } });
    } catch (error) { return publicError(error); }
  };
}
