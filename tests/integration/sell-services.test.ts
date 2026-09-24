// @vitest-environment node
import { testTransaction, testWallet } from "../helpers/security-fixtures";
import { messageHash } from "../../server/security/transaction-binding";
import { beforeEach, describe, expect, it } from "vitest";
import { deriveSellInputConversion, economicSellAmountToRaw, rawToEconomicDisplay } from "../../core";
import type { SellBuildIntent } from "../../core";
import { InMemorySieveRepository } from "../../server/database/repository";
import { guaranteedWalletUsdcOutput } from "../../server/jupiter/sell-output-accounting";
import { SellCheckService } from "../../server/services/sell-check-service";
import { SellBuildService } from "../../server/services/sell-build-service";
import { SellConfirmationService } from "../../server/services/sell-confirmation-service";

const wallet = testWallet;
const otherWallet = "22222222222222222222222222222222";
const mint = "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF";
const usdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function makeHarness(initialOutputRaw = 97_000_000n, threshold: string | undefined = "95000000") {
  const repo = new InMemorySieveRepository();
  let outputRaw = initialOutputRaw;
  let finalThreshold: string | undefined = threshold;
  let supported = true;
  const asset = {
    name: "OpenAI PreStocks", symbol: "OPENAI", mint, imageUrl: null, productUrl: null,
    referencePriceUsd: "100", tokenPriceUsd: null, referenceValuationUsd: null,
    impliedValuationUsd: null, supply: null, source: "PRESTOCKS" as const,
    observedAt: new Date().toISOString(), network: "mainnet" as const,
  };
  const markets = { getMarketByMint: async () => ({ ...asset, observedAt: new Date().toISOString() }) } as any;
  const metadata = () => ({
    mint, supported, blockers: supported ? [] : ["unsupported extension"], warnings: [], decimals: 9,
    programOwner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", extensions: [],
    transferFee: null, olderTransferFee: null, newerTransferFee: null, scaledUiAmount: null,
    issuerControls: { permanentDelegate: false, pausable: false, isPaused: false, defaultAccountState: "Initialized" },
    transferHook: null, validatedAt: Date.now(), chainTimestamp: 1_700_000_000, epoch: 1n,
    transferFeeBasisPoints: 0, maximumFee: 0n,
  });
  const quote = () => ({
    provider: "JUPITER" as const, inputMint: mint, outputMint: usdc, inputRaw: 1_000_000_000n,
    outputRaw, outputDecimals: 6, expectedTargetAmount: (Number(outputRaw) / 1_000_000).toString(),
    priceImpactPct: "0.1", observedAt: new Date().toISOString(), expiresAt: null,
    routeFingerprint: `sell-fixture-${outputRaw}`,
  });
  const rawResponse = () => ({ inputMint: mint, outputMint: usdc, inAmount: "1000000000", outAmount: outputRaw.toString(), requestId: "quote", platformFee: null });
  const jupiter = {
    getQuote: async () => ({ quote: quote(), rawResponse: rawResponse() }),
    buildTransaction: async () => ({ transactionBase64: testTransaction().unsigned, requestId: "sell-request", lastValidBlockHeight: "123", otherAmountThreshold: finalThreshold, quote: quote(), rawResponse: rawResponse(), platformFee: null }),
    executeTransaction: async () => ({ status: "Success", signature: testTransaction().signature, totalInputAmount: "1000000000", inputAmountResult: "1000000000", totalOutputAmount: outputRaw.toString() }),
  } as any;
  const solana = { verifyExecution: async () => ({ confirmed: true, failed: false, inputRaw: "1000000000", outputRaw: outputRaw.toString() }), resolveMintMetadata: async () => metadata(), checkTokenBalance: async () => ({ hasSufficient: true }) } as any;
  const checker = new SellCheckService(markets, jupiter, solana, repo);
  const builder = new SellBuildService(markets, jupiter, solana, checker, repo);
  const confirmer = new SellConfirmationService(jupiter, repo, solana);
  return {
    repo, checker, builder, confirmer,
    setOutputRaw(value: bigint) { outputRaw = value; },
    setThreshold(value: string | undefined) { finalThreshold = value; },
    setSupported(value: boolean) { supported = value; },
  };
}

const checkInput = { targetMint: mint, amount: "1", maxDiscountPct: "5", wallet, clientIntentVersion: "v1" };

describe("Mainnet-only Sell lifecycle with isolated fixtures", () => {
  let harness: ReturnType<typeof makeHarness>;
  beforeEach(() => { harness = makeHarness(); });

  it("passes a Sell check inside the floor", async () => {
    expect((await harness.checker.executeCheck(checkInput)).decision).toBe("GOOD_TO_GO");
  });

  it("blocks below the minimum Sell price", async () => {
    expect((await makeHarness(94_000_000n).checker.executeCheck(checkInput)).decision).toBe("PRICE_TOO_LOW");
  });

  it("passes the exact Sell boundary", async () => {
    const result = await makeHarness(95_000_000n).checker.executeCheck(checkInput);
    expect(result.decision).toBe("GOOD_TO_GO");
    expect(result.price.currentSellUsd).toBe("95");
  });

  it("blocks at build when a passing quote moves below the floor", async () => {
    const check = await harness.checker.executeCheck(checkInput);
    harness.setOutputRaw(90_000_000n);
    await expect(harness.builder.buildTransaction({ checkId: check.checkId, wallet })).resolves.toMatchObject({ status: "BLOCKED", reason: "PRICE_MOVED" });
  });

  it("ignores forged client pricing fields", async () => {
    const check = await harness.checker.executeCheck(checkInput);
    harness.setOutputRaw(90_000_000n);
    const result = await harness.builder.buildTransaction({ checkId: check.checkId, wallet, currentSellPrice: "999" } as any);
    expect(result.status).toBe("BLOCKED");
  });

  it("binds Sell checks to the original wallet", async () => {
    const check = await harness.checker.executeCheck(checkInput);
    await expect(harness.builder.buildTransaction({ checkId: check.checkId, wallet: otherWallet })).rejects.toMatchObject({ details: { code: "WALLET_MISMATCH" } });
  });

  it("rejects expired Sell checks", async () => {
    const check = await harness.checker.executeCheck(checkInput);
    const stored = await harness.repo.getSellPriceCheck(check.checkId);
    stored!.expiresAt = new Date(0).toISOString();
    await expect(harness.builder.buildTransaction({ checkId: check.checkId, wallet })).rejects.toMatchObject({ details: { code: "TRANSACTION_EXPIRED" } });
  });

  it("fails closed when final otherAmountThreshold is missing", async () => {
    const check = await harness.checker.executeCheck(checkInput);
    harness.setThreshold(undefined);
    await expect(harness.builder.buildTransaction({ checkId: check.checkId, wallet })).rejects.toMatchObject({ details: { code: "ROUTE_RISK" } });
  });

  it("fails closed when Jupiter final threshold is below the Sieve minimum", async () => {
    const check = await harness.checker.executeCheck(checkInput);
    harness.setThreshold("94000000");
    await expect(harness.builder.buildTransaction({ checkId: check.checkId, wallet })).rejects.toMatchObject({ details: { code: "PRICE_MOVED_OUTSIDE_LIMIT" } });
  });

  it("fails closed for unsupported Token-2022 extensions", async () => {
    harness.setSupported(false);
    await expect(harness.checker.executeCheck(checkInput)).rejects.toMatchObject({ details: { code: "ROUTE_RISK" } });
  });

  it("confirms a SELL receipt and is idempotent", async () => {
    const check = await harness.checker.executeCheck(checkInput);
    const build = await harness.builder.buildTransaction({ checkId: check.checkId, wallet });
    if (build.status !== "READY_FOR_WALLET") throw new Error("expected ready build");
    const first = await harness.confirmer.confirm({ buildIntentId: build.buildIntentId, signedTransaction: testTransaction().signed, wallet });
    const second = await harness.confirmer.confirm({ buildIntentId: build.buildIntentId, signedTransaction: testTransaction().signed, signature: first.signature!, wallet });
    expect(first.receipt!.side).toBe("SELL");
    expect(first.receipt!.network).toBe("mainnet");
    expect(second.receiptId).toBe(first.receiptId);
  });

  it("binds SELL build to SNAPSHOT_BOUND_V1 execution snapshot with <= 30s signing expiry", async () => {
    const check = await harness.checker.executeCheck(checkInput);
    const build = await harness.builder.buildTransaction({ checkId: check.checkId, wallet });
    if (build.status !== "READY_FOR_WALLET") throw new Error("expected ready build");
    const snapshot = build.summary.executionSnapshot;
    expect(snapshot).toBeDefined();
    expect(snapshot?.semantics).toBe("SNAPSHOT_BOUND_V1");
    expect(snapshot?.side).toBe("SELL");
    expect(snapshot?.wallet).toBe(wallet);
    expect(snapshot?.checkId).toBe(check.checkId);
    expect(snapshot?.clientIntentVersion).toBe("v1");
    expect(snapshot?.inputMint).toBe(mint);
    expect(snapshot?.outputMint).toBe(usdc);
    expect(snapshot?.transactionMessageHash).toBe(messageHash(build.serializedTransaction));
    expect(snapshot?.signingExpiresAt).toBe(build.expiresAt);
    expect(Date.parse(build.expiresAt)).toBeLessThanOrEqual(Date.now() + 30_000);
    expect(build.summary.minimumAcceptableUsdc).toBeDefined();
  });
});

describe("Sell Token-2022 input conversion", () => {
  it("chooses a ScaledUi raw amount that never exceeds economic intent", () => {
    const raw = economicSellAmountToRaw("1", 9, "1.4861347");
    expect(rawToEconomicDisplay(raw, 9, "1.4861347").lessThanOrEqualTo(1)).toBe(true);
    expect(rawToEconomicDisplay(raw + 1n, 9, "1.4861347").greaterThan(1)).toBe(true);
  });

  it("separates wallet debit, withheld transfer fee, and route input", () => {
    const conversion = deriveSellInputConversion({ requestedEconomicAmount: "1", decimals: 6, activeMultiplier: "1", transferFee: { basisPoints: 50, maximumFee: 10_000n, epoch: 1n } });
    expect(conversion.rawWalletInput).toBe(1_000_000n);
    expect(conversion.rawTransferFee).toBe(5_000n);
    expect(conversion.rawRouteInput).toBe(995_000n);
  });
});

describe("Sell Jupiter wallet-output accounting", () => {
  const base = { rawAmount: 95_000_000n, field: "otherAmountThreshold" as const, outputMint: usdc, expectedUsdcMint: usdc };
  it("uses the threshold unchanged with no fee", () => expect(guaranteedWalletUsdcOutput(base)).toBe(95_000_000n));
  it("uses it unchanged for an input-mint fee", () => expect(guaranteedWalletUsdcOutput({ ...base, feeMint: mint, platformFeeAmount: "1000" })).toBe(95_000_000n));
  it("does not double-subtract an output-mint fee", () => expect(guaranteedWalletUsdcOutput({ ...base, feeMint: usdc, platformFeeAmount: "1000" })).toBe(95_000_000n));
});

describe("Sell Mainnet execution reconciliation", () => {
  function buildIntent(): SellBuildIntent {
    return { id: "11111111-1111-4111-8111-111111111111", checkId: "22222222-2222-4222-8222-222222222222", network: "mainnet", wallet, transactionBase64: testTransaction().unsigned, transactionMessageHash: testTransaction().hash, requestId: "request", minimumUsdcOutputRaw: 95_000_000n, expiresAt: new Date(Date.now() + 60_000).toISOString(), summary: { side: "SELL", targetSymbol: "OPENAI", targetMint: mint, requestedEconomicAmount: "1", actualEconomicAmount: "999", rawWalletInput: "500000", rawTransferFee: "5000", rawRouteInput: "495000", expectedUsdcProceeds: "95", referencePriceUsd: "100", currentSellPriceUsd: "95", minimumSellPriceUsd: "95", maxDiscountPct: "5", discountBps: 500, inputDecimals: 6, activeMultiplier: "2" } };
  }

  it("derives actual economic input from verified chain wallet debit", async () => {
    const repo = new InMemorySieveRepository();
    await repo.saveSellBuildIntent(buildIntent());
    const jupiter = { executeTransaction: async () => ({ status: "Success", signature: testTransaction().signature, totalInputAmount: "500000", inputAmountResult: "495000", totalOutputAmount: "95000000" }) } as any;
    const result = await new SellConfirmationService(jupiter, repo, { verifyExecution: async () => ({ confirmed: true, failed: false, inputRaw: "500000", outputRaw: "95000000" }) } as any).confirm({ buildIntentId: buildIntent().id, signedTransaction: testTransaction().signed, wallet });
    expect(result.receipt!.rawInput).toBe("500000");
    expect(result.receipt!.actualEconomicInput).toBe("1");
    expect(result.receipt!.realizedDiscountBps).toBe(500);
  });

  it("fails closed when exact-input execution debits a different amount", async () => {
    const repo = new InMemorySieveRepository();
    await repo.saveSellBuildIntent(buildIntent());
    const jupiter = { executeTransaction: async () => ({ status: "Success", signature: testTransaction().signature, totalInputAmount: "499999", inputAmountResult: "494999", totalOutputAmount: "95000000" }) } as any;
    await expect(new SellConfirmationService(jupiter, repo, { verifyExecution: async () => ({ confirmed: true, failed: false, inputRaw: "499999", outputRaw: "95000000" }) } as any).confirm({ buildIntentId: buildIntent().id, signedTransaction: testTransaction().signed, wallet })).rejects.toMatchObject({ details: { code: "CONFIRMATION_FAILED" } });
  });
});
