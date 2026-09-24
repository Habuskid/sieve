import { authenticatedHeaders, testWallet } from "../helpers/security-fixtures";
import { clearRateLimitBuckets } from "../../server/middleware/rate-limit";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as postBuyCapacity } from "../../app/api/capacity/buy/route";
import { POST as postSellCapacity } from "../../app/api/capacity/sell/route";
import { defaultBuyCapacityService } from "../../server/services/buy-capacity-service";
import { defaultSellCapacityService } from "../../server/services/sell-capacity-service";
import { SieveAppError } from "../../server/services/errors";

const wallet = testWallet;
const mint = "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF";
const checkId = "11111111-1111-4111-8111-111111111111";

function makeBuyRequest(body: Record<string, unknown>, includeWallet = true) {
  const fullBody = includeWallet ? { wallet, ...body } : body;
  return new NextRequest("http://localhost:3000/api/capacity/buy", {
    method: "POST",
    headers: authenticatedHeaders(),
    body: JSON.stringify(fullBody),
  });
}

function makeSellRequest(body: Record<string, unknown>, includeWallet = true) {
  const fullBody = includeWallet ? { wallet, ...body } : body;
  return new NextRequest("http://localhost:3000/api/capacity/sell", {
    method: "POST",
    headers: authenticatedHeaders(),
    body: JSON.stringify(fullBody),
  });
}

const mockBuySuccessResponse = {
  side: "BUY" as const,
  asset: { name: "OpenAI PreStocks", symbol: "OPENAI", mint },
  fundingAsset: "USDC" as const,
  requestedAmount: "100",
  requestedAmountRaw: "100000000",
  referencePriceUsd: "100",
  maxPremiumPct: "5",
  maximumBuyPriceUsd: "105",
  requestedCandidate: {
    fundingAmount: "100",
    fundingAmountRaw: "100000000",
    effectiveBuyPriceUsd: "103",
    expectedTargetAmount: "0.97",
    withinBoundary: true,
    status: "GOOD_TO_GO",
  },
  verifiedCapacity: {
    fundingAmount: "100",
    fundingAmountRaw: "100000000",
    effectiveBuyPriceUsd: "103",
    expectedTargetAmount: "0.97",
    withinBoundary: true,
    status: "GOOD_TO_GO",
  },
  checkId,
  status: "FULLY_WITHIN_BOUNDARY" as const,
  probeCount: 1,
  observedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  display: {
    title: "Requested amount is executable within boundary",
    message: "Full order of 100 USDC is verified within your configured boundary.",
  },
};

const mockSellSuccessResponse = {
  side: "SELL" as const,
  asset: { name: "OpenAI PreStocks", symbol: "OPENAI", mint },
  outputAsset: "USDC" as const,
  requestedAmount: "1",
  requestedAmountRaw: "1000000000",
  referencePriceUsd: "100",
  maxDiscountPct: "5",
  minimumSellPriceUsd: "95",
  requestedCandidate: {
    economicAmount: "1",
    rawWalletInput: "1000000000",
    effectiveSellPriceUsd: "97",
    expectedUsdcProceeds: "97",
    withinBoundary: true,
    status: "GOOD_TO_GO",
  },
  verifiedCapacity: {
    economicAmount: "1",
    rawWalletInput: "1000000000",
    effectiveSellPriceUsd: "97",
    expectedUsdcProceeds: "97",
    withinBoundary: true,
    status: "GOOD_TO_GO",
  },
  checkId,
  status: "FULLY_WITHIN_BOUNDARY" as const,
  probeCount: 1,
  observedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  display: {
    title: "Requested amount is executable within boundary",
    message: "Full order of 1 OPENAI is verified within your configured boundary.",
  },
};

describe("Strict Boundary Capacity APIs (Task 7)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearRateLimitBuckets();
  });

  // ==========================================
  // BUY API CASES (1 - 18)
  // ==========================================

  // 1. valid Buy capacity request accepted
  it("1. valid Buy capacity request accepted", async () => {
    vi.spyOn(defaultBuyCapacityService, "executeCapacity").mockResolvedValueOnce(mockBuySuccessResponse as any);

    const res = await postBuyCapacity(
      makeBuyRequest({
        targetMint: mint,
        fundingAsset: "USDC",
        amount: "100",
        maxPremiumPct: "5",
        wallet,
        clientIntentVersion: "v1",
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.side).toBe("BUY");
    expect(body.status).toBe("FULLY_WITHIN_BOUNDARY");
  });

  // 2. response is JSON serializable
  it("2. response is JSON serializable", async () => {
    vi.spyOn(defaultBuyCapacityService, "executeCapacity").mockResolvedValueOnce(mockBuySuccessResponse as any);

    const res = await postBuyCapacity(
      makeBuyRequest({
        targetMint: mint,
        fundingAsset: "USDC",
        amount: "100",
        maxPremiumPct: "5",
      })
    );

    const body = await res.json();
    expect(() => JSON.stringify(body)).not.toThrow();
  });

  // 3. bigint raw amount becomes exact decimal string
  it("3. bigint raw amount becomes exact decimal string", async () => {
    vi.spyOn(defaultBuyCapacityService, "executeCapacity").mockResolvedValueOnce(mockBuySuccessResponse as any);

    const res = await postBuyCapacity(
      makeBuyRequest({
        targetMint: mint,
        fundingAsset: "USDC",
        amount: "100",
        maxPremiumPct: "5",
      })
    );

    const body = await res.json();
    expect(typeof body.requestedAmountRaw).toBe("string");
    expect(body.requestedAmountRaw).toBe("100000000");
  });

  // 4. FULLY_WITHIN_BOUNDARY response returns checkId
  it("4. FULLY_WITHIN_BOUNDARY response returns checkId", async () => {
    vi.spyOn(defaultBuyCapacityService, "executeCapacity").mockResolvedValueOnce(mockBuySuccessResponse as any);

    const res = await postBuyCapacity(
      makeBuyRequest({
        targetMint: mint,
        fundingAsset: "USDC",
        amount: "100",
        maxPremiumPct: "5",
      })
    );

    const body = await res.json();
    expect(body.status).toBe("FULLY_WITHIN_BOUNDARY");
    expect(body.checkId).toBe(checkId);
  });

  // 5. PARTIALLY_WITHIN_BOUNDARY returns final capacity and checkId
  it("5. PARTIALLY_WITHIN_BOUNDARY returns final capacity and checkId", async () => {
    const partialResponse = {
      ...mockBuySuccessResponse,
      status: "PARTIALLY_WITHIN_BOUNDARY" as const,
      verifiedCapacity: {
        fundingAmount: "50",
        fundingAmountRaw: "50000000",
        effectiveBuyPriceUsd: "104",
        expectedTargetAmount: "0.48",
        withinBoundary: true,
        status: "GOOD_TO_GO",
      },
      checkId: "partial-check-id",
    };
    vi.spyOn(defaultBuyCapacityService, "executeCapacity").mockResolvedValueOnce(partialResponse as any);

    const res = await postBuyCapacity(
      makeBuyRequest({
        targetMint: mint,
        fundingAsset: "USDC",
        amount: "100",
        maxPremiumPct: "5",
      })
    );

    const body = await res.json();
    expect(body.status).toBe("PARTIALLY_WITHIN_BOUNDARY");
    expect(body.verifiedCapacity?.fundingAmount).toBe("50");
    expect(body.checkId).toBe("partial-check-id");
  });

  // 6. NO_VERIFIED_CAPACITY returns null capacity/checkId as defined
  it("6. NO_VERIFIED_CAPACITY returns null capacity/checkId as defined", async () => {
    const noCapacityResponse = {
      ...mockBuySuccessResponse,
      status: "NO_VERIFIED_CAPACITY" as const,
      verifiedCapacity: null,
      checkId: null,
    };
    vi.spyOn(defaultBuyCapacityService, "executeCapacity").mockResolvedValueOnce(noCapacityResponse as any);

    const res = await postBuyCapacity(
      makeBuyRequest({
        targetMint: mint,
        fundingAsset: "USDC",
        amount: "100",
        maxPremiumPct: "5",
      })
    );

    expect(res.status).toBe(200); // Business outcome is successful HTTP 200
    const body = await res.json();
    expect(body.status).toBe("NO_VERIFIED_CAPACITY");
    expect(body.verifiedCapacity).toBeNull();
    expect(body.checkId).toBeNull();
  });

  // 7. unknown field rejected
  it("7. unknown field rejected", async () => {
    const res = await postBuyCapacity(
      makeBuyRequest({
        targetMint: mint,
        fundingAsset: "USDC",
        amount: "100",
        maxPremiumPct: "5",
        someUnknownField: "malicious",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // 8. network rejected
  it("8. network rejected", async () => {
    const res = await postBuyCapacity(
      makeBuyRequest({
        targetMint: mint,
        fundingAsset: "USDC",
        amount: "100",
        maxPremiumPct: "5",
        network: "mainnet",
      })
    );
    expect(res.status).toBe(400);
  });

  // 9. scenarioId rejected
  it("9. scenarioId rejected", async () => {
    const res = await postBuyCapacity(
      makeBuyRequest({
        targetMint: mint,
        fundingAsset: "USDC",
        amount: "100",
        maxPremiumPct: "5",
        scenarioId: "PASS",
      })
    );
    expect(res.status).toBe(400);
  });

  // 10. simulated rejected
  it("10. simulated rejected", async () => {
    const res = await postBuyCapacity(
      makeBuyRequest({
        targetMint: mint,
        fundingAsset: "USDC",
        amount: "100",
        maxPremiumPct: "5",
        simulated: true,
      })
    );
    expect(res.status).toBe(400);
  });

  // 11. maxProbes rejected
  it("11. maxProbes rejected", async () => {
    const res = await postBuyCapacity(
      makeBuyRequest({
        targetMint: mint,
        fundingAsset: "USDC",
        amount: "100",
        maxPremiumPct: "5",
        maxProbes: 100,
      })
    );
    expect(res.status).toBe(400);
  });

  // 12. browser-supplied reference price rejected
  it("12. browser-supplied reference price rejected", async () => {
    const res = await postBuyCapacity(
      makeBuyRequest({
        targetMint: mint,
        fundingAsset: "USDC",
        amount: "100",
        maxPremiumPct: "5",
        referencePrice: "100",
      })
    );
    expect(res.status).toBe(400);
  });

  // 13. browser-supplied effective price rejected
  it("13. browser-supplied effective price rejected", async () => {
    const res = await postBuyCapacity(
      makeBuyRequest({
        targetMint: mint,
        fundingAsset: "USDC",
        amount: "100",
        maxPremiumPct: "5",
        effectiveExecutionPrice: "90",
      })
    );
    expect(res.status).toBe(400);
  });

  // 14. browser-supplied capacity amount rejected
  it("14. browser-supplied capacity amount rejected", async () => {
    const res = await postBuyCapacity(
      makeBuyRequest({
        targetMint: mint,
        fundingAsset: "USDC",
        amount: "100",
        maxPremiumPct: "5",
        capacityAmount: "100",
      })
    );
    expect(res.status).toBe(400);
  });

  // 15. invalid funding asset rejected using existing semantics
  it("15. invalid funding asset rejected using existing semantics", async () => {
    const res = await postBuyCapacity(
      makeBuyRequest({
        targetMint: mint,
        fundingAsset: "ETH",
        amount: "100",
        maxPremiumPct: "5",
      })
    );
    expect(res.status).toBe(400);
  });

  // 16. invalid amount rejected
  it("16. invalid amount rejected", async () => {
    const res = await postBuyCapacity(
      makeBuyRequest({
        targetMint: mint,
        fundingAsset: "USDC",
        amount: "-100",
        maxPremiumPct: "5",
      })
    );
    expect(res.status).toBe(400);
  });

  // 17. invalid max premium rejected
  it("17. invalid max premium rejected", async () => {
    const res = await postBuyCapacity(
      makeBuyRequest({
        targetMint: mint,
        fundingAsset: "USDC",
        amount: "100",
        maxPremiumPct: "invalid-num",
      })
    );
    expect(res.status).toBe(400);
  });

  // 18. service/provider error remains error and is not converted to NO_VERIFIED_CAPACITY
  it("18. service/provider error remains error and is not converted to NO_VERIFIED_CAPACITY", async () => {
    vi.spyOn(defaultBuyCapacityService, "executeCapacity").mockRejectedValueOnce(
      new SieveAppError("PRICE_REFERENCE_INVALID", "Asset not recognized")
    );

    const res = await postBuyCapacity(
      makeBuyRequest({
        targetMint: mint,
        fundingAsset: "USDC",
        amount: "100",
        maxPremiumPct: "5",
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("PRICE_REFERENCE_INVALID");
    expect(body.status).toBeUndefined(); // Did not return a fake success body
  });

  // ==========================================
  // SELL API CASES (19 - 36)
  // ==========================================

  // 19. valid Sell capacity request accepted
  it("19. valid Sell capacity request accepted", async () => {
    vi.spyOn(defaultSellCapacityService, "executeCapacity").mockResolvedValueOnce(mockSellSuccessResponse as any);

    const res = await postSellCapacity(
      makeSellRequest({
        targetMint: mint,
        amount: "1",
        maxDiscountPct: "5",
        wallet,
        clientIntentVersion: "v1",
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.side).toBe("SELL");
    expect(body.status).toBe("FULLY_WITHIN_BOUNDARY");
  });

  // 20. response is JSON serializable
  it("20. response is JSON serializable", async () => {
    vi.spyOn(defaultSellCapacityService, "executeCapacity").mockResolvedValueOnce(mockSellSuccessResponse as any);

    const res = await postSellCapacity(
      makeSellRequest({
        targetMint: mint,
        amount: "1",
        maxDiscountPct: "5",
      })
    );

    const body = await res.json();
    expect(() => JSON.stringify(body)).not.toThrow();
  });

  // 21. raw bigint values are exact strings if exposed
  it("21. raw bigint values are exact strings if exposed", async () => {
    vi.spyOn(defaultSellCapacityService, "executeCapacity").mockResolvedValueOnce(mockSellSuccessResponse as any);

    const res = await postSellCapacity(
      makeSellRequest({
        targetMint: mint,
        amount: "1",
        maxDiscountPct: "5",
      })
    );

    const body = await res.json();
    expect(typeof body.requestedAmountRaw).toBe("string");
    expect(body.requestedAmountRaw).toBe("1000000000");
    expect(typeof body.verifiedCapacity?.rawWalletInput).toBe("string");
  });

  // 22. FULLY_WITHIN_BOUNDARY returns server checkId
  it("22. FULLY_WITHIN_BOUNDARY returns server checkId", async () => {
    vi.spyOn(defaultSellCapacityService, "executeCapacity").mockResolvedValueOnce(mockSellSuccessResponse as any);

    const res = await postSellCapacity(
      makeSellRequest({
        targetMint: mint,
        amount: "1",
        maxDiscountPct: "5",
      })
    );

    const body = await res.json();
    expect(body.status).toBe("FULLY_WITHIN_BOUNDARY");
    expect(body.checkId).toBe(checkId);
  });

  // 23. PARTIALLY_WITHIN_BOUNDARY returns economic capacity + checkId
  it("23. PARTIALLY_WITHIN_BOUNDARY returns economic capacity + checkId", async () => {
    const partialSell = {
      ...mockSellSuccessResponse,
      status: "PARTIALLY_WITHIN_BOUNDARY" as const,
      verifiedCapacity: {
        economicAmount: "0.5",
        rawWalletInput: "500000000",
        effectiveSellPriceUsd: "96",
        expectedUsdcProceeds: "48",
        withinBoundary: true,
        status: "GOOD_TO_GO",
      },
      checkId: "partial-sell-check",
    };
    vi.spyOn(defaultSellCapacityService, "executeCapacity").mockResolvedValueOnce(partialSell as any);

    const res = await postSellCapacity(
      makeSellRequest({
        targetMint: mint,
        amount: "1",
        maxDiscountPct: "5",
      })
    );

    const body = await res.json();
    expect(body.status).toBe("PARTIALLY_WITHIN_BOUNDARY");
    expect(body.verifiedCapacity?.economicAmount).toBe("0.5");
    expect(body.checkId).toBe("partial-sell-check");
  });

  // 24. NO_VERIFIED_CAPACITY returns null capacity/checkId as defined
  it("24. NO_VERIFIED_CAPACITY returns null capacity/checkId as defined", async () => {
    const noCapacitySell = {
      ...mockSellSuccessResponse,
      status: "NO_VERIFIED_CAPACITY" as const,
      verifiedCapacity: null,
      checkId: null,
    };
    vi.spyOn(defaultSellCapacityService, "executeCapacity").mockResolvedValueOnce(noCapacitySell as any);

    const res = await postSellCapacity(
      makeSellRequest({
        targetMint: mint,
        amount: "1",
        maxDiscountPct: "5",
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("NO_VERIFIED_CAPACITY");
    expect(body.verifiedCapacity).toBeNull();
    expect(body.checkId).toBeNull();
  });

  // 25. network rejected
  it("25. network rejected", async () => {
    const res = await postSellCapacity(
      makeSellRequest({
        targetMint: mint,
        amount: "1",
        maxDiscountPct: "5",
        network: "mainnet",
      })
    );
    expect(res.status).toBe(400);
  });

  // 26. scenarioId rejected
  it("26. scenarioId rejected", async () => {
    const res = await postSellCapacity(
      makeSellRequest({
        targetMint: mint,
        amount: "1",
        maxDiscountPct: "5",
        scenarioId: "SELL_PASS",
      })
    );
    expect(res.status).toBe(400);
  });

  // 27. maxProbes rejected
  it("27. maxProbes rejected", async () => {
    const res = await postSellCapacity(
      makeSellRequest({
        targetMint: mint,
        amount: "1",
        maxDiscountPct: "5",
        maxProbes: 10,
      })
    );
    expect(res.status).toBe(400);
  });

  // 28. rawWalletInput supplied by browser rejected
  it("28. rawWalletInput supplied by browser rejected", async () => {
    const res = await postSellCapacity(
      makeSellRequest({
        targetMint: mint,
        amount: "1",
        maxDiscountPct: "5",
        rawWalletInput: "1000000000",
      })
    );
    expect(res.status).toBe(400);
  });

  // 29. rawTransferFee supplied by browser rejected
  it("29. rawTransferFee supplied by browser rejected", async () => {
    const res = await postSellCapacity(
      makeSellRequest({
        targetMint: mint,
        amount: "1",
        maxDiscountPct: "5",
        rawTransferFee: "0",
      })
    );
    expect(res.status).toBe(400);
  });

  // 30. rawRouteInput supplied by browser rejected
  it("30. rawRouteInput supplied by browser rejected", async () => {
    const res = await postSellCapacity(
      makeSellRequest({
        targetMint: mint,
        amount: "1",
        maxDiscountPct: "5",
        rawRouteInput: "1000000000",
      })
    );
    expect(res.status).toBe(400);
  });

  // 31. actualEconomicAmount supplied by browser rejected
  it("31. actualEconomicAmount supplied by browser rejected", async () => {
    const res = await postSellCapacity(
      makeSellRequest({
        targetMint: mint,
        amount: "1",
        maxDiscountPct: "5",
        actualEconomicAmount: "1",
      })
    );
    expect(res.status).toBe(400);
  });

  // 32. browser reference price rejected
  it("32. browser reference price rejected", async () => {
    const res = await postSellCapacity(
      makeSellRequest({
        targetMint: mint,
        amount: "1",
        maxDiscountPct: "5",
        referencePriceUsd: "100",
      })
    );
    expect(res.status).toBe(400);
  });

  // 33. browser minimum Sell price rejected
  it("33. browser minimum Sell price rejected", async () => {
    const res = await postSellCapacity(
      makeSellRequest({
        targetMint: mint,
        amount: "1",
        maxDiscountPct: "5",
        minimumSellPriceUsd: "95",
      })
    );
    expect(res.status).toBe(400);
  });

  // 34. invalid economic Sell amount rejected
  it("34. invalid economic Sell amount rejected", async () => {
    const res = await postSellCapacity(
      makeSellRequest({
        targetMint: mint,
        amount: "invalid-amount",
        maxDiscountPct: "5",
      })
    );
    expect(res.status).toBe(400);
  });

  // 35. invalid max discount rejected
  it("35. invalid max discount rejected", async () => {
    const res = await postSellCapacity(
      makeSellRequest({
        targetMint: mint,
        amount: "1",
        maxDiscountPct: "-5",
      })
    );
    expect(res.status).toBe(400);
  });

  // 36. provider/service error is not converted to NO_VERIFIED_CAPACITY
  it("36. provider/service error is not converted to NO_VERIFIED_CAPACITY", async () => {
    vi.spyOn(defaultSellCapacityService, "executeCapacity").mockRejectedValueOnce(
      new SieveAppError("ROUTE_RISK", "Scaled UI multiplier transition prevents safe Sell build")
    );

    const res = await postSellCapacity(
      makeSellRequest({
        targetMint: mint,
        amount: "1",
        maxDiscountPct: "5",
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("ROUTE_RISK");
    expect(body.status).toBeUndefined();
  });

  // ==========================================
  // SHARED & SPECIAL CHECKS (37 - 43)
  // ==========================================

  // 37. response contains no opaque metadata
  it("37. response contains no opaque metadata", async () => {
    vi.spyOn(defaultBuyCapacityService, "executeCapacity").mockResolvedValueOnce(mockBuySuccessResponse as any);
    const res = await postBuyCapacity(
      makeBuyRequest({ targetMint: mint, fundingAsset: "USDC", amount: "100", maxPremiumPct: "5" })
    );
    const body = await res.json();
    expect(body.metadata).toBeUndefined();
    expect(body.internal).toBeUndefined();
  });

  // 38. response contains no full Jupiter response
  it("38. response contains no full Jupiter response", async () => {
    vi.spyOn(defaultBuyCapacityService, "executeCapacity").mockResolvedValueOnce(mockBuySuccessResponse as any);
    const res = await postBuyCapacity(
      makeBuyRequest({ targetMint: mint, fundingAsset: "USDC", amount: "100", maxPremiumPct: "5" })
    );
    const body = await res.json();
    expect(body.jupiterResponse).toBeUndefined();
    expect(body.rawResponse).toBeUndefined();
    expect(body.routeFingerprint).toBeUndefined();
  });

  // 39. response contains no RPC object
  it("39. response contains no RPC object", async () => {
    vi.spyOn(defaultSellCapacityService, "executeCapacity").mockResolvedValueOnce(mockSellSuccessResponse as any);
    const res = await postSellCapacity(
      makeSellRequest({ targetMint: mint, amount: "1", maxDiscountPct: "5" })
    );
    const body = await res.json();
    expect(body.rpcResponse).toBeUndefined();
    expect(body.connection).toBeUndefined();
  });

  // 40. public requests have no network selector
  it("40. public requests have no network selector", async () => {
    const buyRes = await postBuyCapacity(
      makeBuyRequest({ targetMint: mint, fundingAsset: "USDC", amount: "100", maxPremiumPct: "5", network: "devnet" })
    );
    expect(buyRes.status).toBe(400);

    const sellRes = await postSellCapacity(
      makeSellRequest({ targetMint: mint, amount: "1", maxDiscountPct: "5", network: "devnet" })
    );
    expect(sellRes.status).toBe(400);
  });

  // 41. endpoints do not persist an extra check beyond service behavior
  it("41. endpoints do not persist an extra check beyond service behavior", async () => {
    const spy = vi.spyOn(defaultBuyCapacityService, "executeCapacity").mockResolvedValueOnce(mockBuySuccessResponse as any);
    await postBuyCapacity(
      makeBuyRequest({ targetMint: mint, fundingAsset: "USDC", amount: "100", maxPremiumPct: "5" })
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // 42. routes do not permit search-budget control
  it("42. routes do not permit search-budget control", async () => {
    const res = await postBuyCapacity(
      makeBuyRequest({ targetMint: mint, fundingAsset: "USDC", amount: "100", maxPremiumPct: "5", maxProbes: 5 })
    );
    expect(res.status).toBe(400);
  });

  // 43. Step 7.17: BigInt serialization test with amount > Number.MAX_SAFE_INTEGER
  it("43. BigInt values greater than Number.MAX_SAFE_INTEGER survive with exact digits as decimal strings", async () => {
    const hugeBigintString = "900719925474099312345";
    const hugeBigint = BigInt(hugeBigintString);

    // Verify that Number(hugeBigint) would lose precision
    expect(Number(hugeBigint).toString()).not.toBe(hugeBigintString);

    // Verify that converting directly via .toString() preserves all digits
    const exactString = hugeBigint.toString();
    expect(exactString).toBe(hugeBigintString);

    const responseWithHuge = {
      ...mockBuySuccessResponse,
      requestedAmountRaw: exactString,
    };
    vi.spyOn(defaultBuyCapacityService, "executeCapacity").mockResolvedValueOnce(responseWithHuge as any);

    const res = await postBuyCapacity(
      makeBuyRequest({ targetMint: mint, fundingAsset: "USDC", amount: "100", maxPremiumPct: "5" })
    );
    const body = await res.json();
    expect(body.requestedAmountRaw).toBe(hugeBigintString);
  });

  // 44. wallet is required in Buy capacity request (Step 8.2)
  it("44. wallet is required in Buy capacity request", async () => {
    const resMissing = await postBuyCapacity(
      makeBuyRequest({ targetMint: mint, fundingAsset: "USDC", amount: "100", maxPremiumPct: "5" }, false)
    );
    expect(resMissing.status).toBe(400);
    const bodyMissing = await resMissing.json();
    expect(bodyMissing.error.code).toBe("VALIDATION_ERROR");

    const resInvalidLen = await postBuyCapacity(
      makeBuyRequest({ targetMint: mint, fundingAsset: "USDC", amount: "100", maxPremiumPct: "5", wallet: "short" }, false)
    );
    expect(resInvalidLen.status).toBe(400);
    const bodyInvalidLen = await resInvalidLen.json();
    expect(bodyInvalidLen.error.code).toBe("VALIDATION_ERROR");
  });

  // 45. wallet is required in Sell capacity request (Step 8.2)
  it("45. wallet is required in Sell capacity request", async () => {
    const resMissing = await postSellCapacity(
      makeSellRequest({ targetMint: mint, amount: "1", maxDiscountPct: "5" }, false)
    );
    expect(resMissing.status).toBe(400);
    const bodyMissing = await resMissing.json();
    expect(bodyMissing.error.code).toBe("VALIDATION_ERROR");

    const resInvalidLen = await postSellCapacity(
      makeSellRequest({ targetMint: mint, amount: "1", maxDiscountPct: "5", wallet: "short" }, false)
    );
    expect(resInvalidLen.status).toBe(400);
    const bodyInvalidLen = await resInvalidLen.json();
    expect(bodyInvalidLen.error.code).toBe("VALIDATION_ERROR");
  });
});
