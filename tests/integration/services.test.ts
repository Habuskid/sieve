// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  PriceCheckService,
  activeChecksStore,
} from "../../server/services/check-service";
import {
  TransactionBuildService,
  activeBuildIntentsStore,
} from "../../server/services/build-service";
import {
  ConfirmationService,
  receiptsBySignatureStore,
  receiptsByWalletStore,
} from "../../server/services/confirmation-service";
import { PracticeAdapter } from "../../server/practice/adapter";
import { MarketService } from "../../server/services/market-service";

describe("Server Orchestration Services (Gate D - Server Authority)", () => {
  let checkService: PriceCheckService;
  let buildService: TransactionBuildService;
  let confirmService: ConfirmationService;
  let practiceAdapter: PracticeAdapter;
  let marketService: MarketService;

  beforeEach(() => {
    activeChecksStore.clear();
    activeBuildIntentsStore.clear();
    receiptsBySignatureStore.clear();
    receiptsByWalletStore.clear();

    practiceAdapter = new PracticeAdapter();
    marketService = new MarketService(undefined, practiceAdapter);
    checkService = new PriceCheckService(marketService, undefined, practiceAdapter);
    buildService = new TransactionBuildService(marketService, undefined, practiceAdapter);
    confirmService = new ConfirmationService();
  });

  it("executes a passing price check in Practice/Testnet mode (PASS_BASIC)", async () => {
    const checkRes = await checkService.executeCheck({
      network: "testnet",
      targetMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      fundingAsset: "USDC",
      amount: "10",
      maxPremiumPct: "5.00",
      clientIntentVersion: "v1",
      scenarioId: "PASS_BASIC",
    });

    expect(checkRes.decision).toBe("GOOD_TO_GO");
    expect(checkRes.price.referenceUsd).toBe("100");
    expect(parseFloat(checkRes.price.currentBuyUsd!)).toBeCloseTo(103, 1);
    expect(checkRes.price.premiumPct).toBe("3.00");
    expect(checkRes.checkId).toBeDefined();

    // Verify stored in active store
    const stored = await checkService.getCheck(checkRes.checkId);
    expect(stored).toBeDefined();
    expect(stored?.decision.status).toBe("GOOD_TO_GO");
  });

  it("blocks a price check when current price exceeds limit (BLOCK_ONE_BP_OVER)", async () => {
    const checkRes = await checkService.executeCheck({
      network: "testnet",
      targetMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      fundingAsset: "USDC",
      amount: "10",
      maxPremiumPct: "5.00",
      clientIntentVersion: "v1",
      scenarioId: "BLOCK_ONE_BP_OVER",
    });

    expect(checkRes.decision).toBe("PRICE_TOO_HIGH");
    expect(checkRes.price.premiumPct).toBe("5.01");
  });

  it("server authority: ignores forged client values during build request", async () => {
    // 1. Client creates a legitimate check with limit 2% (current price is 3%, so it blocks)
    const checkRes = await checkService.executeCheck({
      network: "testnet",
      targetMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      fundingAsset: "USDC",
      amount: "10",
      maxPremiumPct: "2.00", // Limit 2%, price is 3% -> BLOCKED
      clientIntentVersion: "v1",
      scenarioId: "PASS_BASIC",
    });

    expect(checkRes.decision).toBe("PRICE_TOO_HIGH");

    // 2. An attacker attempts to call buildTransaction with the blocked checkId, pretending it passed
    const buildResult = await buildService.buildTransaction({
      checkId: checkRes.checkId,
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      scenarioId: "PASS_BASIC",
    });

    // Server revalidation runs independently and blocks the build!
    expect(buildResult.status).toBe("BLOCKED");
    if (buildResult.status === "BLOCKED") {
      expect(buildResult.refreshedCheck.decision).toBe("PRICE_TOO_HIGH");
    }
  });

  it("pass-then-move: initial check passes, but market moves before build -> transaction blocked", async () => {
    // 1. Initial check with PASS_THEN_MOVE scenario (price is $103, limit is 5% -> PASS)
    const checkRes = await checkService.executeCheck({
      network: "testnet",
      targetMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      fundingAsset: "USDC",
      amount: "10",
      maxPremiumPct: "5.00",
      clientIntentVersion: "v1",
      scenarioId: "PASS_THEN_MOVE",
    });

    expect(checkRes.decision).toBe("GOOD_TO_GO");

    // 2. At build time, revalidation quote returns $108 (8% premium > 5% limit)
    const buildResult = await buildService.buildTransaction({
      checkId: checkRes.checkId,
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      scenarioId: "PASS_THEN_MOVE",
    });

    // Server blocks the transaction because price moved past limit!
    expect(buildResult.status).toBe("BLOCKED");
    if (buildResult.status === "BLOCKED") {
      expect(buildResult.reason).toBe("PRICE_MOVED");
      expect(buildResult.refreshedCheck.decision).toBe("PRICE_TOO_HIGH");
      expect(parseFloat(buildResult.refreshedCheck.price.currentBuyUsd!)).toBeCloseTo(108, 1);
    }
  });

  it("expired check cannot build transaction", async () => {
    const checkRes = await checkService.executeCheck({
      network: "testnet",
      targetMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      fundingAsset: "USDC",
      amount: "10",
      maxPremiumPct: "5.00",
      clientIntentVersion: "v1",
      scenarioId: "PASS_BASIC",
    });

    // Manually expire the stored check in both store and repo
    const stored = (await checkService.getCheck(checkRes.checkId))!;
    stored.expiresAt = new Date(Date.now() - 1000).toISOString();
    activeChecksStore.set(checkRes.checkId, stored);
    const { getRepository } = await import("../../server/database/db");
    await getRepository().savePriceCheck(stored);

    await expect(
      buildService.buildTransaction({
        checkId: checkRes.checkId,
        wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        scenarioId: "PASS_BASIC",
      })
    ).rejects.toThrow(/expired/);
  });

  it("idempotent confirmation: same transaction signature creates only one receipt", async () => {
    // 1. Passing check and build
    const checkRes = await checkService.executeCheck({
      network: "testnet",
      targetMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      fundingAsset: "USDC",
      amount: "10",
      maxPremiumPct: "5.00",
      clientIntentVersion: "v1",
      scenarioId: "PASS_BASIC",
    });

    const buildResult = await buildService.buildTransaction({
      checkId: checkRes.checkId,
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      scenarioId: "PASS_BASIC",
    });

    expect(buildResult.status).toBe("READY_FOR_WALLET");
    if (buildResult.status !== "READY_FOR_WALLET") return;

    const signature = "5K7V4aQ8t9yU2xW3zR1mockSignatureForTestingSolanaTransactions123456789";

    // 2. First confirmation
    const confirm1 = await confirmService.confirmTransaction({
      buildIntentId: buildResult.buildIntentId,
      signature,
      network: "testnet",
    });

    expect(confirm1.status).toBe("CONFIRMED");
    expect(confirm1.receiptId).toBeDefined();

    // 3. Duplicate confirmation with same signature
    const confirm2 = await confirmService.confirmTransaction({
      buildIntentId: buildResult.buildIntentId,
      signature,
      network: "testnet",
    });

    // Exactly the same receipt ID is returned (idempotency preserved)
    expect(confirm2.status).toBe("CONFIRMED");
    expect(confirm2.receiptId).toBe(confirm1.receiptId);

    // Only 1 receipt exists for this wallet
    const walletReceipts = await confirmService.getReceiptsByWallet(
      "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
    );
    expect(walletReceipts).toHaveLength(1);
  });

  it("context binding: rejects buildTransaction if wallet does not match price check", async () => {
    const checkRes = await checkService.executeCheck({
      network: "testnet",
      targetMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      fundingAsset: "USDC",
      amount: "10",
      maxPremiumPct: "5.00",
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      clientIntentVersion: "v1",
      scenarioId: "PASS_BASIC",
    });

    // Attempt to build with a different wallet
    await expect(
      buildService.buildTransaction({
        checkId: checkRes.checkId,
        wallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", // Mismatch!
        scenarioId: "PASS_BASIC",
      })
    ).rejects.toThrow(/Wallet address does not match/);
  });

  it("context binding: rejects confirmTransaction if wallet or network does not match build intent", async () => {
    const checkRes = await checkService.executeCheck({
      network: "testnet",
      targetMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      fundingAsset: "USDC",
      amount: "10",
      maxPremiumPct: "5.00",
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      clientIntentVersion: "v1",
      scenarioId: "PASS_BASIC",
    });

    const buildResult = await buildService.buildTransaction({
      checkId: checkRes.checkId,
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      scenarioId: "PASS_BASIC",
    });

    if (buildResult.status !== "READY_FOR_WALLET") return;

    // Reject wallet mismatch on confirm
    await expect(
      confirmService.confirmTransaction({
        buildIntentId: buildResult.buildIntentId,
        signature: "5K7V4aQ8t9yU2xW3zR1mockSignatureContextBindingMismatch123456789",
        wallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", // Mismatch!
        network: "testnet",
      })
    ).rejects.toThrow(/Wallet address does not match/);

    // Reject network mismatch on confirm
    await expect(
      confirmService.confirmTransaction({
        buildIntentId: buildResult.buildIntentId,
        signature: "5K7V4aQ8t9yU2xW3zR1mockSignatureNetworkMismatch123456789",
        wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        network: "mainnet", // Mismatch!
      })
    ).rejects.toThrow(/Network mode does not match/);
  });

  it("build intent expiry: rejects confirmTransaction if build intent is expired", async () => {
    const checkRes = await checkService.executeCheck({
      network: "testnet",
      targetMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      fundingAsset: "USDC",
      amount: "10",
      maxPremiumPct: "5.00",
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      clientIntentVersion: "v1",
      scenarioId: "PASS_BASIC",
    });

    const buildResult = await buildService.buildTransaction({
      checkId: checkRes.checkId,
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      scenarioId: "PASS_BASIC",
    });

    if (buildResult.status !== "READY_FOR_WALLET") return;

    // Expire the build intent in both store and repo
    const { getRepository } = await import("../../server/database/db");
    const repo = getRepository();
    const storedIntent = ((await repo.getBuildIntent(buildResult.buildIntentId)) ?? activeBuildIntentsStore.get(buildResult.buildIntentId))!;
    storedIntent.expiresAt = new Date(Date.now() - 5000).toISOString();
    activeBuildIntentsStore.set(buildResult.buildIntentId, storedIntent);
    await repo.saveBuildIntent(storedIntent);

    await expect(
      confirmService.confirmTransaction({
        buildIntentId: buildResult.buildIntentId,
        signature: "5K7V4aQ8t9yU2xW3zR1mockSignatureBuildIntentExpired123456789",
        wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        network: "testnet",
      })
    ).rejects.toThrow(/expired/);
  });

  it("cross-build idempotency: rejects confirmation if signature belongs to a different build intent", async () => {
    // 1. Create first check and build
    const check1 = await checkService.executeCheck({
      network: "testnet",
      targetMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      fundingAsset: "USDC",
      amount: "10",
      maxPremiumPct: "5.00",
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      clientIntentVersion: "v1",
      scenarioId: "PASS_BASIC",
    });
    const build1 = await buildService.buildTransaction({
      checkId: check1.checkId,
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      scenarioId: "PASS_BASIC",
    });
    if (build1.status !== "READY_FOR_WALLET") return;

    // Confirm first build
    const sharedSig = "5SharedSignature11111111111111111111111111111111111111111111111111111111111111111";
    const res1 = await confirmService.confirmTransaction({
      buildIntentId: build1.buildIntentId,
      signature: sharedSig,
      network: "testnet",
    });
    expect(res1.status).toBe("CONFIRMED");

    // 2. Create second check and build for a different intent
    const check2 = await checkService.executeCheck({
      network: "testnet",
      targetMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      fundingAsset: "USDC",
      amount: "20",
      maxPremiumPct: "5.00",
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      clientIntentVersion: "v1",
      scenarioId: "PASS_BASIC",
    });
    const build2 = await buildService.buildTransaction({
      checkId: check2.checkId,
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      scenarioId: "PASS_BASIC",
    });
    if (build2.status !== "READY_FOR_WALLET") return;

    // Attempt to confirm build2 using build1's signature -> Must reject with IDEMPOTENCY_VIOLATION!
    await expect(
      confirmService.confirmTransaction({
        buildIntentId: build2.buildIntentId,
        signature: sharedSig,
        network: "testnet",
      })
    ).rejects.toThrow(/Signature belongs to a different trade receipt or build intent/);
  });

  it("mainnet confirmation: rejects signature-only confirmation without signedTransaction", async () => {
    const mainnetIntentId = "d3b07384-d113-40f4-a690-349f2b8478d1";
    activeBuildIntentsStore.set(mainnetIntentId, {
      id: mainnetIntentId,
      checkId: "check-123",
      network: "mainnet",
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      minimumAcceptableOutputRaw: 1000000n,
      protectionMethod: "JUPITER_SLIPPAGE_BPS_50",
      transactionBase64: "base64tx",
      lastValidBlockHeight: "426500000",
      requestId: "req-123",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      summary: {
        fundingAsset: "USDC",
        fundingAmount: "100",
        targetSymbol: "OPENAI",
        expectedTargetAmount: "1.0",
        referencePriceUsd: "100.00",
        currentBuyPriceUsd: "101.00",
        premiumPct: "1.00",
        maxPremiumPct: "5.00",
      },
    });

    await expect(
      confirmService.confirmTransaction({
        buildIntentId: mainnetIntentId,
        signature: "5MockMainnetSignature111111111111111111111111111111111111111111111111111111111",
        network: "mainnet",
      })
    ).rejects.toThrow(/Mainnet confirmation requires signedTransaction/);
  });

  it("build threshold verification: fails closed when otherAmountThreshold is missing or below minimum acceptable output", async () => {
    const mockJupiterAdapter = {
      getQuote: async () => ({
        quote: {
          inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          outputMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
          inAmount: "10000000",
          outAmount: "970000",
          inputRaw: 10000000n,
          outputRaw: 970000n,
          expectedTargetAmount: "0.97",
          priceImpactPct: "0.01",
          slippageBps: 50,
          otherAmountThreshold: "965150",
        },
        rawResponse: { inUsdValue: 10 },
      }),
      buildTransaction: async () => ({
        transactionBase64: "dGVzdA==",
        lastValidBlockHeight: "426500000",
        requestId: "req-1",
        otherAmountThreshold: undefined, // MISSING!
      }),
    } as any;

    const mockSolana = {
      resolveMintDecimals: async () => 6,
      resolveMintMetadata: async () => ({
        mint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
        decimals: 6,
        isToken2022: false,
        extensions: [],
        transferFeeBasisPoints: 0,
        maximumFee: 0n,
      }),
      checkBalance: async () => ({ hasSufficient: true }),
      confirmSignature: async () => ({ confirmed: true, err: null }),
    } as any;

    const mockDeterministicMarketService = {
      getMarketByMint: async () => ({
        name: "OpenAI",
        symbol: "OPENAI",
        mint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
        referencePriceUsd: "100.00",
        source: "PRESTOCKS",
        observedAt: new Date().toISOString(),
        network: "mainnet",
      }),
    } as any;

    const testCheckService = new PriceCheckService(
      mockDeterministicMarketService,
      mockJupiterAdapter,
      practiceAdapter,
      mockSolana
    );

    const testBuildService = new TransactionBuildService(
      mockDeterministicMarketService,
      mockJupiterAdapter,
      practiceAdapter,
      mockSolana
    );

    const checkRes = await testCheckService.executeCheck({
      network: "mainnet",
      targetMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      fundingAsset: "USDC",
      amount: "10",
      maxPremiumPct: "5.00",
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      clientIntentVersion: "v1",
    });

    // 1. Missing threshold -> ROUTE_RISK
    await expect(
      testBuildService.buildTransaction({
        checkId: checkRes.checkId,
        wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      })
    ).rejects.toThrow(/Final assembled Jupiter order does not expose a verifiable minimum-output protection threshold/);

    // 2. Threshold 1 unit below minimum acceptable output -> PRICE_MOVED_OUTSIDE_LIMIT
    mockJupiterAdapter.buildTransaction = async () => ({
      transactionBase64: "dGVzdA==",
      lastValidBlockHeight: "426500000",
      requestId: "req-1",
      otherAmountThreshold: "95238", // 1 unit below 95239
    });

    await expect(
      testBuildService.buildTransaction({
        checkId: checkRes.checkId,
        wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      })
    ).rejects.toThrow(/looser than Sieve price limit/);

    // 3. Threshold equal to minimum acceptable output -> PASS
    mockJupiterAdapter.buildTransaction = async () => ({
      transactionBase64: "dGVzdA==",
      lastValidBlockHeight: "426500000",
      requestId: "req-1",
      otherAmountThreshold: "95239", // Exactly equal
    });

    const passEqual = await testBuildService.buildTransaction({
      checkId: checkRes.checkId,
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    });
    expect(passEqual.status).toBe("READY_FOR_WALLET");

    // 4. Threshold above minimum acceptable output -> PASS
    mockJupiterAdapter.buildTransaction = async () => ({
      transactionBase64: "dGVzdA==",
      lastValidBlockHeight: "426500000",
      requestId: "req-1",
      otherAmountThreshold: "960000", // Strictly above
    });

    const passAbove = await testBuildService.buildTransaction({
      checkId: checkRes.checkId,
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    });
    expect(passAbove.status).toBe("READY_FOR_WALLET");
  });

  it("trade receipt: includes requestedFundingAmount, actualFundingAmount, and null signature on execution failure", async () => {
    // 1. Practice mode receipt has requested and actual amounts populated
    const checkRes = await checkService.executeCheck({
      network: "testnet",
      targetMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      fundingAsset: "USDC",
      amount: "10",
      maxPremiumPct: "5.00",
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      clientIntentVersion: "v1",
      scenarioId: "PASS_BASIC",
    });

    const buildResult = await buildService.buildTransaction({
      checkId: checkRes.checkId,
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      scenarioId: "PASS_BASIC",
    });
    if (buildResult.status !== "READY_FOR_WALLET") return;

    const confirmRes = await confirmService.confirmTransaction({
      buildIntentId: buildResult.buildIntentId,
      signature: "5PracticeSig111111111111111111111111111111111111111111111111111111111111111111",
      network: "testnet",
    });

    expect(confirmRes.receipt?.requestedFundingAmount).toBe("10");
    expect(confirmRes.receipt?.actualFundingAmount).toBe("10");
    expect(confirmRes.receipt?.internalExecutionId).toBeDefined();

    // 2. Mainnet execution failure: does not fabricate failed-xxxxxxxx signature
    const mockFailingJupiter = {
      executeTransaction: async () => ({
        status: "Failed",
        code: 6000,
        error: "Slippage tolerance exceeded on-chain",
        signature: null,
      }),
    } as any;

    const testConfirmService = new ConfirmationService(undefined, mockFailingJupiter);
    const mainnetIntentId = "e4c07384-d113-40f4-a690-349f2b8478d2";
    activeBuildIntentsStore.set(mainnetIntentId, {
      id: mainnetIntentId,
      checkId: checkRes.checkId,
      network: "mainnet",
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      minimumAcceptableOutputRaw: 1000000n,
      protectionMethod: "JUPITER_SLIPPAGE_BPS_50",
      transactionBase64: "base64tx",
      lastValidBlockHeight: "426500000",
      requestId: "req-fail-test",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      summary: {
        fundingAsset: "USDC",
        fundingAmount: "100",
        targetSymbol: "OPENAI",
        expectedTargetAmount: "1.0",
        referencePriceUsd: "100.00",
        currentBuyPriceUsd: "101.00",
        premiumPct: "1.00",
        maxPremiumPct: "5.00",
      },
    });

    const failedConfirm = await testConfirmService.confirmTransaction({
      buildIntentId: mainnetIntentId,
      signedTransaction: "signedTxBase64String==",
      network: "mainnet",
    });

    expect(failedConfirm.status).toBe("FAILED");
    expect(failedConfirm.signature).toBeNull();
    expect(failedConfirm.receipt?.signature).toBeNull();
    expect(failedConfirm.receipt?.internalExecutionId).toBeDefined();
    expect(failedConfirm.receipt?.failureCode).toContain("Slippage tolerance exceeded");
  });

  it("forces fresh PreStocks reference price at build time with bypassCache: true", async () => {
    let capturedOptions: any = null;
    const customMarketService = {
      getMarketByMint: async (mint: string, network: any, options?: any) => {
        capturedOptions = options;
        return {
          mint,
          name: "OpenAI",
          symbol: "OPENAI",
          referencePriceUsd: "100.00",
          source: "PRESTOCKS_API",
          observedAt: new Date().toISOString(),
          network: "mainnet",
        };
      },
    } as any;

    const mockJupiter = {
      getOrder: async () => ({
        inAmount: "10000000",
        outAmount: "99000",
        priceImpactPct: "-0.1",
        otherAmountThreshold: "98000",
        routeFingerprint: "fp",
      }),
      buildTransaction: async () => ({
        transactionBase64: "dGVzdA==",
        lastValidBlockHeight: "426500000",
        requestId: "req-1",
        otherAmountThreshold: "98000",
      }),
    } as any;

    const testBuildService = new TransactionBuildService(
      customMarketService,
      mockJupiter,
      practiceAdapter
    );

    const checkRes = await checkService.executeCheck({
      network: "testnet",
      targetMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      fundingAsset: "USDC",
      amount: "10",
      maxPremiumPct: "5.00",
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      clientIntentVersion: "v1",
      scenarioId: "PASS_BASIC",
    });

    await testBuildService.buildTransaction({
      checkId: checkRes.checkId,
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      scenarioId: "PASS_BASIC",
    });

    expect(capturedOptions).toEqual({ bypassCache: true });
  });
});
