import { NextRequest, NextResponse } from "next/server";
import { defaultPriceCheckService } from "@/server/services/check-service";
import { SieveAppError } from "@/server/services/errors";
import { z } from "zod";

const CheckRequestSchema = z.object({
  network: z.enum(["mainnet", "testnet"]),
  targetMint: z.string().min(32).max(44),
  fundingAsset: z.enum(["SOL", "USDC"]),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a positive number"),
  maxPremiumPct: z.string().regex(/^-?\d+(\.\d+)?$/, "Max premium must be a valid number"),
  wallet: z.string().min(32).max(44).optional().nullable(),
  clientIntentVersion: z.string().default("v1"),
  scenarioId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parseResult = CheckRequestSchema.safeParse(body);

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
    const response = await defaultPriceCheckService.executeCheck({
      network: data.network,
      targetMint: data.targetMint,
      fundingAsset: data.fundingAsset,
      amount: data.amount,
      maxPremiumPct: data.maxPremiumPct,
      wallet: data.wallet,
      clientIntentVersion: data.clientIntentVersion,
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

    const message = err instanceof Error ? err.message : "Failed to execute price check";
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
