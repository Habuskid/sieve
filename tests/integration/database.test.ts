import { describe, it, expect, beforeEach } from "vitest";
import { InMemorySieveRepository } from "../../server/database/repository";
import { HistoryService } from "../../server/services/history-service";
import type { PriceCheck, BuildIntent, TradeReceipt } from "../../core/domain/types";

describe("Database & Persistence Layer (Phase 6)", () => {
  let repo: InMemorySieveRepository;
  let historyService: HistoryService;

  beforeEach(() => {
    repo = new InMemorySieveRepository();
    historyService = new HistoryService(repo);
  });

  const sampleCheck: PriceCheck = {
    id: "check-uuid-1",
    network: "testnet",
    wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    clientIntentVersion: "v1",
    asset: {
      name: "OpenAI PreStocks",
      symbol: "OPENAI",
      mint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      imageUrl: null,
      productUrl: null,
      referencePriceUsd: "100.00",
      tokenPriceUsd: "103.00",
      referenceValuationUsd: null,
      impliedValuationUsd: null,
      supply: null,
      source: "PRACTICE_FIXTURE",
      observedAt: new Date().toISOString(),
      network: "testnet",
    },
    funding: {
      fundingAsset: "USDC",
      inputRaw: 10_000_000n,
      inputDisplay: "10",
      inputUsdValue: "10.00",
      method: "USDC_PAR",
      observedAt: new Date().toISOString(),
    },
    quote: {
      provider: "PRACTICE_FIXTURE",
      inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      outputMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      inputRaw: 10_000_000n,
      outputRaw: 97_087n,
      outputDecimals: 6,
      expectedTargetAmount: "0.097087",
      priceImpactPct: "-0.50",
      observedAt: new Date().toISOString(),
      expiresAt: null,
      routeFingerprint: "fingerprint-1",
    },
    maxPremiumPct: "5.00",
    maxPremiumBps: 500,
    decision: {
      status: "GOOD_TO_GO",
      isExecutable: true,
      referencePriceUsd: "100.00",
      currentBuyPriceUsd: "103.00",
      maximumBuyPriceUsd: "105.00",
      premiumPct: "3.00",
      maxPremiumPct: "5.00",
      premiumBps: 300,
      maxPremiumBps: 500,
      differenceUsd: "3.00",
      displayTitle: "The price is inside your limit.",
      displayMessage: "You're paying about 3.00% above the reference price.",
    },
    createdAt: new Date(Date.now() - 10_000).toISOString(),
    expiresAt: new Date(Date.now() + 35_000).toISOString(),
  };

  const sampleBuildIntent: BuildIntent = {
    id: "build-intent-uuid-1",
    checkId: "check-uuid-1",
    network: "testnet",
    wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    minimumAcceptableOutputRaw: 95_238n,
    protectionMethod: "JUPITER_SLIPPAGE_BPS_190",
    transactionBase64: "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    summary: {
      fundingAsset: "USDC",
      fundingAmount: "10",
      targetSymbol: "OPENAI",
      expectedTargetAmount: "0.097087",
      referencePriceUsd: "100.00",
      currentBuyPriceUsd: "103.00",
      premiumPct: "3.00",
      maxPremiumPct: "5.00",
    },
  };

  const sampleReceipt: TradeReceipt = {
    id: "receipt-uuid-1",
    checkId: "check-uuid-1",
    buildIntentId: "build-intent-uuid-1",
    wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    network: "testnet",
    signature: "5K7V4aQ8t9yU2xW3zR1mockSignatureForTestingSolanaTransactions123456789",
    status: "CONFIRMED",
    fundingAsset: "USDC",
    fundingAmount: "10",
    targetSymbol: "OPENAI",
    targetMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
    expectedTargetAmount: "0.097087",
    realizedTargetAmount: "0.097087",
    referencePriceUsd: "100.00",
    checkedBuyPriceUsd: "103.00",
    maxPremiumBps: 500,
    premiumBps: 300,
    submittedAt: new Date(Date.now() - 5000).toISOString(),
    confirmedAt: new Date().toISOString(),
  };

  it("saves and retrieves immutable price checks", async () => {
    await repo.savePriceCheck(sampleCheck);
    const retrieved = await repo.getPriceCheck(sampleCheck.id);

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(sampleCheck.id);
    expect(retrieved?.decision.status).toBe("GOOD_TO_GO");
    expect(retrieved?.asset.symbol).toBe("OPENAI");
  });

  it("saves and retrieves build intents with complete summary preservation", async () => {
    await repo.saveBuildIntent(sampleBuildIntent);
    const retrieved = await repo.getBuildIntent(sampleBuildIntent.id);

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(sampleBuildIntent.id);
    expect(retrieved?.minimumAcceptableOutputRaw).toBe(95_238n);
    expect(retrieved?.summary.fundingAsset).toBe("USDC");
    expect(retrieved?.summary.fundingAmount).toBe("10");
    expect(retrieved?.summary.targetSymbol).toBe("OPENAI");
    expect(retrieved?.summary.expectedTargetAmount).toBe("0.097087");
    expect(retrieved?.summary.maxPremiumPct).toBe("5.00");
  });

  it("fails closed in production environment when DATABASE_URL is missing", async () => {
    const { getRepository, setRepository } = await import("../../server/database/db");
    const originalEnv = process.env.NODE_ENV;
    const originalDbUrl = process.env.DATABASE_URL;

    try {
      (process.env as any).NODE_ENV = "production";
      delete process.env.DATABASE_URL;
      // Reset repository singleton
      setRepository(null as any);

      expect(() => getRepository()).toThrow("DATABASE_URL must be configured in production environment");
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
      if (originalDbUrl) {
        process.env.DATABASE_URL = originalDbUrl;
      }
      setRepository(repo);
    }
  });

  it("saves and retrieves trade receipts idempotently by signature", async () => {
    const saved1 = await repo.saveTradeReceipt(sampleReceipt);
    expect(saved1.id).toBe(sampleReceipt.id);

    // Save duplicate with same signature
    const saved2 = await repo.saveTradeReceipt({
      ...sampleReceipt,
      id: "different-id-same-signature",
    });

    // Idempotent: must return original receipt ID
    expect(saved2.id).toBe(sampleReceipt.id);

    const list = await repo.listTradeReceipts({ wallet: sampleReceipt.wallet });
    expect(list).toHaveLength(1);
  });

  it("filters history by wallet and network mode", async () => {
    await repo.savePriceCheck(sampleCheck);
    await repo.saveTradeReceipt(sampleReceipt);

    // Add a check on mainnet
    const mainnetCheck: PriceCheck = {
      ...sampleCheck,
      id: "mainnet-check-1",
      network: "mainnet",
    };
    await repo.savePriceCheck(mainnetCheck);

    // Filter testnet
    const testnetHistory = await historyService.getUserHistory({
      wallet: sampleCheck.wallet!,
      network: "testnet",
    });
    expect(testnetHistory.every((h) => h.network === "testnet")).toBe(true);

    // Filter mainnet
    const mainnetHistory = await historyService.getUserHistory({
      wallet: sampleCheck.wallet!,
      network: "mainnet",
    });
    expect(mainnetHistory.every((h) => h.network === "mainnet")).toBe(true);
  });

  it("ensures blocked price checks persist without a fake transaction signature", async () => {
    const blockedCheck: PriceCheck = {
      ...sampleCheck,
      id: "blocked-check-1",
      decision: {
        ...sampleCheck.decision,
        status: "PRICE_TOO_HIGH",
        isExecutable: false,
      },
    };
    await repo.savePriceCheck(blockedCheck);

    const history = await historyService.getUserHistory({
      wallet: sampleCheck.wallet!,
      network: "testnet",
    });

    const blockedItem = history.find((h) => h.id === "blocked-check-1");
    expect(blockedItem).toBeDefined();
    expect(blockedItem?.type).toBe("CHECK_BLOCKED");
    expect(blockedItem?.signature).toBeUndefined(); // Never gets a fake signature!
  });
});
