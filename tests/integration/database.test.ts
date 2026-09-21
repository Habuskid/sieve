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
    network: "mainnet",
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
      source: "PRESTOCKS",
      observedAt: new Date().toISOString(),
      network: "mainnet",
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
      provider: "JUPITER",
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
    network: "mainnet",
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
    network: "mainnet",
    signature: "5K7V4aQ8t9yU2xW3zR1mockSignatureForTestingSolanaTransactions123456789",
    status: "CONFIRMED",
    fundingAsset: "USDC",
    fundingAmount: "10",
    requestedFundingAmount: "10",
    actualFundingAmount: "10",
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

  it("returns Mainnet history for the bound wallet", async () => {
    await repo.savePriceCheck(sampleCheck);
    await repo.saveTradeReceipt(sampleReceipt);

    const secondCheck: PriceCheck = {
      ...sampleCheck,
      id: "mainnet-check-1",
    };
    await repo.savePriceCheck(secondCheck);

    const mainnetHistory = await historyService.getUserHistory({
      wallet: sampleCheck.wallet!,
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
    });

    const blockedItem = history.find((h) => h.id === "blocked-check-1");
    expect(blockedItem).toBeDefined();
    expect(blockedItem?.type).toBe("CHECK_BLOCKED");
    expect(blockedItem?.signature).toBeUndefined(); // Never gets a fake signature!
  });

  it("exact BPS serialization: correctly converts premium percentages to exact basis points", async () => {
    const { toDecimal } = await import("../../core/money/decimal");
    const testCases = [
      { pct: "0.01", expectedBps: 1 },
      { pct: "2.87", expectedBps: 287 },
      { pct: "5.00", expectedBps: 500 },
      { pct: "12.34", expectedBps: 1234 },
    ];

    for (const { pct, expectedBps } of testCases) {
      const bps = toDecimal(pct).times(100).round().toNumber();
      expect(bps).toBe(expectedBps);
    }
  });

  it("rehydration integrity: PostgresSieveRepository fails closed if required build intent fields are missing", async () => {
    const { PostgresSieveRepository } = await import("../../server/database/db");
    
    // Mock sql tagged template function returning an incomplete row
    const mockSqlIncomplete = (async () => [
      {
        id: "incomplete-build-1",
        check_id: "check-1",
        network: "mainnet",
        wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        minimum_output_raw: "95238",
        protection_method: "JUPITER_SLIPPAGE_BPS_190",
        funding_asset: null, // MISSING!
        funding_amount_display: null, // MISSING!
        target_symbol: "OPENAI",
        expected_target_amount: "0.097087",
        max_premium_pct: "5.00",
        revalidation_reference_price_usd: "100.00",
        revalidation_buy_price_usd: "103.00",
        revalidation_premium_bps: 300,
        expires_at: new Date().toISOString(),
      },
    ]) as any;

    const pgRepo = new PostgresSieveRepository(mockSqlIncomplete);
    await expect(pgRepo.getBuildIntent("incomplete-build-1")).rejects.toThrow(
      /missing required lifecycle fields; database integrity check failed/
    );
  });

  it("fails closed when a historical non-Mainnet build is addressed by the runtime", async () => {
    const { PostgresSieveRepository } = await import("../../server/database/db");
    const mockSql = (async () => [{ id: "legacy-build", network: "testnet" }]) as any;
    await expect(new PostgresSieveRepository(mockSql).getBuildIntent("legacy-build")).rejects.toThrow(
      /Non-Mainnet build intent cannot be loaded/
    );
  });

  it("rejects trade receipt with IDEMPOTENCY_VIOLATION if same signature belongs to a different build intent", async () => {
    await repo.saveTradeReceipt(sampleReceipt);

    // Attempt to save receipt with same signature but different build intent
    const conflictingReceipt: TradeReceipt = {
      ...sampleReceipt,
      id: "receipt-uuid-2",
      buildIntentId: "different-build-intent-id",
    };

    await expect(repo.saveTradeReceipt(conflictingReceipt)).rejects.toThrow(
      /Signature belongs to a different trade receipt or build intent/
    );
  });

  it("preserves funding.method and quote.outputDecimals in PriceCheck rehydration", async () => {
    const { PostgresSieveRepository } = await import("../../server/database/db");

    let savedRow: any = null;
    const mockSql = ((strings: TemplateStringsArray, ...values: any[]) => {
      const query = strings.join(" ");
      if (query.includes("INSERT INTO price_checks")) {
        // Mock insert: capture inserted values
        savedRow = {
          id: values[0],
          network: values[1],
          wallet: values[2],
          target_name: values[3],
          target_symbol: values[4],
          target_mint: values[5],
          funding_asset: values[6],
          funding_mint: values[7],
          funding_amount_raw: values[8],
          funding_amount_display: values[9],
          funding_usd_value: values[10],
          reference_price_usd: values[11],
          reference_observed_at: new Date(values[12]),
          reference_source: values[13],
          quote_output_raw: values[14],
          quote_output_display: values[15],
          quote_observed_at: values[16] ? new Date(values[16]) : null,
          quote_expires_at: values[17] ? new Date(values[17]) : null,
          route_fingerprint: values[18],
          price_impact_pct: values[19],
          current_buy_price_usd: values[20],
          maximum_buy_price_usd: values[21],
          premium_bps: values[22],
          max_premium_bps: values[23],
          decision: values[24],
          reason_code: values[25],
          client_intent_version: values[26],
          created_at: new Date(values[27]),
          expires_at: values[28] ? new Date(values[28]) : null,
          funding_method: values[29],
          quote_output_decimals: values[30],
        };
        return Promise.resolve([]);
      }
      if (query.includes("SELECT * FROM price_checks WHERE id =")) {
        return Promise.resolve(savedRow ? [savedRow] : []);
      }
      return Promise.resolve([]);
    }) as any;

    const pgRepo = new PostgresSieveRepository(mockSql);

    // Check with 9 decimals and CURRENT_MARKET_ROUTE (e.g. SOL funding)
    const solCheck: PriceCheck = {
      ...sampleCheck,
      id: "sol-check-9-decimals",
      funding: {
        ...sampleCheck.funding,
        fundingAsset: "SOL",
        method: "CURRENT_MARKET_ROUTE",
      },
      quote: {
        ...sampleCheck.quote!,
        outputDecimals: 9,
      },
    };

    await pgRepo.savePriceCheck(solCheck);
    const rehydrated = await pgRepo.getPriceCheck("sol-check-9-decimals");

    expect(rehydrated).toBeDefined();
    expect(rehydrated?.funding.method).toBe("CURRENT_MARKET_ROUTE");
    expect(rehydrated?.quote?.outputDecimals).toBe(9);
  });

  it("rehydration integrity: fails closed if persisted price check is missing funding_method", async () => {
    const { PostgresSieveRepository } = await import("../../server/database/db");

    const mockSqlMissingFundingMethod = (async () => [
      {
        id: "check-missing-funding-method",
        network: "mainnet",
        wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        target_name: "OpenAI PreStocks",
        target_symbol: "OPENAI",
        target_mint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
        funding_asset: "USDC",
        funding_mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        funding_amount_raw: "10000000",
        funding_amount_display: "10",
        funding_usd_value: "10.00",
        funding_method: null, // MISSING!
        reference_price_usd: "100.00",
        reference_observed_at: new Date(),
        reference_source: "PRESTOCKS",
        quote_output_raw: "97087",
        quote_output_display: "0.097087",
        quote_output_decimals: 6,
        current_buy_price_usd: "103.00",
        maximum_buy_price_usd: "105.00",
        premium_bps: 300,
        max_premium_bps: 500,
        decision: "GOOD_TO_GO",
        client_intent_version: "v1",
        created_at: new Date(),
      },
    ]) as any;

    const pgRepo = new PostgresSieveRepository(mockSqlMissingFundingMethod);
    await expect(pgRepo.getPriceCheck("check-missing-funding-method")).rejects.toThrow(
      /Persisted price check is missing required funding_method/
    );
  });

  it("rehydration integrity: fails closed if persisted price check has quote output but is missing quote_output_decimals", async () => {
    const { PostgresSieveRepository } = await import("../../server/database/db");

    const mockSqlMissingDecimals = (async () => [
      {
        id: "check-missing-decimals",
        network: "mainnet",
        wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        target_name: "OpenAI PreStocks",
        target_symbol: "OPENAI",
        target_mint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
        funding_asset: "USDC",
        funding_mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        funding_amount_raw: "10000000",
        funding_amount_display: "10",
        funding_usd_value: "10.00",
        funding_method: "USDC_PAR",
        reference_price_usd: "100.00",
        reference_observed_at: new Date(),
        reference_source: "PRESTOCKS",
        quote_output_raw: "97087",
        quote_output_display: "0.097087",
        quote_output_decimals: null, // MISSING!
        current_buy_price_usd: "103.00",
        maximum_buy_price_usd: "105.00",
        premium_bps: 300,
        max_premium_bps: 500,
        decision: "GOOD_TO_GO",
        client_intent_version: "v1",
        created_at: new Date(),
      },
    ]) as any;

    const pgRepo = new PostgresSieveRepository(mockSqlMissingDecimals);
    await expect(pgRepo.getPriceCheck("check-missing-decimals")).rejects.toThrow(
      /missing required quote_output_decimals/
    );
  });

  it("PostgreSQL round-trip: preserves build intent and receipt economic conversion context (OpenAI-like multiplier 1.4861347, decimals 9)", async () => {
    const { PostgresSieveRepository } = await import("../../server/database/db");

    let savedBuildIntentRow: any = null;
    let savedReceiptRow: any = null;

    const mockSql = ((strings: TemplateStringsArray, ...values: any[]) => {
      const query = strings.join(" ");
      if (query.includes("INSERT INTO build_intents")) {
        savedBuildIntentRow = {
          id: values[0],
          check_id: values[1],
          wallet: values[2],
          network: values[3],
          revalidation_reference_price_usd: values[4],
          revalidation_buy_price_usd: values[5],
          revalidation_premium_bps: values[6],
          minimum_output_raw: values[7],
          protection_method: values[8],
          protection_value: null,
          provider_request_id: values[9],
          transaction_hash: null,
          last_valid_block_height: values[10],
          funding_asset: values[11],
          funding_amount_display: values[12],
          target_symbol: values[13],
          expected_target_amount: values[14],
          max_premium_pct: values[15],
          expires_at: values[16] ? new Date(values[16]) : new Date(),
          status: "READY_FOR_WALLET",
          created_at: new Date(),
          target_decimals: values[17],
          active_multiplier: values[18],
          chain_timestamp: values[19],
          epoch: values[20],
        };
        return Promise.resolve([]);
      }
      if (query.includes("SELECT * FROM build_intents WHERE id =")) {
        return Promise.resolve(savedBuildIntentRow ? [savedBuildIntentRow] : []);
      }
      if (query.includes("INSERT INTO trade_receipts")) {
        savedReceiptRow = {
          id: values[0],
          check_id: values[1],
          build_intent_id: values[2],
          wallet: values[3],
          network: values[4],
          signature: values[5],
          internal_execution_id: values[6],
          status: values[7],
          funding_asset: values[8],
          funding_amount_display: values[9],
          requested_funding_amount: values[10],
          actual_funding_amount: values[11],
          target_symbol: values[12],
          target_mint: values[13],
          expected_target_amount: values[14],
          realized_target_amount: values[15],
          reference_price_usd: values[16],
          checked_buy_price_usd: values[17],
          max_premium_bps: values[18],
          premium_bps: values[19],
          submitted_at: values[20] ? new Date(values[20]) : new Date(),
          confirmed_at: values[21] ? new Date(values[21]) : null,
          failure_code: values[22],
          created_at: new Date(),
          raw_wallet_output: values[23],
          target_decimals: values[24],
          active_multiplier: values[25],
          chain_timestamp: values[26],
          epoch: values[27],
        };
        return Promise.resolve([savedReceiptRow]);
      }
      if (query.includes("SELECT * FROM trade_receipts WHERE signature =")) {
        return Promise.resolve(savedReceiptRow ? [savedReceiptRow] : []);
      }
      return Promise.resolve([]);
    }) as any;

    const pgRepo = new PostgresSieveRepository(mockSql);

    // Build intent with OpenAI-like scaled UI parameters
    const openAiBuildIntent: BuildIntent = {
      ...sampleBuildIntent,
      id: "build-intent-openai",
      summary: {
        ...sampleBuildIntent.summary,
        targetSymbol: "OPENAI",
        targetDecimals: 9,
        activeMultiplier: "1.4861347",
        chainTimestamp: 1711000000,
        epoch: "600",
      },
    };

    await pgRepo.saveBuildIntent(openAiBuildIntent);
    const rehydratedIntent = await pgRepo.getBuildIntent("build-intent-openai");

    expect(rehydratedIntent).toBeDefined();
    expect(rehydratedIntent?.summary.targetDecimals).toBe(9);
    expect(rehydratedIntent?.summary.activeMultiplier).toBe("1.4861347");
    expect(rehydratedIntent?.summary.chainTimestamp).toBe(1711000000);
    expect(rehydratedIntent?.summary.epoch).toBe("600");

    // Trade receipt with OpenAI-like parameters
    const openAiReceipt: TradeReceipt = {
      ...sampleReceipt,
      id: "receipt-openai",
      signature: "5xyzOpenAiSignatureMainnet111111111111111111111",
      targetDecimals: 9,
      activeMultiplier: "1.4861347",
      chainTimestamp: 1711000000,
      epoch: "600",
      rawWalletOutput: "1486134700",
    };

    const savedReceipt = await pgRepo.saveTradeReceipt(openAiReceipt);
    expect(savedReceipt.targetDecimals).toBe(9);
    expect(savedReceipt.activeMultiplier).toBe("1.4861347");
    expect(savedReceipt.chainTimestamp).toBe(1711000000);
    expect(savedReceipt.epoch).toBe("600");
    expect(savedReceipt.rawWalletOutput).toBe("1486134700");

    const rehydratedReceipt = await pgRepo.getTradeReceiptBySignature(openAiReceipt.signature!);
    expect(rehydratedReceipt).toBeDefined();
    expect(rehydratedReceipt?.targetDecimals).toBe(9);
    expect(rehydratedReceipt?.activeMultiplier).toBe("1.4861347");
    expect(rehydratedReceipt?.chainTimestamp).toBe(1711000000);
    expect(rehydratedReceipt?.epoch).toBe("600");
    expect(rehydratedReceipt?.rawWalletOutput).toBe("1486134700");
  });

  it("rehydration integrity: fails closed if persisted build intent is missing target_decimals", async () => {
    const { PostgresSieveRepository } = await import("../../server/database/db");

    const mockSqlMissingTargetDecimals = (async () => [
      {
        id: "intent-missing-target-decimals",
        check_id: "check-uuid-1",
        wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        network: "mainnet",
        funding_asset: "USDC",
        funding_amount_display: "10",
        target_symbol: "OPENAI",
        expected_target_amount: "0.097087",
        max_premium_pct: "5.00",
        revalidation_reference_price_usd: "100.00",
        revalidation_buy_price_usd: "103.00",
        revalidation_premium_bps: 300,
        minimum_output_raw: "95238",
        protection_method: "JUPITER_SLIPPAGE_BPS_190",
        provider_request_id: "req-1",
        expires_at: new Date(),
        target_decimals: null, // MISSING!
        active_multiplier: "1.4861347",
      },
    ]) as any;

    const pgRepo = new PostgresSieveRepository(mockSqlMissingTargetDecimals);
    await expect(pgRepo.getBuildIntent("intent-missing-target-decimals")).rejects.toThrow(
      /Persisted build intent .* is missing required target_decimals/
    );
  });
});
