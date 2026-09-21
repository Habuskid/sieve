import { NextRequest, NextResponse } from "next/server";
import { defaultTransactionBuildService } from "@/server/services/build-service";
import { SieveAppError } from "@/server/services/errors";
import { checkRateLimit, getClientIdentifier } from "@/server/middleware/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const BuildRequestSchema = z.object({
  checkId: z.string().uuid("checkId must be a valid UUID"),
  wallet: z.string().min(32).max(44, "Wallet address must be 32-44 characters"),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const clientId = getClientIdentifier(request, body.wallet);
    const rl = checkRateLimit(clientId, { windowMs: 60_000, max: 20, keyPrefix: "build" });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many build requests. Please wait a moment.",
            retryable: true,
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil(rl.resetMs / 1000).toString(),
          },
        }
      );
    }

    const parseResult = BuildRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parseResult.error.errors[0]?.message || "Invalid request body",
            retryable: false,
          },
        },
        { status: 400 }
      );
    }

    const data = parseResult.data;
    const response = await defaultTransactionBuildService.buildTransaction({
      checkId: data.checkId,
      wallet: data.wallet,
    });

    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof SieveAppError) {
      return NextResponse.json(
        {
          error: {
            code: err.details.code,
            message: err.message,
            retryable: err.details.retryable,
          },
        },
        { status: err.details.status }
      );
    }

    const message = err instanceof Error ? err.message : "Failed to build transaction";
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message,
          retryable: true,
        },
      },
      { status: 500 }
    );
  }
}
