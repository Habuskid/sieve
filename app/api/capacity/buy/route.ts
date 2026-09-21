import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { defaultBuyCapacityService } from "@/server/services/buy-capacity-service";
import { SieveAppError } from "@/server/services/errors";
import { checkRateLimit, getClientIdentifier } from "@/server/middleware/rate-limit";

export const dynamic = "force-dynamic";

const BuyCapacityRequestSchema = z
  .object({
    targetMint: z.string().min(32).max(44),
    fundingAsset: z.enum(["SOL", "USDC"]),
    amount: z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a positive number"),
    maxPremiumPct: z.string().regex(/^-?\d+(\.\d+)?$/, "Max premium must be a valid number"),
    wallet: z.string().min(32).max(44, "Wallet address must be 32-44 characters"),
    clientIntentVersion: z.string().default("v1"),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const clientId = getClientIdentifier(request, body?.wallet);
    const rl = checkRateLimit(clientId, { windowMs: 60_000, max: 60, keyPrefix: "capacity-buy" });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many capacity requests. Please wait a moment.",
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

    const parseResult = BuyCapacityRequestSchema.safeParse(body);
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
    const response = await defaultBuyCapacityService.executeCapacity({
      targetMint: data.targetMint,
      fundingAsset: data.fundingAsset,
      amount: data.amount,
      maxPremiumPct: data.maxPremiumPct,
      wallet: data.wallet,
      clientIntentVersion: data.clientIntentVersion,
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

    const message = err instanceof Error ? err.message : "Failed to execute buy capacity check";
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
