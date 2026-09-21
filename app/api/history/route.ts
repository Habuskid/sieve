import { NextRequest, NextResponse } from "next/server";
import { defaultHistoryService } from "@/server/services/history-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const wallet = searchParams.get("wallet");
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 50;
    const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : 0;

    if (!wallet) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "wallet query parameter is required",
            retryable: false,
          },
        },
        { status: 400 }
      );
    }

    const items = await defaultHistoryService.getUserHistory({
      wallet,
      limit,
      offset,
    });

    return NextResponse.json({
      wallet,
      network: "mainnet",
      items,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch history";
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
