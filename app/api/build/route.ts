import { NextRequest, NextResponse } from "next/server";
import { defaultTransactionBuildService } from "@/server/services/build-service";
import { SieveAppError } from "@/server/services/errors";
import { z } from "zod";

const BuildRequestSchema = z.object({
  checkId: z.string().uuid("checkId must be a valid UUID"),
  wallet: z.string().min(32).max(44, "Wallet address must be 32-44 characters"),
  scenarioId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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
      scenarioId: data.scenarioId,
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
