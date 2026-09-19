import { NextRequest, NextResponse } from "next/server";
import { defaultConfirmationService } from "@/server/services/confirmation-service";
import { SieveAppError } from "@/server/services/errors";
import { z } from "zod";

const ConfirmRequestSchema = z.object({
  buildIntentId: z.string().uuid("buildIntentId must be a valid UUID"),
  signature: z.string().min(32).max(128, "Signature must be a valid Solana transaction signature"),
  network: z.enum(["mainnet", "testnet"]).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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
