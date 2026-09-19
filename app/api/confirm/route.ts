import { NextRequest, NextResponse } from "next/server";
import { defaultConfirmationService } from "@/server/services/confirmation-service";
import { SieveAppError } from "@/server/services/errors";
import { checkRateLimit, getClientIdentifier } from "@/server/middleware/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ConfirmRequestSchema = z
  .object({
    buildIntentId: z.string().uuid("buildIntentId must be a valid UUID"),
    signature: z.string().min(32).max(128, "Signature must be a valid Solana transaction signature").optional(),
    signedTransaction: z.string().min(10, "signedTransaction must be a valid base64 string").optional(),
    wallet: z.string().min(32).max(44).optional(),
    network: z.enum(["mainnet", "testnet"]).optional(),
  })
  .refine((data) => data.signature || data.signedTransaction, {
    message: "Either signature or signedTransaction must be provided",
  });

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const clientId = getClientIdentifier(request, body.wallet);
    const rl = checkRateLimit(clientId, { windowMs: 60_000, max: 20, keyPrefix: "confirm" });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many confirmation requests. Please wait a moment.",
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

    const parseResult = ConfirmRequestSchema.safeParse(body);

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
    const response = await defaultConfirmationService.confirmTransaction({
      buildIntentId: data.buildIntentId,
      signature: data.signature,
      signedTransaction: data.signedTransaction,
      wallet: data.wallet,
      network: data.network,
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

    const message = err instanceof Error ? err.message : "Failed to confirm transaction";
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
