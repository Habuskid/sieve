import { beforeEach, describe, expect, it } from "vitest";
import { InMemorySieveRepository } from "../../server/database/repository";
import { PriceCheckService } from "../../server/services/check-service";
import { TransactionBuildService } from "../../server/services/build-service";
import { ConfirmationService } from "../../server/services/confirmation-service";

const wallet = "11111111111111111111111111111111";
const otherWallet = "22222222222222222222222222222222";
const mint = "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF";
const usdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function makeHarness(initialOutputRaw = 970_000n) {
  const repo = new InMemorySieveRepository();
  let outputRaw = initialOutputRaw;
  let finalThreshold = 960_000n;
  const asset = {
    name: "OpenAI PreStocks", symbol: "OPENAI", mint, imageUrl: null, productUrl: null,
    referencePriceUsd: "100", tokenPriceUsd: null, referenceValuationUsd: null,
    impliedValuationUsd: null, supply: null, source: "PRESTOCKS" as const,
    observedAt: new Date().toISOString(), network: "mainnet" as const,
  };
  const markets = { getMarketByMint: async () => ({ ...asset, observedAt: new Date().toISOString() }) } as any;
  const metadata = {
    mint, programOwner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", decimals: 6,
    extensions: [], supported: true, validatedAt: Date.now(), chainTimestamp: 1_700_000_000,
    epoch: 600n, transferFee: null, olderTransferFee: null, newerTransferFee: null,
    scaledUiAmount: null, issuerControls: { permanentDelegate: false, pausable: false, isPaused: false, defaultAccountState: "Initialized" },
    transferHook: null, blockers: [], warnings: [], transferFeeBasisPoints: 0, maximumFee: 0n,
  };
  const quote = () => ({
    provider: "JUPITER" as const, inputMint: usdc, outputMint: mint, inputRaw: 100_000_000n,
    outputRaw, outputDecimals: 6, expectedTargetAmount: (Number(outputRaw) / 1_000_000).toString(),
    priceImpactPct: "0.1", observedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(), routeFingerprint: `fixture-${outputRaw}`,
  });
  const jupiter = {
    getQuote: async () => ({ quote: quote(), rawResponse: { inUsdValue: 100 } }),
    getSolUsdPrice: async () => "150",
    buildTransaction: async () => ({ transactionBase64: "AA==", requestId: "fixture-request", lastValidBlockHeight: "123", otherAmountThreshold: finalThreshold.toString(), quote: quote() }),
    executeTransaction: async () => ({ status: "Success", signature: "fixture-mainnet-signature-111111111111111111111111", totalInputAmount: "100000000", totalOutputAmount: outputRaw.toString() }),
  } as any;
  const solana = {
    resolveMintMetadata: async () => metadata,
    checkBalance: async () => ({ hasSufficient: true }),
    checkDestinationAccount: async () => ({ exists: true, isFrozen: false, address: wallet }),
  } as any;
  const checker = new PriceCheckService(markets, jupiter, solana, repo);
  const builder = new TransactionBuildService(markets, jupiter, solana, repo);
  const confirmer = new ConfirmationService(solana, jupiter, repo);
  return { checker, builder, confirmer, setOutputRaw(value: bigint) { outputRaw = value; }, setFinalThreshold(value: bigint) { finalThreshold = value; } };
}

const checkInput = { targetMint: mint, fundingAsset: "USDC" as const, amount: "100", maxPremiumPct: "5", wallet, clientIntentVersion: "v1" };

describe("Mainnet-only Buy lifecycle with isolated fixtures", () => {
  let harness: ReturnType<typeof makeHarness>;
  beforeEach(() => { harness = makeHarness(); });

  it("passes a Buy check inside the maximum price", async () => {
    expect((await harness.checker.executeCheck(checkInput)).decision).toBe("GOOD_TO_GO");
  });

  it("blocks a Buy check above the maximum price", async () => {
    expect((await makeHarness(900_000n).checker.executeCheck(checkInput)).decision).toBe("PRICE_TOO_HIGH");
  });

  it("blocks at build when a previously passing quote moves outside the limit", async () => {
    const check = await harness.checker.executeCheck(checkInput);
    harness.setOutputRaw(900_000n);
    await expect(harness.builder.buildTransaction({ checkId: check.checkId, wallet })).resolves.toMatchObject({ status: "BLOCKED", reason: "PRICE_MOVED" });
  });

  it("binds a Buy check to its wallet", async () => {
    const check = await harness.checker.executeCheck(checkInput);
    await expect(harness.builder.buildTransaction({ checkId: check.checkId, wallet: otherWallet })).rejects.toMatchObject({ details: { code: "WALLET_MISMATCH" } });
  });

  it("fails closed when Jupiter final output is below the Sieve minimum", async () => {
    const check = await harness.checker.executeCheck(checkInput);
    harness.setFinalThreshold(900_000n);
    await expect(harness.builder.buildTransaction({ checkId: check.checkId, wallet })).rejects.toMatchObject({ details: { code: "PRICE_MOVED_OUTSIDE_LIMIT" } });
  });

  it("requires a signed Mainnet transaction", async () => {
    const check = await harness.checker.executeCheck(checkInput);
    const build = await harness.builder.buildTransaction({ checkId: check.checkId, wallet });
    if (build.status !== "READY_FOR_WALLET") throw new Error("expected ready build");
    await expect(harness.confirmer.confirmTransaction({ buildIntentId: build.buildIntentId, wallet })).rejects.toMatchObject({ details: { code: "VALIDATION_ERROR" } });
  });

  it("confirms and persists a real-result-shaped receipt idempotently", async () => {
    const check = await harness.checker.executeCheck(checkInput);
    const build = await harness.builder.buildTransaction({ checkId: check.checkId, wallet });
    if (build.status !== "READY_FOR_WALLET") throw new Error("expected ready build");
    const first = await harness.confirmer.confirmTransaction({ buildIntentId: build.buildIntentId, signedTransaction: "signed-fixture", wallet });
    const second = await harness.confirmer.confirmTransaction({ buildIntentId: build.buildIntentId, signedTransaction: "signed-fixture", signature: first.signature!, wallet });
    expect(first.status).toBe("CONFIRMED");
    expect(first.receipt?.network).toBe("mainnet");
    expect(second.receiptId).toBe(first.receiptId);
  });
});
