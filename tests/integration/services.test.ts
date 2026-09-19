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
    expect(checkRes.price.referenceUsd).toBe("100.0000");
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
});
