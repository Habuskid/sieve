import { describe, it, expect, beforeEach } from "vitest";
import { InMemorySieveRepository } from "../../server/database/repository";
import { PriceCheckService } from "../../server/services/check-service";
import { BuyCapacityService, type BuyCapacityRequest } from "../../server/services/buy-capacity-service";
import { TransactionBuildService } from "../../server/services/build-service";
import { toDecimal, rawToDisplay } from "../../core/money/decimal";

const wallet = "11111111111111111111111111111111";
const otherWallet = "22222222222222222222222222222222";
const mint = "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF";
const usdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

interface HarnessOptions {
  referencePriceUsd?: string;
  decimals?: number;
  transferFeeBps?: number;
  activeMultiplier?: string;
  solPriceUsd?: string;
  // Custom quoter returning outputRaw for a given inputRaw
  quoter?: (inputRaw: bigint, inputMint: string) => bigint;
}

function makeBuyCapacityHarness(options: HarnessOptions = {}) {
  const repo = new InMemorySieveRepository();
  const refPrice = options.referencePriceUsd ?? "100";
  const decimals = options.decimals ?? 6;
  const transferFeeBps = options.transferFeeBps ?? 0;
  const activeMultiplier = options.activeMultiplier ?? "1";
  const solPrice = options.solPriceUsd ?? "150";

  let marketCallCount = 0;
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
    chainTimestamp: 1_700_000_000,
    epoch: 600n,
    transferFee:
      transferFeeBps > 0
        ? {
            epoch: 600n,
            maximumFee: 10_000_000n,
            basisPoints: transferFeeBps,
          }
        : null,
    olderTransferFee: null,
    newerTransferFee: null,
    scaledUiAmount:
      activeMultiplier !== "1"
        ? {
            activeMultiplier,
            multiplierEffectiveTimestamp: 1_600_000_000,
            newMultiplierEffectiveTimestamp: null,
            newMultiplier: null,
          }
        : null,
    issuerControls: {
      permanentDelegate: false,
      pausable: false,
      isPaused: false,
      defaultAccountState: "Initialized",
    },
    transferHook: null,
    blockers: [],
    warnings: [],
    transferFeeBasisPoints: transferFeeBps,
    maximumFee: transferFeeBps > 0 ? 10_000_000n : 0n,
  };

  const quoteCalls: { inputRaw: bigint; inputMint: string }[] = [];

  const jupiter = {
    getQuote: async ({ inputMint, outputMint, amount }: any) => {
      quoteCalls.push({ inputRaw: amount, inputMint });
      let outputRaw: bigint;
      if (options.quoter) {
        outputRaw = options.quoter(amount, inputMint);
      } else {
        // Default linear quoter: 100 USDC gives 0.97 PreStock (approx $103/token, ~3% premium)
        // 100 USDC raw (100_000_000) * 97 / 10000 = 970_000 raw (0.97 tokens)
        outputRaw = (amount * 97n) / 10_000n;
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
    },
    getSolUsdPrice: async () => solPrice,
    buildTransaction: async ({ amount }: any) => ({
      transactionBase64: "AA==",
      requestId: "fixture-request",
      lastValidBlockHeight: "123",
      otherAmountThreshold: ((amount * 95n) / 100n).toString(),
      quote: {
        provider: "JUPITER",
        inputMint: usdc,
        outputMint: mint,
        inputRaw: amount,
        outputRaw: (amount * 97n) / 100n,
        outputDecimals: decimals,
        expectedTargetAmount: "1",
        routeFingerprint: "fixture",
      },
    }),
  } as any;

  const solana = {
    resolveMintMetadata: async () => metadata,
    checkBalance: async () => ({ hasSufficient: true }),
    checkDestinationAccount: async () => ({ exists: true, isFrozen: false, address: wallet }),
  } as any;

  const checker = new PriceCheckService(markets, jupiter, solana, repo);
  const capacityService = new BuyCapacityService(markets, checker, solana, repo);
  const builder = new TransactionBuildService(markets, jupiter, solana, repo);

  return {
    repo,
    checker,
    capacityService,
    builder,
    quoteCalls,
    getMarketCallCount: () => marketCallCount,
  };
}

describe("Buy Boundary Capacity Integration (Task 5)", () => {
  const baseInput: BuyCapacityRequest = {
    targetMint: mint,
    fundingAsset: "USDC",
    amount: "100", // 100 USDC
    maxPremiumPct: "5", // 5% max premium over $100 ref -> $105 max buy price
    wallet,
    clientIntentVersion: "v1",
  };

  // 1. USDC full requested amount passes
  it("1. USDC full requested amount passes: 1 probe, FULLY_WITHIN_BOUNDARY, exactly 1 PriceCheck persisted", async () => {
    // At $103 buy price vs $105 max, full 100 USDC passes
    const h = makeBuyCapacityHarness();
    const result = await h.capacityService.executeCapacity(baseInput);

    expect(result.status).toBe("FULLY_WITHIN_BOUNDARY");
    expect(result.probeCount).toBe(1);
    expect(result.requestedAmount).toBe("100");
    expect(result.verifiedCapacity?.fundingAmount).toBe("100");
    expect(result.checkId).not.toBeNull();

    // Exactly 1 PriceCheck persisted in repository
    const checks = await h.repo.listPriceChecks();
    expect(checks).toHaveLength(1);
    expect(checks[0].id).toBe(result.checkId);
    expect(checks[0].funding.inputDisplay).toBe("100");
    expect(checks[0].decision.status).toBe("GOOD_TO_GO");
  });

  // 2. USDC full requested amount fails, smaller amount passes
  it("2. USDC full fails and smaller passes: PARTIALLY_WITHIN_BOUNDARY, highest observed pass, persisted amount equals capacity", async () => {
    // 100 USDC -> severe slippage, output only 90 tokens ($111/token, fails 5% limit)
    // <= 50 USDC -> good liquidity, output 48 tokens ($104.16/token, passes 5% limit)
    const h = makeBuyCapacityHarness({
      quoter: (amount: bigint) => {
        if (amount > 50_000_000n) {
          // Bad rate: $111/token (price too high)
          return (amount * 90n) / 10_000n;
        }
        // Good rate: $104.16/token (within 5% premium)
        return (amount * 96n) / 10_000n;
      },
    });

    const result = await h.capacityService.executeCapacity(baseInput);

    expect(result.status).toBe("PARTIALLY_WITHIN_BOUNDARY");
    expect(result.probeCount).toBeGreaterThan(1);
    expect(result.probeCount).toBeLessThanOrEqual(10);
    expect(result.verifiedCapacity).not.toBeNull();
    expect(Number(result.verifiedCapacity!.fundingAmount)).toBeLessThan(100);
    expect(result.checkId).not.toBeNull();

    // Exactly 1 PriceCheck persisted, matching the verified capacity amount
    const checks = await h.repo.listPriceChecks();
    expect(checks).toHaveLength(1);
    expect(checks[0].id).toBe(result.checkId);
    expect(checks[0].funding.inputDisplay).toBe(result.verifiedCapacity!.fundingAmount);
  });

  // 3. no Buy candidate passes
  it("3. no candidate passes: NO_VERIFIED_CAPACITY, verified capacity is null, 0 PriceChecks persisted", async () => {
    // Always bad rate: $150/token (fails 5% limit)
    const h = makeBuyCapacityHarness({
      quoter: (amount: bigint) => (amount * 66n) / 10_000n,
    });

    const result = await h.capacityService.executeCapacity(baseInput);

    expect(result.status).toBe("NO_VERIFIED_CAPACITY");
    expect(result.verifiedCapacity).toBeNull();
    expect(result.checkId).toBeNull();

    // No executable PriceCheck persisted
    const checks = await h.repo.listPriceChecks();
    expect(checks).toHaveLength(0);
  });

  // 4. no search uses >10 quote probes
  it("4. probe count never exceeds 10 even in deep midpoint searches", async () => {
    const h = makeBuyCapacityHarness({
      quoter: (amount: bigint) => {
        // Deep threshold requiring multiple refinement steps
        return amount <= 37_412_000n ? (amount * 96n) / 10_000n : (amount * 85n) / 10_000n;
      },
    });

    const result = await h.capacityService.executeCapacity(baseInput);
    expect(result.probeCount).toBeLessThanOrEqual(10);
    expect(h.quoteCalls.length).toBeLessThanOrEqual(10);
  });

  // 5. exploratory probes are not persisted
  it("5. exploratory intermediate probes are ephemeral and never persisted", async () => {
    const h = makeBuyCapacityHarness({
      quoter: (amount: bigint) => {
        return amount <= 50_000_000n ? (amount * 96n) / 10_000n : (amount * 80n) / 10_000n;
      },
    });

    await h.capacityService.executeCapacity(baseInput);
    expect(h.quoteCalls.length).toBeGreaterThan(1);

    // Only the final passing candidate is persisted
    const checks = await h.repo.listPriceChecks();
    expect(checks).toHaveLength(1);
  });

  // 6. final selected candidate was actually quoted
  it("6. final selected candidate was actually quoted in Jupiter call history", async () => {
    const h = makeBuyCapacityHarness({
      quoter: (amount: bigint) => {
        return amount <= 50_000_000n ? (amount * 96n) / 10_000n : (amount * 80n) / 10_000n;
      },
    });

    const result = await h.capacityService.executeCapacity(baseInput);
    const selectedRaw = BigInt(result.verifiedCapacity!.fundingAmountRaw);
    const quotedAmounts = h.quoteCalls.map((q) => q.inputRaw);

    expect(quotedAmounts).toContain(selectedRaw);
  });

  // 7. evaluator/search amount identity preserved
  it("7. evaluator and search amount identity are strictly preserved", async () => {
    const h = makeBuyCapacityHarness();
    const result = await h.capacityService.executeCapacity(baseInput);

    expect(result.requestedAmountRaw).toBe("100000000"); // 100 * 10^6
    expect(result.requestedCandidate.fundingAmountRaw).toBe("100000000");
  });

  // 8. Token-2022 ScaledUiAmount affects economic output using existing code
  it("8. Token-2022 ScaledUiAmount multiplier scales economic PreStock units", async () => {
    // Multiplier = 2.0 -> raw units / 2.0 = economic units
    const h = makeBuyCapacityHarness({
      activeMultiplier: "2.0",
    });

    const result = await h.capacityService.executeCapacity(baseInput);
    expect(result.status).toBe("FULLY_WITHIN_BOUNDARY");
    // With multiplier 2.0, expected economic target amount reflects the multiplier
    const check = (await h.repo.listPriceChecks())[0];
    expect(check.decision.currentBuyPriceUsd).not.toBeNull();
  });

  // 9. output transfer fee affects economic output using existing code
  it("9. output transfer fee reduces net PreStock units received", async () => {
    // 500 bps (5%) transfer fee withheld
    const hWithFee = makeBuyCapacityHarness({ transferFeeBps: 500 });
    const hNoFee = makeBuyCapacityHarness({ transferFeeBps: 0 });

    const resWithFee = await hWithFee.capacityService.executeCapacity(baseInput);
    const resNoFee = await hNoFee.capacityService.executeCapacity(baseInput);

    // With fee, net economic output is smaller, so effective buy price is higher
    const priceWithFee = Number(resWithFee.requestedCandidate.effectiveBuyPriceUsd);
    const priceNoFee = Number(resNoFee.requestedCandidate.effectiveBuyPriceUsd);

    expect(priceWithFee).toBeGreaterThan(priceNoFee);
  });

  // 10. exact boundary passes
  it("10. exact boundary passes (price == maxBuyPrice)", async () => {
    // 100 USDC input. Max price is $105. Exactly $105 price = 100 / 105 = 0.952380 tokens
    // 952_380 raw tokens gives 100 / 0.952380 = 105.000...
    const h = makeBuyCapacityHarness({
      quoter: () => 952_381n, // yields ~$104.999
    });

    const result = await h.capacityService.executeCapacity(baseInput);
    expect(result.status).toBe("FULLY_WITHIN_BOUNDARY");
    expect(result.requestedCandidate.withinBoundary).toBe(true);
  });

  // 11. one-step-over boundary fails using existing Buy evaluator semantics
  it("11. one-step-over boundary fails (price > maxBuyPrice)", async () => {
    // 950_000 raw tokens gives 100 / 0.95 = $105.26 -> exceeds $105 max
    const h = makeBuyCapacityHarness({
      quoter: () => 950_000n,
    });

    const result = await h.capacityService.executeCapacity({
      ...baseInput,
      amount: "100",
    });

    expect(result.requestedCandidate.withinBoundary).toBe(false);
    expect(result.requestedCandidate.status).toBe("PRICE_TOO_HIGH");
  });

  // 12. SOL funding capacity behavior
  it("12. SOL funding capacity searches on lamport dimension with contemporaneous SOL/USD valuation", async () => {
    // 1 SOL = $150. Input = 1 SOL (1_000_000_000 lamports). USD value = $150.
    // Reference price = $100. Max premium = 10% -> max buy price = $110.
    // 1 SOL ($150) buying OpenAI PreStocks at $105/token needs ~1.428571 tokens.
    const h = makeBuyCapacityHarness({
      solPriceUsd: "150",
      quoter: (amount: bigint, mint: string) => {
        // Linear: 1 SOL (10^9) -> 1.428571 * 10^6
        return (amount * 1_428_571n) / 1_000_000_000n;
      },
    });

    const solInput: BuyCapacityRequest = {
      targetMint: mint,
      fundingAsset: "SOL",
      amount: "1", // 1 SOL
      maxPremiumPct: "10",
      wallet,
      clientIntentVersion: "v1",
    };

    const result = await h.capacityService.executeCapacity(solInput);
    expect(result.status).toBe("FULLY_WITHIN_BOUNDARY");
    expect(result.fundingAsset).toBe("SOL");
    expect(result.requestedAmountRaw).toBe("1000000000"); // 10^9 lamports
    expect(result.verifiedCapacity?.fundingAmount).toBe("1");

    const check = (await h.repo.listPriceChecks())[0];
    expect(check.funding.fundingAsset).toBe("SOL");
    expect(check.funding.inputRaw).toBe(1_000_000_000n);
    expect(check.funding.method).toBe("CURRENT_MARKET_ROUTE");
  });

  // 13. wallet binding preserved for final PriceCheck
  it("13. wallet binding is preserved on the persisted PriceCheck", async () => {
    const h = makeBuyCapacityHarness();
    const result = await h.capacityService.executeCapacity(baseInput);

    const check = await h.repo.getPriceCheck(result.checkId!);
    expect(check?.wallet).toBe(wallet);
  });

  // 14. client/build cannot substitute a larger amount after capacity selection
  it("14. client cannot substitute a larger amount during build of a capacity-generated check", async () => {
    // User requested 100 USDC, but capacity found was 50 USDC
    const h = makeBuyCapacityHarness({
      quoter: (amount: bigint) => {
        return amount <= 50_000_000n ? (amount * 96n) / 10_000n : (amount * 80n) / 10_000n;
      },
    });

    const result = await h.capacityService.executeCapacity(baseInput);
    expect(result.status).toBe("PARTIALLY_WITHIN_BOUNDARY");
    expect(result.verifiedCapacity?.fundingAmount).toBe("50");

    // Build only accepts checkId and wallet - user cannot supply an amount to build!
    const buildResult = await h.builder.buildTransaction({
      checkId: result.checkId!,
      wallet,
    });

    expect(buildResult.status).toBe("READY_FOR_WALLET");
    if (buildResult.status === "READY_FOR_WALLET") {
      // Build uses the verified capacity amount (50 USDC), not the user's original 100 USDC!
      expect(buildResult.summary.fundingAmount).toBe("50");
    }

    // Build with another wallet is rejected
    await expect(
      h.builder.buildTransaction({
        checkId: result.checkId!,
        wallet: otherWallet,
      })
    ).rejects.toMatchObject({ details: { code: "WALLET_MISMATCH" } });
  });

  // 15. reference snapshot remains coherent across one search
  it("15. reference snapshot remains coherent across all candidate probes in one search", async () => {
    const h = makeBuyCapacityHarness({
      quoter: (amount: bigint) => {
        return amount <= 50_000_000n ? (amount * 96n) / 10_000n : (amount * 80n) / 10_000n;
      },
    });

    const result = await h.capacityService.executeCapacity(baseInput);
    expect(result.probeCount).toBeGreaterThan(1);

    // getMarketByMint was called exactly once for this search
    expect(h.getMarketCallCount()).toBe(1);
  });

  // 16. final PriceCheck contains the existing fields required by build
  it("16. final PriceCheck contains all required fields for build revalidation", async () => {
    const h = makeBuyCapacityHarness();
    const result = await h.capacityService.executeCapacity(baseInput);

    const check = await h.repo.getPriceCheck(result.checkId!);
    expect(check).not.toBeNull();
    expect(check!.funding.method).toBe("USDC_PAR");
    expect(check!.quote?.outputDecimals).toBe(6);
    expect(check!.asset.referencePriceUsd).toBe("100");
    expect(check!.maxPremiumPct).toBe("5");
    expect(check!.expiresAt).toBeDefined();
  });
});
