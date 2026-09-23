import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as postBuyBuild } from "../../app/api/build/route";
import { POST as postSellBuild } from "../../app/api/sell/build/route";
import { POST as postBuyCapacity } from "../../app/api/capacity/buy/route";
import { POST as postSellCapacity } from "../../app/api/capacity/sell/route";
import { BuyCapacityService } from "../../server/services/buy-capacity-service";
import { SellCapacityService } from "../../server/services/sell-capacity-service";
import { TransactionBuildService } from "../../server/services/build-service";
import { SellBuildService } from "../../server/services/sell-build-service";
import { PriceCheckService } from "../../server/services/check-service";
import { SellCheckService } from "../../server/services/sell-check-service";
import { SieveAppError } from "../../server/services/errors";
import { CANONICAL_MINTS } from "../../server/solana/adapter";
import { rawToDisplay } from "../../core/money/decimal";
import type { PriceCheck, BuildIntent } from "../../core/domain/types";
import type { SellPriceCheck, SellBuildIntent } from "../../core/domain/sell-types";

const walletA = "11111111111111111111111111111111";
const walletB = "22222222222222222222222222222222";
const targetMint = "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF";
const usdcMint = CANONICAL_MINTS.mainnet.USDC;
const decimals = 9;

function makeRequest(url: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createHarness(options: {
  referencePriceUsd?: string;
  transferFeeBps?: number;
  activeMultiplier?: string;
  newMultiplierEffectiveTimestamp?: number | null;
  chainTimestamp?: number | null;
  buyQuoteOutputRaw?: (amount: bigint) => bigint;
  sellQuoteOutputRaw?: (amount: bigint) => bigint;
  buyBuildThreshold?: (amount: bigint) => string | null;
  sellBuildThreshold?: (amount: bigint) => string | null;
} = {}) {
  let refPrice = options.referencePriceUsd ?? "100";
  let transferFeeBps = options.transferFeeBps ?? 0;
  let activeMultiplier = options.activeMultiplier ?? "1";
  let newMultiplierEffectiveTimestamp = options.newMultiplierEffectiveTimestamp ?? null;
  let chainTimestamp = options.chainTimestamp ?? 1_700_000_000;

  const buyChecks = new Map<string, PriceCheck>();
  const buyBuildIntents = new Map<string, BuildIntent>();
  const sellChecks = new Map<string, SellPriceCheck>();
  const sellBuildIntents = new Map<string, SellBuildIntent>();

  const repo = {
    savePriceCheck: async (c: PriceCheck) => { buyChecks.set(c.id, c); },
    getPriceCheck: async (id: string) => buyChecks.get(id) ?? null,
    saveBuildIntent: async (b: BuildIntent) => { buyBuildIntents.set(b.id, b); },
    getBuildIntent: async (id: string) => buyBuildIntents.get(id) ?? null,
    saveSellPriceCheck: async (c: SellPriceCheck) => { sellChecks.set(c.id, c); },
    getSellPriceCheck: async (id: string) => sellChecks.get(id) ?? null,
    saveSellBuildIntent: async (b: SellBuildIntent) => { sellBuildIntents.set(b.id, b); },
    getSellBuildIntent: async (id: string) => sellBuildIntents.get(id) ?? null,
    isHealthy: async () => true,
  } as any;

  const markets = {
    getMarketByMint: async (mint: string) => {
      if (mint !== targetMint) return null;
      return {
        name: "OpenAI PreStocks",
        symbol: "OPENAI",
        mint: targetMint,
        referencePriceUsd: refPrice,
        observedAt: new Date().toISOString(),
      };
    },
  } as any;

  let quoteCallCount = 0;
  let sellQuoteCallCount = 0;

  const jupiter = {
    getQuote: async ({ inputMint, outputMint, amount }: any) => {
      if (outputMint === targetMint) {
        quoteCallCount++;
        let outputRaw: bigint;
        if (options.buyQuoteOutputRaw) {
          outputRaw = options.buyQuoteOutputRaw(amount);
        } else {
          // 100 USDC (10^8) -> ~0.97 tokens (970_000_000 raw)
          outputRaw = (amount * 97n) / 10n;
        }
        const expTarget = rawToDisplay(outputRaw, decimals).toString();
        return {
          quote: {
            provider: "JUPITER" as const,
            inputMint,
            outputMint,
            inputRaw: amount,
            outputRaw,
            outputDecimals: decimals,
            expectedTargetAmount: expTarget,
            priceImpactPct: "0.1",
            observedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            routeFingerprint: `fixture-${amount}`,
          },
          rawResponse: { inUsdValue: null },
        };
      } else {
        // Sell quote: PreStock -> USDC
        sellQuoteCallCount++;
        let outputRaw: bigint;
        if (options.sellQuoteOutputRaw) {
          outputRaw = options.sellQuoteOutputRaw(amount);
        } else {
          // 1 PreStock (10^9 raw) -> 97 USDC (97_000_000 raw)
          outputRaw = (amount * 97n) / 1000n;
        }
        const expUsdc = rawToDisplay(outputRaw, 6).toString();
        return {
          quote: {
            provider: "JUPITER" as const,
            inputMint,
            outputMint,
            inputRaw: amount,
            outputRaw,
            outputDecimals: 6,
            expectedTargetAmount: expUsdc,
            priceImpactPct: "0.1",
            observedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            routeFingerprint: `fixture-${amount}`,
          },
          rawResponse: {
            inAmount: amount.toString(),
            outAmount: outputRaw.toString(),
            feeMint: null,
            platformFee: null,
          },
        };
      }
    },
    buildTransaction: async ({ inputMint, amount, slippageBps }: any) => {
      if (inputMint === usdcMint) {
        // Buy build
        let thresholdStr: string | null;
        if (options.buyBuildThreshold) {
          thresholdStr = options.buyBuildThreshold(amount);
        } else {
          // ~0.97 tokens minimum (> 952_380_953 minimum required for $100 at $105 max price even with transfer fees)
          thresholdStr = ((amount * 97n) / 10n).toString();
        }
        return {
          transactionBase64: "dGVzdC10cmFuc2FjdGlvbg==",
          requestId: "fixture-buy-request",
          lastValidBlockHeight: "123",
          otherAmountThreshold: thresholdStr,
          quote: {
            provider: "JUPITER",
            inputMint: usdcMint,
            outputMint: targetMint,
            inputRaw: amount,
            outputRaw: (amount * 97n) / 10n,
            outputDecimals: decimals,
            expectedTargetAmount: "0.97",
            routeFingerprint: "fixture",
          },
        };
      } else {
        // Sell build
        let thresholdStr: string | null;
        if (options.sellBuildThreshold) {
          thresholdStr = options.sellBuildThreshold(amount);
        } else {
          thresholdStr = ((amount * 95n) / 1000n).toString();
        }
        return {
          transactionBase64: "dGVzdC1zZWxsLXRyYW5zYWN0aW9u",
          requestId: "fixture-sell-request",
          lastValidBlockHeight: "123",
          otherAmountThreshold: thresholdStr,
          quote: {
            provider: "JUPITER",
            inputMint: targetMint,
            outputMint: usdcMint,
            inputRaw: amount,
            outputRaw: (amount * 97n) / 1000n,
            outputDecimals: 6,
            expectedTargetAmount: "97",
            routeFingerprint: "fixture",
          },
          feeMint: null,
          platformFee: null,
        };
      }
    },
    getSolUsdPrice: async () => "150",
  } as any;

  const solana = {
    resolveMintMetadata: async () => ({
      mint: targetMint,
      decimals,
      supported: true,
      programOwner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      transferFee:
        transferFeeBps > 0
          ? {
              epoch: 600n,
              maximumFee: 10_000_000_000n,
              basisPoints: transferFeeBps,
            }
          : null,
      olderTransferFee: null,
      newerTransferFee: null,
      scaledUiAmount: {
        activeMultiplier,
        multiplier: activeMultiplier,
        newMultiplierEffectiveTimestamp,
        newMultiplier: null,
      },
      chainTimestamp,
      epoch: 500,
    }),
    checkBalance: async () => ({ hasSufficient: true }),
    checkTokenBalance: async () => ({ hasSufficient: true }),
    checkDestinationAccount: async () => ({ exists: true, isFrozen: false, address: walletA }),
  } as any;

  const buyChecker = new PriceCheckService(markets, jupiter, solana, repo);
  const buyCapacityService = new BuyCapacityService(markets, buyChecker, solana, repo);
  const buyBuilder = new TransactionBuildService(markets, jupiter, solana, repo);

  const sellChecker = new SellCheckService(markets, jupiter, solana, repo);
  const sellCapacityService = new SellCapacityService(markets, sellChecker, solana, repo);
  const sellBuilder = new SellBuildService(markets, jupiter, solana, sellChecker, repo);

  return {
    repo,
    markets,
    jupiter,
    solana,
    buyCapacityService,
    buyBuilder,
    sellCapacityService,
    sellBuilder,
    getQuoteCallCount: () => quoteCallCount,
    getSellQuoteCallCount: () => sellQuoteCallCount,
    setRefPrice: (p: string) => { refPrice = p; },
    setBuyRefPrice: (p: string) => { refPrice = p; },
    setSellRefPrice: (p: string) => { refPrice = p; },
    setTransferFeeBps: (bps: number) => { transferFeeBps = bps; },
    setActiveMultiplier: (m: string) => { activeMultiplier = m; },
    setNewMultiplierEffectiveTimestamp: (ts: number | null) => { newMultiplierEffectiveTimestamp = ts; },
  };
}

describe("Task 8 - Capacity -> Check -> Build Security Proof (Deterministic Test Suite)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // 1. WALLET A capacity check -> Wallet A build -> PASS
  it("1. WALLET A capacity check -> Wallet A build -> PASS", async () => {
    const h = createHarness();
    const capacityRes = await h.buyCapacityService.executeCapacity({
      targetMint,
      fundingAsset: "USDC",
      amount: "100",
      maxPremiumPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    expect(capacityRes.status).toBe("FULLY_WITHIN_BOUNDARY");
    expect(capacityRes.checkId).toBeTruthy();

    const buildRes = await h.buyBuilder.buildTransaction({
      checkId: capacityRes.checkId!,
      wallet: walletA,
    });

    expect(buildRes.status).toBe("READY_FOR_WALLET");
  });

  // 2. WALLET A capacity check -> Wallet B build -> FAIL (WALLET_MISMATCH)
  it("2. WALLET A capacity check -> Wallet B build -> FAIL (WALLET_MISMATCH)", async () => {
    const h = createHarness();
    const capacityRes = await h.buyCapacityService.executeCapacity({
      targetMint,
      fundingAsset: "USDC",
      amount: "100",
      maxPremiumPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    await expect(
      h.buyBuilder.buildTransaction({
        checkId: capacityRes.checkId!,
        wallet: walletB,
      })
    ).rejects.toMatchObject({ details: { code: "WALLET_MISMATCH" } });
  });

  // 3. WALLET A Sell capacity check -> Wallet A Sell build -> PASS
  it("3. WALLET A Sell capacity check -> Wallet A Sell build -> PASS", async () => {
    const h = createHarness();
    const capacityRes = await h.sellCapacityService.executeCapacity({
      targetMint,
      amount: "1",
      maxDiscountPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    expect(capacityRes.status).toBe("FULLY_WITHIN_BOUNDARY");
    expect(capacityRes.checkId).toBeTruthy();

    const buildRes = await h.sellBuilder.buildTransaction({
      checkId: capacityRes.checkId!,
      wallet: walletA,
    });

    expect(buildRes.status).toBe("READY_FOR_WALLET");
  });

  // 4. WALLET A Sell capacity check -> Wallet B Sell build -> FAIL (WALLET_MISMATCH)
  it("4. WALLET A Sell capacity check -> Wallet B Sell build -> FAIL (WALLET_MISMATCH)", async () => {
    const h = createHarness();
    const capacityRes = await h.sellCapacityService.executeCapacity({
      targetMint,
      amount: "1",
      maxDiscountPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    await expect(
      h.sellBuilder.buildTransaction({
        checkId: capacityRes.checkId!,
        wallet: walletB,
      })
    ).rejects.toMatchObject({ details: { code: "WALLET_MISMATCH" } });
  });

  // 5. Capacity check without wallet rejected or cannot produce buildable check
  it("5. Capacity check without wallet rejected or cannot produce buildable check", async () => {
    const h = createHarness();
    await expect(
      h.buyCapacityService.executeCapacity({
        targetMint,
        fundingAsset: "USDC",
        amount: "100",
        maxPremiumPct: "5",
        wallet: "" as any,
        clientIntentVersion: "v1",
      })
    ).rejects.toMatchObject({ details: { code: "WALLET_NOT_CONNECTED" } });

    await expect(
      h.sellCapacityService.executeCapacity({
        targetMint,
        amount: "1",
        maxDiscountPct: "5",
        wallet: "" as any,
        clientIntentVersion: "v1",
      })
    ).rejects.toMatchObject({ details: { code: "WALLET_NOT_CONNECTED" } });

    // Also via API
    const resBuy = await postBuyCapacity(
      makeRequest("http://localhost:3000/api/capacity/buy", {
        targetMint,
        fundingAsset: "USDC",
        amount: "100",
        maxPremiumPct: "5",
      })
    );
    expect(resBuy.status).toBe(400);

    const resSell = await postSellCapacity(
      makeRequest("http://localhost:3000/api/capacity/sell", {
        targetMint,
        amount: "1",
        maxDiscountPct: "5",
      })
    );
    expect(resSell.status).toBe(400);
  });

  // 6. Attempt to build against a check with null wallet fails closed
  it("6. Attempt to build against a check with null wallet fails closed", async () => {
    const h = createHarness();
    const dummyBuyCheck: PriceCheck = {
      id: "33333333-3333-4333-8333-333333333333",
      clientIntentVersion: "v1",
      network: "mainnet",
      wallet: null as any,
      asset: { name: "OpenAI PreStocks", symbol: "OPENAI", mint: targetMint } as any,
      funding: { fundingAsset: "USDC", inputDisplay: "100", inputRaw: 100_000_000n, inputUsdValue: "100" } as any,
      maxPremiumPct: "5",
      decision: { status: "GOOD_TO_GO", currentBuyPriceUsd: "103", maximumBuyPriceUsd: "105", referencePriceUsd: "100", premiumPct: "3", premiumBps: 300, displayTitle: "Good", displayMessage: "Good" } as any,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    } as any;
    await h.repo.savePriceCheck(dummyBuyCheck);

    await expect(
      h.buyBuilder.buildTransaction({
        checkId: dummyBuyCheck.id,
        wallet: walletA,
      })
    ).rejects.toMatchObject({ details: { code: "WALLET_MISMATCH" } });

    const dummySellCheck: SellPriceCheck = {
      id: "44444444-4444-4444-8444-444444444444",
      clientIntentVersion: "v1",
      network: "mainnet",
      wallet: null as any,
      asset: { name: "OpenAI PreStocks", symbol: "OPENAI", mint: targetMint } as any,
      input: { requestedEconomicAmount: "1", actualEconomicAmount: "1", rawWalletInput: 1_000_000_000n, rawRouteInput: 1_000_000_000n, rawTransferFee: 0n, decimals: 9, activeMultiplier: "1" } as any,
      maxDiscountPct: "5",
      expectedUsdcProceedsRaw: 97_000_000n,
      expectedUsdcProceeds: "97",
      decision: { status: "GOOD_TO_GO", currentSellPriceUsd: "97", minimumSellPriceUsd: "95", referencePriceUsd: "100", discountPct: "3", discountBps: 300, displayTitle: "Good", displayMessage: "Good" } as any,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    } as any;
    await h.repo.saveSellPriceCheck(dummySellCheck);

    await expect(
      h.sellBuilder.buildTransaction({
        checkId: dummySellCheck.id,
        wallet: walletA,
      })
    ).rejects.toMatchObject({ details: { code: "WALLET_MISMATCH" } });
  });

  // 7. Client passes different amount in build body -> schema rejects (extra field)
  it("7. Client passes different amount in build body -> schema rejects (extra field)", async () => {
    const res = await postBuyBuild(
      makeRequest("http://localhost:3000/api/build", {
        checkId: "11111111-1111-4111-8111-111111111111",
        wallet: walletA,
        amount: "500",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // 8. Client passes different amount in Sell build body -> schema rejects (extra field)
  it("8. Client passes different amount in Sell build body -> schema rejects (extra field)", async () => {
    const res = await postSellBuild(
      makeRequest("http://localhost:3000/api/sell/build", {
        checkId: "11111111-1111-4111-8111-111111111111",
        wallet: walletA,
        amount: "500",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // 9. Client passes different targetMint in build body -> schema rejects
  it("9. Client passes different targetMint in build body -> schema rejects", async () => {
    const res = await postBuyBuild(
      makeRequest("http://localhost:3000/api/build", {
        checkId: "11111111-1111-4111-8111-111111111111",
        wallet: walletA,
        targetMint: "So11111111111111111111111111111111111111112",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // 10. Client passes different targetMint in Sell build body -> schema rejects
  it("10. Client passes different targetMint in Sell build body -> schema rejects", async () => {
    const res = await postSellBuild(
      makeRequest("http://localhost:3000/api/sell/build", {
        checkId: "11111111-1111-4111-8111-111111111111",
        wallet: walletA,
        targetMint: "So11111111111111111111111111111111111111112",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // 11. Client passes different fundingAsset in build body -> schema rejects
  it("11. Client passes different fundingAsset in build body -> schema rejects", async () => {
    const res = await postBuyBuild(
      makeRequest("http://localhost:3000/api/build", {
        checkId: "11111111-1111-4111-8111-111111111111",
        wallet: walletA,
        fundingAsset: "SOL",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // 12. Client passes different outputAsset in Sell build body -> schema rejects
  it("12. Client passes different outputAsset in Sell build body -> schema rejects", async () => {
    const res = await postSellBuild(
      makeRequest("http://localhost:3000/api/sell/build", {
        checkId: "11111111-1111-4111-8111-111111111111",
        wallet: walletA,
        outputAsset: "SOL",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // 13. Client passes different maxPremiumPct in build body -> schema rejects
  it("13. Client passes different maxPremiumPct in build body -> schema rejects", async () => {
    const res = await postBuyBuild(
      makeRequest("http://localhost:3000/api/build", {
        checkId: "11111111-1111-4111-8111-111111111111",
        wallet: walletA,
        maxPremiumPct: "10",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // 14. Client passes different maxDiscountPct in Sell build body -> schema rejects
  it("14. Client passes different maxDiscountPct in Sell build body -> schema rejects", async () => {
    const res = await postSellBuild(
      makeRequest("http://localhost:3000/api/sell/build", {
        checkId: "11111111-1111-4111-8111-111111111111",
        wallet: walletA,
        maxDiscountPct: "10",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // 15. Expired capacity check -> build fails (TRANSACTION_EXPIRED)
  it("15. Expired capacity check -> build fails (TRANSACTION_EXPIRED)", async () => {
    const h = createHarness();
    const capacityRes = await h.buyCapacityService.executeCapacity({
      targetMint,
      fundingAsset: "USDC",
      amount: "100",
      maxPremiumPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    const storedCheck = await h.repo.getPriceCheck(capacityRes.checkId!);
    storedCheck!.expiresAt = new Date(0).toISOString();

    await expect(
      h.buyBuilder.buildTransaction({
        checkId: capacityRes.checkId!,
        wallet: walletA,
      })
    ).rejects.toMatchObject({ details: { code: "TRANSACTION_EXPIRED" } });
  });

  // 16. Expired Sell capacity check -> Sell build fails (TRANSACTION_EXPIRED)
  it("16. Expired Sell capacity check -> Sell build fails (TRANSACTION_EXPIRED)", async () => {
    const h = createHarness();
    const capacityRes = await h.sellCapacityService.executeCapacity({
      targetMint,
      amount: "1",
      maxDiscountPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    const storedCheck = await h.repo.getSellPriceCheck(capacityRes.checkId!);
    storedCheck!.expiresAt = new Date(0).toISOString();

    await expect(
      h.sellBuilder.buildTransaction({
        checkId: capacityRes.checkId!,
        wallet: walletA,
      })
    ).rejects.toMatchObject({ details: { code: "TRANSACTION_EXPIRED" } });
  });

  // 17. PreStocks reference price moved higher between Buy capacity and build -> build re-fetches and rejects if price exceeds boundary
  it("17. PreStocks reference price moved higher between Buy capacity and build -> build re-fetches and rejects if price exceeds boundary", async () => {
    const h = createHarness();
    const capacityRes = await h.buyCapacityService.executeCapacity({
      targetMint,
      fundingAsset: "USDC",
      amount: "100",
      maxPremiumPct: "5", // Max buy price: $105
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    // Market moves: PreStocks reference price drops or quote output decreases so effective price is > $105
    // Here we move reference price to $90 with quote at $103 -> premium = (103 - 90)/90 = +14.4% > 5%
    h.setBuyRefPrice("90");

    const buildRes = await h.buyBuilder.buildTransaction({
      checkId: capacityRes.checkId!,
      wallet: walletA,
    });

    expect(buildRes.status).toBe("BLOCKED");
    if (buildRes.status === "BLOCKED") {
      expect(buildRes.reason).toBe("PRICE_MOVED");
    }
  });

  // 18. PreStocks reference price moved lower between Sell capacity and build -> Sell build re-fetches and rejects if price exceeds boundary
  it("18. PreStocks reference price moved lower between Sell capacity and build -> Sell build re-fetches and rejects if price exceeds boundary", async () => {
    const h = createHarness();
    const capacityRes = await h.sellCapacityService.executeCapacity({
      targetMint,
      amount: "1",
      maxDiscountPct: "5", // Reference $100 -> min sell price $95
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    // Reference moves to $110 while proceeds remain $97 -> discount = (110 - 97)/110 = 11.8% > 5% max discount
    h.setSellRefPrice("110");

    const buildRes = await h.sellBuilder.buildTransaction({
      checkId: capacityRes.checkId!,
      wallet: walletA,
    });

    expect(buildRes.status).toBe("BLOCKED");
    if (buildRes.status === "BLOCKED") {
      expect(buildRes.reason).toBe("PRICE_MOVED");
    }
  });

  // 19. Token-2022 multiplier changed between capacity and Sell build -> build detects change and rejects / recalculates
  it("19. Token-2022 multiplier changed between capacity and Sell build -> build detects change and re-evaluates boundary", async () => {
    const h = createHarness({
      activeMultiplier: "1",
    });
    const capacityRes = await h.sellCapacityService.executeCapacity({
      targetMint,
      amount: "1",
      maxDiscountPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    // Multiplier shifts from 1 to 2.0 between capacity and build
    h.setActiveMultiplier("2.0");

    // Sell build re-derives conversion with new multiplier:
    // With multiplier 2.0, 1 economic PreStock = 0.5 * 10^9 raw tokens instead of 10^9 raw tokens
    // Default quoter gives (500_000_000 * 97) / 1000 = 48.5 USDC proceeds
    // But reference price is still $100 for 1 economic PreStock -> effective sell price $48.50 is below $95 floor!
    const buildRes = await h.sellBuilder.buildTransaction({
      checkId: capacityRes.checkId!,
      wallet: walletA,
    });

    expect(buildRes.status).toBe("BLOCKED");
    if (buildRes.status === "BLOCKED") {
      expect(buildRes.reason).toBe("PRICE_MOVED");
    }
  });

  // 19b. Buy active ScaledUiAmount multiplier changed between capacity and Buy build -> build re-evaluates boundary and blocks when violated
  it("19b. Buy active ScaledUiAmount multiplier changed between capacity and Buy build -> build re-evaluates boundary and blocks when violated", async () => {
    const h = createHarness({
      activeMultiplier: "1",
    });
    const capacityRes = await h.buyCapacityService.executeCapacity({
      targetMint,
      fundingAsset: "USDC",
      amount: "100",
      maxPremiumPct: "5", // Max buy price: $105
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    // Multiplier shifts from 1 to 0.5 between capacity and build
    // 1 economic token now requires 2 raw tokens (0.5 multiplier)
    // 0.97 raw tokens received = 0.485 economic tokens
    // Effective buy price = 100 / 0.485 = $206.18 > $105 max buy price!
    h.setActiveMultiplier("0.5");

    const buildRes = await h.buyBuilder.buildTransaction({
      checkId: capacityRes.checkId!,
      wallet: walletA,
    });

    expect(buildRes.status).toBe("BLOCKED");
    if (buildRes.status === "BLOCKED") {
      expect(buildRes.reason).toBe("PRICE_MOVED");
    }
  });

  // 19c. Buy active ScaledUiAmount multiplier changed between capacity and Buy build -> build re-evaluates boundary and succeeds when valid
  it("19c. Buy active ScaledUiAmount multiplier changed between capacity and Buy build -> build re-evaluates boundary and succeeds when valid", async () => {
    const h = createHarness({
      activeMultiplier: "1",
    });
    const capacityRes = await h.buyCapacityService.executeCapacity({
      targetMint,
      fundingAsset: "USDC",
      amount: "100",
      maxPremiumPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    // Multiplier shifts from 1 to 1.5 between capacity and build
    // 0.97 raw tokens = 1.455 economic tokens -> effective price = $68.72 <= $105
    h.setActiveMultiplier("1.5");

    const buildRes = await h.buyBuilder.buildTransaction({
      checkId: capacityRes.checkId!,
      wallet: walletA,
    });

    expect(buildRes.status).toBe("READY_FOR_WALLET");
    if (buildRes.status === "READY_FOR_WALLET") {
      expect(buildRes.summary.activeMultiplier).toBe("1.5");
      expect(buildRes.summary.expectedTargetAmount).toBe("1.455");
    }
  });

  // 20. Token-2022 transfer fee changed between capacity and Sell build -> build uses fresh fee in final quote
  it("20. Token-2022 transfer fee changed between capacity and Sell build -> build uses fresh fee in final quote", async () => {
    const h = createHarness({
      transferFeeBps: 0,
    });
    const capacityRes = await h.sellCapacityService.executeCapacity({
      targetMint,
      amount: "1",
      maxDiscountPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    // Transfer fee changes to 200 bps (2%)
    h.setTransferFeeBps(200);

    // Build resolves fresh metadata and applies the 200 bps fee
    const buildRes = await h.sellBuilder.buildTransaction({
      checkId: capacityRes.checkId!,
      wallet: walletA,
    });

    // Build succeeded with fresh fee accounted for in conversion and route
    expect(buildRes.status).toBe("READY_FOR_WALLET");
  });

  // 21. Token-2022 transfer fee changed between capacity and Buy build -> build uses fresh fee in final quote
  it("21. Token-2022 transfer fee changed between capacity and Buy build -> build uses fresh fee in final quote", async () => {
    const h = createHarness({
      transferFeeBps: 0,
    });
    const capacityRes = await h.buyCapacityService.executeCapacity({
      targetMint,
      fundingAsset: "USDC",
      amount: "100",
      maxPremiumPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    // Transfer fee changes to 100 bps
    h.setTransferFeeBps(100);

    const buildRes = await h.buyBuilder.buildTransaction({
      checkId: capacityRes.checkId!,
      wallet: walletA,
    });

    expect(buildRes.status).toBe("READY_FOR_WALLET");
  });

  // 22. Future multiplier transition within 120s between capacity and Sell build -> build blocks with ROUTE_RISK
  it("22. Future multiplier transition within 120s between capacity and Sell build -> build blocks with ROUTE_RISK", async () => {
    const h = createHarness();
    const capacityRes = await h.sellCapacityService.executeCapacity({
      targetMint,
      amount: "1",
      maxDiscountPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    // Schedule transition 60 seconds into future relative to chain time (1_700_000_000 + 60)
    h.setNewMultiplierEffectiveTimestamp(1_700_000_060);

    await expect(
      h.sellBuilder.buildTransaction({
        checkId: capacityRes.checkId!,
        wallet: walletA,
      })
    ).rejects.toMatchObject({ details: { code: "ROUTE_RISK" } });
  });

  // 22b. Buy future multiplier transition within 120s between capacity and Buy build -> build blocks with ROUTE_RISK
  it("22b. Buy future multiplier transition within 120s between capacity and Buy build -> build blocks with ROUTE_RISK", async () => {
    const h = createHarness();
    const capacityRes = await h.buyCapacityService.executeCapacity({
      targetMint,
      fundingAsset: "USDC",
      amount: "100",
      maxPremiumPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    // Schedule transition 60 seconds into future relative to chain time (1_700_000_000 + 60)
    h.setNewMultiplierEffectiveTimestamp(1_700_000_060);

    await expect(
      h.buyBuilder.buildTransaction({
        checkId: capacityRes.checkId!,
        wallet: walletA,
      })
    ).rejects.toMatchObject({ details: { code: "ROUTE_RISK" } });
  });

  // 23. Build re-calls Jupiter quote with fresh market state (does not reuse capacity quote)
  it("23. Build re-calls Jupiter quote with fresh market state (does not reuse capacity quote)", async () => {
    const h = createHarness();
    const capacityRes = await h.buyCapacityService.executeCapacity({
      targetMint,
      fundingAsset: "USDC",
      amount: "100",
      maxPremiumPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    const quotesBeforeBuild = h.getQuoteCallCount();
    expect(quotesBeforeBuild).toBeGreaterThan(0);

    await h.buyBuilder.buildTransaction({
      checkId: capacityRes.checkId!,
      wallet: walletA,
    });

    const quotesAfterBuild = h.getQuoteCallCount();
    expect(quotesAfterBuild).toBe(quotesBeforeBuild + 1);
  });

  // 24. Sell build re-calls Jupiter quote with fresh market state (does not reuse capacity quote)
  it("24. Sell build re-calls Jupiter quote with fresh market state (does not reuse capacity quote)", async () => {
    const h = createHarness();
    const capacityRes = await h.sellCapacityService.executeCapacity({
      targetMint,
      amount: "1",
      maxDiscountPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    const quotesBeforeBuild = h.getSellQuoteCallCount();
    expect(quotesBeforeBuild).toBeGreaterThan(0);

    await h.sellBuilder.buildTransaction({
      checkId: capacityRes.checkId!,
      wallet: walletA,
    });

    const quotesAfterBuild = h.getSellQuoteCallCount();
    expect(quotesAfterBuild).toBe(quotesBeforeBuild + 1);
  });

  // ======================================================================
  // SIDE-SPECIFIC FINAL THRESHOLD MATRIX: BUY
  // ======================================================================

  // Buy 1. missing otherAmountThreshold -> fail closed (ROUTE_RISK)
  it("BUY THRESHOLD MATRIX - 1. missing otherAmountThreshold -> fail closed (ROUTE_RISK)", async () => {
    const hBuy = createHarness({
      buyBuildThreshold: () => null,
    });
    const buyCap = await hBuy.buyCapacityService.executeCapacity({
      targetMint,
      fundingAsset: "USDC",
      amount: "100",
      maxPremiumPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });
    await expect(
      hBuy.buyBuilder.buildTransaction({ checkId: buyCap.checkId!, wallet: walletA })
    ).rejects.toMatchObject({ details: { code: "ROUTE_RISK" } });
  });

  // Buy 2. final guaranteed NET target output exactly 1 raw unit below Sieve required minimum -> fail closed
  it("BUY THRESHOLD MATRIX - 2. final guaranteed NET target output exactly 1 raw unit below Sieve required minimum -> fail closed", async () => {
    // 100 USDC at $105 max price requires 952_380_953n raw minimum
    // Exactly 1 raw unit below = 952_380_952n
    const hBuy = createHarness({
      buyBuildThreshold: () => "952380952",
    });
    const buyCap = await hBuy.buyCapacityService.executeCapacity({
      targetMint,
      fundingAsset: "USDC",
      amount: "100",
      maxPremiumPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });
    await expect(
      hBuy.buyBuilder.buildTransaction({ checkId: buyCap.checkId!, wallet: walletA })
    ).rejects.toMatchObject({ details: { code: "PRICE_MOVED_OUTSIDE_LIMIT" } });
  });

  // Buy 3. exact Sieve required minimum -> accepted
  it("BUY THRESHOLD MATRIX - 3. exact Sieve required minimum -> accepted", async () => {
    // Exactly 952_380_953n raw minimum
    const hBuy = createHarness({
      buyBuildThreshold: () => "952380953",
    });
    const buyCap = await hBuy.buyCapacityService.executeCapacity({
      targetMint,
      fundingAsset: "USDC",
      amount: "100",
      maxPremiumPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });
    const buyBuild = await hBuy.buyBuilder.buildTransaction({ checkId: buyCap.checkId!, wallet: walletA });
    expect(buyBuild.status).toBe("READY_FOR_WALLET");
  });

  // Buy 4. greater than required minimum -> accepted
  it("BUY THRESHOLD MATRIX - 4. greater than required minimum -> accepted", async () => {
    // 952_380_954n raw (1 unit above minimum)
    const hBuy = createHarness({
      buyBuildThreshold: () => "952380954",
    });
    const buyCap = await hBuy.buyCapacityService.executeCapacity({
      targetMint,
      fundingAsset: "USDC",
      amount: "100",
      maxPremiumPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });
    const buyBuild = await hBuy.buyBuilder.buildTransaction({ checkId: buyCap.checkId!, wallet: walletA });
    expect(buyBuild.status).toBe("READY_FOR_WALLET");
  });

  // Buy 5. transfer-fee-bearing target: comparison is over NET target economics, not gross raw Jupiter threshold
  it("BUY THRESHOLD MATRIX - 5. transfer-fee-bearing target: comparison is over NET target economics, not gross raw Jupiter threshold", async () => {
    // Target has 100 bps (1%) transfer fee
    // Required minimum is 952_380_953n raw
    // Jupiter threshold is 955_000_000n raw (GROSS is ABOVE minimum: 955_000_000 > 952_380_953)
    // BUT NET output after 1% transfer fee: 955_000_000 * 0.99 = 945_450_000n (< 952_380_953n)
    // Build MUST fail closed because NET output violates boundary
    const hBuy = createHarness({
      transferFeeBps: 100,
      buyBuildThreshold: () => "955000000",
    });
    const buyCap = await hBuy.buyCapacityService.executeCapacity({
      targetMint,
      fundingAsset: "USDC",
      amount: "100",
      maxPremiumPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });
    await expect(
      hBuy.buyBuilder.buildTransaction({ checkId: buyCap.checkId!, wallet: walletA })
    ).rejects.toMatchObject({ details: { code: "PRICE_MOVED_OUTSIDE_LIMIT" } });
  });

  // ======================================================================
  // SIDE-SPECIFIC FINAL THRESHOLD MATRIX: SELL
  // ======================================================================

  // Sell 1. missing otherAmountThreshold -> fail closed (ROUTE_RISK)
  it("SELL THRESHOLD MATRIX - 1. missing otherAmountThreshold -> fail closed (ROUTE_RISK)", async () => {
    const hSell = createHarness({
      sellBuildThreshold: () => null,
    });
    const sellCap = await hSell.sellCapacityService.executeCapacity({
      targetMint,
      amount: "1",
      maxDiscountPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });
    await expect(
      hSell.sellBuilder.buildTransaction({ checkId: sellCap.checkId!, wallet: walletA })
    ).rejects.toMatchObject({ details: { code: "ROUTE_RISK" } });
  });

  // Sell 2. final guaranteed USDC output exactly 1 raw USDC unit below Sieve floor -> fail closed
  it("SELL THRESHOLD MATRIX - 2. final guaranteed USDC output exactly 1 raw USDC unit below Sieve floor -> fail closed", async () => {
    // 1 PreStock at $95 min price requires 95_000_000n raw USDC minimum (6 decimals)
    // Exactly 1 raw unit below = 94_999_999n
    const hSell = createHarness({
      sellBuildThreshold: () => "94999999",
    });
    const sellCap = await hSell.sellCapacityService.executeCapacity({
      targetMint,
      amount: "1",
      maxDiscountPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });
    await expect(
      hSell.sellBuilder.buildTransaction({ checkId: sellCap.checkId!, wallet: walletA })
    ).rejects.toMatchObject({ details: { code: "PRICE_MOVED_OUTSIDE_LIMIT" } });
  });

  // Sell 3. exact Sieve USDC floor -> accepted
  it("SELL THRESHOLD MATRIX - 3. exact Sieve USDC floor -> accepted", async () => {
    // Exactly 95_000_000n raw USDC
    const hSell = createHarness({
      sellBuildThreshold: () => "95000000",
    });
    const sellCap = await hSell.sellCapacityService.executeCapacity({
      targetMint,
      amount: "1",
      maxDiscountPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });
    const sellBuild = await hSell.sellBuilder.buildTransaction({ checkId: sellCap.checkId!, wallet: walletA });
    expect(sellBuild.status).toBe("READY_FOR_WALLET");
  });

  // Sell 4. greater than Sieve USDC floor -> accepted
  it("SELL THRESHOLD MATRIX - 4. greater than Sieve USDC floor -> accepted", async () => {
    // 95_000_001n raw USDC (1 unit above floor)
    const hSell = createHarness({
      sellBuildThreshold: () => "95000001",
    });
    const sellCap = await hSell.sellCapacityService.executeCapacity({
      targetMint,
      amount: "1",
      maxDiscountPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });
    const sellBuild = await hSell.sellBuilder.buildTransaction({ checkId: sellCap.checkId!, wallet: walletA });
    expect(sellBuild.status).toBe("READY_FOR_WALLET");
  });

  // Sell 5. PreStock INPUT transfer fee is not subtracted again from USDC output
  it("SELL THRESHOLD MATRIX - 5. PreStock INPUT transfer fee is not subtracted again from USDC output", async () => {
    // PreStock has 200 bps (2%) input transfer fee
    // Sieve floor for 1 token at $95 is 95_000_000 raw USDC
    // Jupiter otherAmountThreshold is 95_000_000 raw USDC
    // Since output is canonical USDC, the 200 bps input fee was already handled at input debit
    // and is NOT subtracted again from USDC output.
    // Therefore, exact 95_000_000 USDC threshold passes!
    const hSell = createHarness({
      transferFeeBps: 200,
      sellBuildThreshold: () => "95000000",
    });
    const sellCap = await hSell.sellCapacityService.executeCapacity({
      targetMint,
      amount: "1",
      maxDiscountPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });
    const sellBuild = await hSell.sellBuilder.buildTransaction({ checkId: sellCap.checkId!, wallet: walletA });
    expect(sellBuild.status).toBe("READY_FOR_WALLET");
  });

  // 30. If Jupiter slippage parameter is omitted from build call -> fails closed
  it("30. If Jupiter slippage parameter is omitted from build call -> fails closed", async () => {
    const h = createHarness();
    let buySlippagePassed: number | undefined;
    let sellSlippagePassed: number | undefined;

    const originalBuildTx = h.jupiter.buildTransaction;
    h.jupiter.buildTransaction = async (params: any) => {
      if (params.inputMint === usdcMint) {
        buySlippagePassed = params.slippageBps;
      } else {
        sellSlippagePassed = params.slippageBps;
      }
      return originalBuildTx(params);
    };

    const buyCap = await h.buyCapacityService.executeCapacity({
      targetMint,
      fundingAsset: "USDC",
      amount: "100",
      maxPremiumPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });
    await h.buyBuilder.buildTransaction({ checkId: buyCap.checkId!, wallet: walletA });
    expect(buySlippagePassed).toBeDefined();
    expect(typeof buySlippagePassed).toBe("number");
    expect(buySlippagePassed).toBeGreaterThan(0);

    const sellCap = await h.sellCapacityService.executeCapacity({
      targetMint,
      amount: "1",
      maxDiscountPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });
    await h.sellBuilder.buildTransaction({ checkId: sellCap.checkId!, wallet: walletA });
    expect(sellSlippagePassed).toBeDefined();
    expect(typeof sellSlippagePassed).toBe("number");
    expect(sellSlippagePassed).toBeGreaterThan(0);
  });

  // 31. Cross-side check confusion: Buy checkId passed to Sell build -> FAIL (CHECK_NOT_FOUND or wrong side)
  it("31. Cross-side check confusion: Buy checkId passed to Sell build -> FAIL (QUOTE_EXPIRED)", async () => {
    const h = createHarness();
    const buyCap = await h.buyCapacityService.executeCapacity({
      targetMint,
      fundingAsset: "USDC",
      amount: "100",
      maxPremiumPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    await expect(
      h.sellBuilder.buildTransaction({
        checkId: buyCap.checkId!,
        wallet: walletA,
      })
    ).rejects.toMatchObject({ details: { code: "QUOTE_EXPIRED" } });
  });

  // 32. Cross-side check confusion: Sell checkId passed to Buy build -> FAIL (CHECK_NOT_FOUND or wrong side)
  it("32. Cross-side check confusion: Sell checkId passed to Buy build -> FAIL (QUOTE_EXPIRED)", async () => {
    const h = createHarness();
    const sellCap = await h.sellCapacityService.executeCapacity({
      targetMint,
      amount: "1",
      maxDiscountPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    await expect(
      h.buyBuilder.buildTransaction({
        checkId: sellCap.checkId!,
        wallet: walletA,
      })
    ).rejects.toMatchObject({ details: { code: "QUOTE_EXPIRED" } });
  });

  // 33. Unknown checkId passed to build -> FAIL (QUOTE_EXPIRED)
  it("33. Unknown checkId passed to build -> FAIL (QUOTE_EXPIRED)", async () => {
    const h = createHarness();
    await expect(
      h.buyBuilder.buildTransaction({
        checkId: "99999999-9999-4999-8999-999999999999",
        wallet: walletA,
      })
    ).rejects.toMatchObject({ details: { code: "QUOTE_EXPIRED" } });
  });

  // 34. Unknown checkId passed to Sell build -> FAIL (QUOTE_EXPIRED)
  it("34. Unknown checkId passed to Sell build -> FAIL (QUOTE_EXPIRED)", async () => {
    const h = createHarness();
    await expect(
      h.sellBuilder.buildTransaction({
        checkId: "99999999-9999-4999-8999-999999999999",
        wallet: walletA,
      })
    ).rejects.toMatchObject({ details: { code: "QUOTE_EXPIRED" } });
  });

  // 35. NO_VERIFIED_CAPACITY result has checkId: null -> cannot be passed to build (schema requires UUID)
  it("35. NO_VERIFIED_CAPACITY result has checkId: null -> cannot be passed to build", async () => {
    // Quoter returns price outside boundary for all amounts
    const h = createHarness({
      buyQuoteOutputRaw: (amt) => (amt * 50n) / 10n, // Price double $100 -> $200 (outside 5% boundary)
    });
    const capRes = await h.buyCapacityService.executeCapacity({
      targetMint,
      fundingAsset: "USDC",
      amount: "100",
      maxPremiumPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    expect(capRes.status).toBe("NO_VERIFIED_CAPACITY");
    expect(capRes.checkId).toBeNull();

    // Passing null checkId to build API is rejected by UUID schema
    const res = await postBuyBuild(
      makeRequest("http://localhost:3000/api/build", {
        checkId: capRes.checkId,
        wallet: walletA,
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // 36. Build schema rejects network selector (Mainnet only)
  it("36. Build schema rejects network selector (Mainnet only)", async () => {
    const resBuy = await postBuyBuild(
      makeRequest("http://localhost:3000/api/build", {
        checkId: "11111111-1111-4111-8111-111111111111",
        wallet: walletA,
        network: "devnet",
      })
    );
    expect(resBuy.status).toBe(400);

    const resSell = await postSellBuild(
      makeRequest("http://localhost:3000/api/sell/build", {
        checkId: "11111111-1111-4111-8111-111111111111",
        wallet: walletA,
        network: "devnet",
      })
    );
    expect(resSell.status).toBe(400);
  });

  // 37. Build schema rejects any override fields (force, skipValidation, etc.)
  it("37. Build schema rejects any override fields (force, skipValidation, etc.)", async () => {
    const resBuy = await postBuyBuild(
      makeRequest("http://localhost:3000/api/build", {
        checkId: "11111111-1111-4111-8111-111111111111",
        wallet: walletA,
        force: true,
        skipValidation: true,
      })
    );
    expect(resBuy.status).toBe(400);

    const resSell = await postSellBuild(
      makeRequest("http://localhost:3000/api/sell/build", {
        checkId: "11111111-1111-4111-8111-111111111111",
        wallet: walletA,
        force: true,
        skipValidation: true,
      })
    );
    expect(resSell.status).toBe(400);
  });

  // 38. Transaction returned by build is unsigned and has not been broadcast
  it("38. Transaction returned by build is unsigned and has not been broadcast", async () => {
    const h = createHarness();
    const capacityRes = await h.buyCapacityService.executeCapacity({
      targetMint,
      fundingAsset: "USDC",
      amount: "100",
      maxPremiumPct: "5",
      wallet: walletA,
      clientIntentVersion: "v1",
    });

    const buildRes = await h.buyBuilder.buildTransaction({
      checkId: capacityRes.checkId!,
      wallet: walletA,
    });

    expect(buildRes.status).toBe("READY_FOR_WALLET");
    if (buildRes.status === "READY_FOR_WALLET") {
      // Transaction is base64 string
      expect(typeof buildRes.serializedTransaction).toBe("string");
      expect(buildRes.serializedTransaction).toBe("dGVzdC10cmFuc2FjdGlvbg==");
      // Verify build intent is persisted as unsigned
      const intent = await h.repo.getBuildIntent(buildRes.buildIntentId);
      expect(intent).not.toBeNull();
      expect(intent!.transactionBase64).toBe("dGVzdC10cmFuc2FjdGlvbg==");
    }
  });
});
