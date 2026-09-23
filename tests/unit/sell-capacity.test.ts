import { describe, it, expect, beforeEach } from "vitest";
import { InMemorySieveRepository } from "../../server/database/repository";
import { SellCheckService } from "../../server/services/sell-check-service";
import {
  SellCapacityService,
  type SellCapacityRequest,
} from "../../server/services/sell-capacity-service";
import { SellBuildService } from "../../server/services/sell-build-service";
import { CANONICAL_MINTS } from "../../server/solana/adapter";
import { rawToDisplay, toDecimal } from "../../core/money/decimal";

const wallet = "11111111111111111111111111111111";
const otherWallet = "22222222222222222222222222222222";
const mint = "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF";
const usdc = CANONICAL_MINTS.mainnet.USDC;

interface HarnessOptions {
  referencePriceUsd?: string;
  decimals?: number;
  transferFeeBps?: number;
  activeMultiplier?: string;
  newMultiplierEffectiveTimestamp?: number | null;
  chainTimestamp?: number | null;
  // Custom quoter returning outputRaw (USDC 6 decimals) for a given candidate inputRaw (PreStock)
  quoter?: (inputRaw: bigint, inputMint: string) => bigint;
  outputMint?: string;
}

function makeSellCapacityHarness(options: HarnessOptions = {}) {
  const repo = new InMemorySieveRepository();
  const refPrice = options.referencePriceUsd ?? "100";
  const decimals = options.decimals ?? 9;
  const transferFeeBps = options.transferFeeBps ?? 0;
  const activeMultiplier = options.activeMultiplier ?? "1";
  const outputMint = options.outputMint ?? usdc;

  let marketCallCount = 0;
  let metadataCallCount = 0;

  const asset = {
    name: "OpenAI PreStocks",
    symbol: "OPENAI",
    mint,
    imageUrl: null,
    productUrl: null,
    referencePriceUsd: refPrice,
    tokenPriceUsd: null,
    referenceValuationUsd: null,
    impliedValuationUsd: null,
    supply: null,
    source: "PRESTOCKS" as const,
    observedAt: new Date().toISOString(),
    network: "mainnet" as const,
  };

  const markets = {
    getMarketByMint: async () => {
      marketCallCount++;
      return { ...asset, observedAt: new Date().toISOString() };
    },
  } as any;

  const metadata = {
    mint,
    programOwner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    decimals,
    extensions: [],
    supported: true,
    validatedAt: Date.now(),
    chainTimestamp: options.chainTimestamp !== undefined ? options.chainTimestamp : 1_700_000_000,
    epoch: 600n,
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
    scaledUiAmount:
      activeMultiplier !== "1" || options.newMultiplierEffectiveTimestamp !== undefined
        ? {
            activeMultiplier,
            multiplier: activeMultiplier,
            newMultiplierEffectiveTimestamp: options.newMultiplierEffectiveTimestamp ?? null,
            newMultiplier: null,
          }
        : null,
    issuerControls: {
      permanentDelegate: false,
      pausable: false,
      isPaused: false,
      defaultAccountState: "Initialized" as const,
    },
    transferHook: null,
    blockers: [],
    warnings: [],
    transferFeeBasisPoints: transferFeeBps,
    maximumFee: transferFeeBps > 0 ? 10_000_000_000n : 0n,
  };

  const quoteCalls: { inputRaw: bigint; inputMint: string }[] = [];

  const jupiter = {
    getQuote: async ({ inputMint, outputMint: quoteOutMint, amount }: any) => {
      quoteCalls.push({ inputRaw: amount, inputMint });
      let outputRaw: bigint;
      if (options.quoter) {
        outputRaw = options.quoter(amount, inputMint);
      } else {
        // Default linear quoter: 1 PreStock (10^9 raw with 9 decimals) gives 97 USDC (97_000_000 raw with 6 decimals)
        // Ratio: outputRaw = (amount * 97_000_000n) / 1_000_000_000n = (amount * 97n) / 1000n
        outputRaw = (amount * 97n) / 1000n;
      }
      const expTarget = rawToDisplay(outputRaw, 6).toString();
      return {
        quote: {
          provider: "JUPITER" as const,
          inputMint,
          outputMint: quoteOutMint ?? outputMint,
          inputRaw: amount,
          outputRaw,
          outputDecimals: 6,
          expectedTargetAmount: expTarget,
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
    },
    buildTransaction: async ({ amount }: any) => ({
      transactionBase64: "AA==",
      requestId: "fixture-sell-request",
      lastValidBlockHeight: "123",
      otherAmountThreshold: ((amount * 95n) / 1000n).toString(),
      quote: {
        provider: "JUPITER",
        inputMint: mint,
        outputMint: usdc,
        inputRaw: amount,
        outputRaw: (amount * 97n) / 1000n,
        outputDecimals: 6,
        expectedTargetAmount: "97",
        routeFingerprint: "fixture",
      },
      feeMint: null,
      platformFee: null,
    }),
  } as any;

  const solana = {
    resolveMintMetadata: async () => {
      metadataCallCount++;
      return metadata;
    },
    checkTokenBalance: async () => ({ hasSufficient: true }),
  } as any;

  const checker = new SellCheckService(markets, jupiter, solana, repo);
  const capacityService = new SellCapacityService(markets, checker, solana, repo);
  const builder = new SellBuildService(markets, jupiter, solana, checker, repo);

  return {
    repo,
    checker,
    capacityService,
    builder,
    quoteCalls,
    getMarketCallCount: () => marketCallCount,
    getMetadataCallCount: () => metadataCallCount,
    getSellCheckCount: () => (repo as any).sellChecks.size,
  };
}

describe("Sell Boundary Capacity Integration (Task 6)", () => {
  const baseInput: SellCapacityRequest = {
    targetMint: mint,
    amount: "1", // 1 PreStock
    maxDiscountPct: "5", // 5% max discount under $100 ref -> $95 min sell price
    wallet,
    clientIntentVersion: "v1",
  };

  // 1. FULL REQUEST PASS
  it("1. full requested economic Sell amount passes: 1 probe, FULLY_WITHIN_BOUNDARY, exactly 1 PriceCheck persisted", async () => {
    // 1 PreStock (10^9 raw) gives 97 USDC ($97/token vs $95 min sell price -> passes)
    const h = makeSellCapacityHarness();
    const result = await h.capacityService.executeCapacity(baseInput);

    expect(result.status).toBe("FULLY_WITHIN_BOUNDARY");
    expect(result.probeCount).toBe(1);
    expect(result.requestedAmount).toBe("1");
    expect(result.verifiedCapacity?.economicAmount).toBe("1");
    expect(result.checkId).not.toBeNull();

    // Exactly 1 SellPriceCheck persisted in repository
    expect(h.getSellCheckCount()).toBe(1);
    const check = await h.repo.getSellPriceCheck(result.checkId!);
    expect(check).not.toBeNull();
    expect(check!.input.requestedEconomicAmount).toBe("1");
    expect(check!.decision.status).toBe("GOOD_TO_GO");
  });

  // 2. FULL FAIL / SMALLER PASS
  it("2. full request fails and smaller observed amount passes: PARTIALLY_WITHIN_BOUNDARY, highest observed pass, exactly 1 PriceCheck persisted", async () => {
    // > 0.5 PreStock (500_000_000n): severe price impact, only 90 USDC/token (fails 5% discount)
    // <= 0.5 PreStock: good liquidity, gives 96 USDC/token (passes 5% discount)
    const h = makeSellCapacityHarness({
      quoter: (amount: bigint) => {
        if (amount > 500_000_000n) {
          // Bad rate: $90/token (fails $95 min price)
          // 90 USDC with 6 decimals = 90_000_000n per 10^9 raw -> (amount * 90n) / 1000n
          return (amount * 90n) / 1000n;
        }
        // Good rate: $96/token (passes $95 min price)
        return (amount * 96n) / 1000n;
      },
    });

    const result = await h.capacityService.executeCapacity(baseInput);

    expect(result.status).toBe("PARTIALLY_WITHIN_BOUNDARY");
    expect(result.probeCount).toBeGreaterThan(1);
    expect(result.probeCount).toBeLessThanOrEqual(10);
    expect(result.verifiedCapacity).not.toBeNull();
    expect(Number(result.verifiedCapacity!.economicAmount)).toBeLessThan(1);
    expect(result.checkId).not.toBeNull();

    // Exactly 1 SellPriceCheck persisted, matching the verified capacity amount
    expect(h.getSellCheckCount()).toBe(1);
    const check = await h.repo.getSellPriceCheck(result.checkId!);
    expect(check).not.toBeNull();
    expect(check!.input.actualEconomicAmount).toBe(result.verifiedCapacity!.economicAmount);
  });

  // 3. NO PASS
  it("3. no candidate passes: NO_VERIFIED_CAPACITY, verified capacity is null, 0 PriceChecks persisted", async () => {
    // Always bad rate: $80/token (fails 5% limit)
    const h = makeSellCapacityHarness({
      quoter: (amount: bigint) => (amount * 80n) / 1000n,
    });

    const result = await h.capacityService.executeCapacity(baseInput);

    expect(result.status).toBe("NO_VERIFIED_CAPACITY");
    expect(result.verifiedCapacity).toBeNull();
    expect(result.checkId).toBeNull();

    // No executable PriceCheck persisted
    expect(h.getSellCheckCount()).toBe(0);
  });

  // 4. PROBE LIMIT
  it("4. probe count never exceeds 10 even in deep midpoint searches", async () => {
    const h = makeSellCapacityHarness({
      quoter: (amount: bigint) => {
        return amount <= 374_120_000n ? (amount * 96n) / 1000n : (amount * 85n) / 1000n;
      },
    });

    const result = await h.capacityService.executeCapacity(baseInput);
    expect(result.probeCount).toBeLessThanOrEqual(10);
    expect(h.quoteCalls.length).toBeLessThanOrEqual(10);
  });

  // 5. EXPLORATORY PERSISTENCE
  it("5. exploratory intermediate probes are ephemeral and never persisted", async () => {
    const h = makeSellCapacityHarness({
      quoter: (amount: bigint) => {
        return amount <= 500_000_000n ? (amount * 96n) / 1000n : (amount * 80n) / 1000n;
      },
    });

    await h.capacityService.executeCapacity(baseInput);
    expect(h.quoteCalls.length).toBeGreaterThan(1);

    // Only the final passing candidate is persisted
    expect(h.getSellCheckCount()).toBe(1);
  });

  // 6. OBSERVED ONLY
  it("6. final selected candidate was actually quoted in Jupiter call history", async () => {
    const h = makeSellCapacityHarness({
      quoter: (amount: bigint) => {
        return amount <= 500_000_000n ? (amount * 96n) / 1000n : (amount * 80n) / 1000n;
      },
    });

    const result = await h.capacityService.executeCapacity(baseInput);
    const selectedRaw = BigInt(result.verifiedCapacity!.rawWalletInput);
    const quotedAmounts = h.quoteCalls.map((q) => q.inputRaw);

    expect(quotedAmounts).toContain(selectedRaw);
  });

  // 7. SEARCH AMOUNT IDENTITY
  it("7. evaluator and search amount identity are strictly preserved", async () => {
    const h = makeSellCapacityHarness();
    const result = await h.capacityService.executeCapacity(baseInput);

    expect(result.requestedAmountRaw).toBe("1000000000"); // 1 PreStock with 9 decimals
    expect(result.requestedCandidate.rawWalletInput).toBe("1000000000");
  });

  // 8. SCALED UI MULTIPLIER = 1
  it("8. ScaledUi multiplier = 1 uses existing Sell conversion path", async () => {
    const h = makeSellCapacityHarness({ activeMultiplier: "1" });
    const result = await h.capacityService.executeCapacity(baseInput);

    expect(result.status).toBe("FULLY_WITHIN_BOUNDARY");
    expect(result.requestedAmountRaw).toBe("1000000000");
    const check = await h.repo.getSellPriceCheck(result.checkId!);
    expect(check!.input.activeMultiplier).toBe("1");
    expect(check!.input.actualEconomicAmount).toBe("1");
  });

  // 9. SCALED UI MULTIPLIER > 1
  it("9. ScaledUi multiplier > 1 derives economic amount using existing Sell path", async () => {
    // Multiplier = 2.0 -> 1 economic token requires only 0.5 * 10^9 = 500_000_000 raw tokens
    const h = makeSellCapacityHarness({
      activeMultiplier: "2.0",
      quoter: (amount: bigint) => (amount * 194n) / 1000n, // 500_000_000 * 194 / 1000 = 97_000_000 USDC -> $97/token
    });

    const result = await h.capacityService.executeCapacity(baseInput);
    expect(result.status).toBe("FULLY_WITHIN_BOUNDARY");
    expect(result.requestedAmountRaw).toBe("500000000"); // 0.5 * 10^9 raw tokens
    const check = await h.repo.getSellPriceCheck(result.checkId!);
    expect(check!.input.activeMultiplier).toBe("2");
    expect(check!.input.actualEconomicAmount).toBe("1");
  });

  // 10. SCALED UI MULTIPLIER < 1
  it("10. ScaledUi multiplier < 1 derives economic amount using existing Sell path", async () => {
    // Multiplier = 0.5 -> 1 economic token requires 2.0 * 10^9 + 1 = 2_000_000_001 raw tokens
    const h = makeSellCapacityHarness({
      activeMultiplier: "0.5",
      quoter: (amount: bigint) => (amount * 485n) / 10000n,
    });

    const result = await h.capacityService.executeCapacity(baseInput);
    expect(result.status).toBe("FULLY_WITHIN_BOUNDARY");
    expect(result.requestedAmountRaw).toBe("2000000001");
    const check = await h.repo.getSellPriceCheck(result.checkId!);
    expect(check!.input.activeMultiplier).toBe("0.5");
    expect(check!.input.actualEconomicAmount).toBe("1");
  });

  // 11. INPUT TRANSFER FEE
  it("11. input transfer fee does not artificially inflate the effective Sell price", async () => {
    // When a transfer fee is withheld, wallet debits 1 token (10^9 raw).
    // Route receives only 0.95 token (950_000_000 raw).
    // Linear quoter gives 94 USDC per 1 token gross debit: (amount * 94n) / 1000n
    // The price is always 94 / 1 = $94 (< $95 min price -> fails on all candidates).
    const hWithFee = makeSellCapacityHarness({
      transferFeeBps: 500, // 5% fee
      quoter: (amount: bigint) => (amount * 94n) / 1000n,
    });

    const result = await hWithFee.capacityService.executeCapacity(baseInput);

    // The effective sell price is $94, which is below the $95 minimum sell price
    expect(result.requestedCandidate.withinBoundary).toBe(false);
    expect(result.requestedCandidate.effectiveSellPriceUsd).toBe("94");
    expect(result.status).toBe("NO_VERIFIED_CAPACITY");
  });

  // 12. EXACT BOUNDARY
  it("12. exact boundary passes (currentSellPrice == minimumSellPrice)", async () => {
    // 1 PreStock yields exactly 95 USDC ($95/token == $95 min price)
    const h = makeSellCapacityHarness({
      quoter: () => 95_000_000n,
    });

    const result = await h.capacityService.executeCapacity(baseInput);
    expect(result.status).toBe("FULLY_WITHIN_BOUNDARY");
    expect(result.requestedCandidate.withinBoundary).toBe(true);
    expect(result.requestedCandidate.effectiveSellPriceUsd).toBe("95");
  });

  // 13. ONE STEP BELOW BOUNDARY
  it("13. one step below boundary fails (currentSellPrice < minimumSellPrice)", async () => {
    // 1 PreStock yields 94.99 USDC ($94.99/token < $95 min price)
    const h = makeSellCapacityHarness({
      quoter: () => 94_990_000n,
    });

    const result = await h.capacityService.executeCapacity(baseInput);
    expect(result.requestedCandidate.withinBoundary).toBe(false);
    expect(result.requestedCandidate.status).toBe("PRICE_TOO_LOW");
  });

  // 14. CANONICAL USDC
  it("14. output mint remains canonical Mainnet USDC", async () => {
    const h = makeSellCapacityHarness();
    const result = await h.capacityService.executeCapacity(baseInput);

    expect(result.outputAsset).toBe("USDC");
    const check = await h.repo.getSellPriceCheck(result.checkId!);
    expect(check!.expectedUsdcProceeds).toBeDefined();
  });

  // 15. WALLET BINDING
  it("15. capacity-generated Sell check for wallet A cannot be built by wallet B", async () => {
    const h = makeSellCapacityHarness();
    const result = await h.capacityService.executeCapacity(baseInput);

    expect(result.checkId).not.toBeNull();

    // Build with wrong wallet is rejected
    await expect(
      h.builder.buildTransaction({
        checkId: result.checkId!,
        wallet: otherWallet,
      })
    ).rejects.toMatchObject({ details: { code: "WALLET_MISMATCH" } });

    // Build with original wallet succeeds
    const buildResult = await h.builder.buildTransaction({
      checkId: result.checkId!,
      wallet,
    });
    expect(buildResult.status).toBe("READY_FOR_WALLET");
  });

  // 16. AMOUNT SUBSTITUTION
  it("16. client cannot transform selected Sell capacity into a larger Sell during build", async () => {
    // User requested 1 PreStock, but capacity found was 0.5 PreStock
    const h = makeSellCapacityHarness({
      quoter: (amount: bigint) => {
        return amount <= 500_000_000n ? (amount * 96n) / 1000n : (amount * 80n) / 1000n;
      },
    });

    const result = await h.capacityService.executeCapacity(baseInput);
    expect(result.status).toBe("PARTIALLY_WITHIN_BOUNDARY");
    expect(result.verifiedCapacity?.economicAmount).toBe("0.5");

    // Build only accepts checkId and wallet - user cannot supply an amount to build!
    const buildResult = await h.builder.buildTransaction({
      checkId: result.checkId!,
      wallet,
    });

    expect(buildResult.status).toBe("READY_FOR_WALLET");
    if (buildResult.status === "READY_FOR_WALLET") {
      // Build uses the verified capacity amount (0.5 PreStock), not the original 1 PreStock!
      expect(buildResult.summary.actualEconomicAmount).toBe("0.5");
    }
  });

  // 17. REFERENCE SNAPSHOT
  it("17. reference snapshot remains coherent across all candidate probes in one search", async () => {
    const h = makeSellCapacityHarness({
      quoter: (amount: bigint) => {
        return amount <= 500_000_000n ? (amount * 96n) / 1000n : (amount * 80n) / 1000n;
      },
    });

    const result = await h.capacityService.executeCapacity(baseInput);
    expect(result.probeCount).toBeGreaterThan(1);

    // getMarketByMint was called exactly once for this search
    expect(h.getMarketCallCount()).toBe(1);
  });

  // 18. TOKEN STATE SNAPSHOT
  it("18. token state snapshot remains coherent across all candidate probes in one search", async () => {
    const h = makeSellCapacityHarness({
      quoter: (amount: bigint) => {
        return amount <= 500_000_000n ? (amount * 96n) / 1000n : (amount * 80n) / 1000n;
      },
    });

    const result = await h.capacityService.executeCapacity(baseInput);
    expect(result.probeCount).toBeGreaterThan(1);

    // resolveMintMetadata was called exactly once for this search
    expect(h.getMetadataCallCount()).toBe(1);
  });

  // 19. FUTURE MULTIPLIER TRANSITION
  it("19. future ScaledUi multiplier transition within 120s blocks capacity evaluation", async () => {
    // Chain time = 1_700_000_000, transition at 1_700_000_060 (within 120 seconds)
    const h = makeSellCapacityHarness({
      chainTimestamp: 1_700_000_000,
      newMultiplierEffectiveTimestamp: 1_700_000_060,
    });

    await expect(h.capacityService.executeCapacity(baseInput)).rejects.toMatchObject({
      details: { code: "ROUTE_RISK" },
    });
  });

  // 20. FINAL SELL CHECK COMPATIBILITY
  it("20. persisted capacity-generated Sell PriceCheck contains all fields required by sell-build-service", async () => {
    const h = makeSellCapacityHarness();
    const result = await h.capacityService.executeCapacity(baseInput);

    const check = await h.repo.getSellPriceCheck(result.checkId!);
    expect(check).not.toBeNull();
    expect(check!.input.rawWalletInput).toBe(1_000_000_000n);
    expect(check!.input.rawRouteInput).toBe(1_000_000_000n);
    expect(check!.input.rawTransferFee).toBe(0n);
    expect(check!.asset.referencePriceUsd).toBe("100");
    expect(check!.maxDiscountPct).toBe("5");
    expect(check!.expectedUsdcProceedsRaw).toBeDefined();
    expect(check!.expiresAt).toBeDefined();
  });

  // 21. BUY REGRESSION
  it("21. existing Buy and Buy-capacity services remain unaffected", async () => {
    // SieveRepository handles both Buy and Sell price checks concurrently
    const h = makeSellCapacityHarness();
    const sellResult = await h.capacityService.executeCapacity(baseInput);

    expect(sellResult.side).toBe("SELL");
    expect(h.getSellCheckCount()).toBe(1);
    const buyChecks = await h.repo.listPriceChecks();
    expect(buyChecks).toHaveLength(0);
  });
});
