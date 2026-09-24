// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { JupiterAdapter } from "../../server/jupiter/adapter";
import { JupiterOrderResponseSchema } from "../../server/jupiter/schema";
import { RawPreStocksResponseSchema } from "../../server/prestocks/schema";
import { SolanaAdapter } from "../../server/solana/adapter";
import { messageHash, verifySignedTransaction } from "../../server/security/transaction-binding";
import { premiumSchema, amountSchema, publicKeySchema, positiveRawSchema } from "../../server/security/validation";
import { createChallenge, finishChallenge, requireWallet, sessionWallet } from "../../server/security/wallet-auth";
import { limitRequest, readJson, publicError } from "../../server/security/http";
import { providerFetch } from "../../server/security/provider-fetch";
import { clearRateLimitBuckets, getClientIdentifier } from "../../server/middleware/rate-limit";
import { InMemorySieveRepository } from "../../server/database/repository";
import { ConfirmationService } from "../../server/services/confirmation-service";
import { GET as history } from "../../app/api/history/route";
import { POST as build } from "../../app/api/build/route";
import { calculateMinimumTargetTokensRaw, calculateMinimumSellProceedsRaw } from "../../core/protection/slippage";
import { rawToEconomicDisplay, toDecimal } from "../../core/money/decimal";
import { testTransaction, testWallet, authenticatedHeaders, signBytes } from "../helpers/security-fixtures";

const mint = "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF";
const usdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const params = { inputMint: usdc, outputMint: mint, amount: "1000000", outputDecimals: 6 };
const order = { ...params, inAmount: "1000000", outAmount: "10000", otherAmountThreshold: "9900", swapMode: "ExactIn", requestId: "test-order" };
beforeEach(() => { clearRateLimitBuckets(); authenticatedHeaders(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("provider intent and arithmetic validation", () => {
  it.each([
    ["input mint", { inputMint: mint }], ["output mint", { outputMint: usdc }],
    ["input amount", { inAmount: "2000000" }], ["swap mode", { swapMode: "ExactOut" }],
    ["threshold greater than output", { otherAmountThreshold: "10001" }],
    ["negative amount", { outAmount: "-1" }], ["overflow", { outAmount: "18446744073709551616" }],
    ["nonfinite valuation", { inUsdValue: Infinity }], ["negative fee", { rentFeeLamports: -1 }],
  ])("rejects manipulated Jupiter %s", async (_name, change) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...order, ...change }) }));
    await expect(new JupiterAdapter().getQuote(params)).rejects.toThrow();
  });
  it("accepts an exactly matched quote", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => order }));
    expect((await new JupiterAdapter().getQuote(params)).quote.inputRaw).toBe(1000000n);
  });
  it.each(["-1", "0", "1e99", "1.5", "18446744073709551616"])("rejects invalid raw amount %s", (value) => expect(positiveRawSchema.safeParse(value).success).toBe(false));
  it.each(["0", "-0", "1e9999", "1".repeat(10000), "0.0000000000000000001"])("bounds display input %s", (value) => expect(amountSchema.safeParse(value).success).toBe(false));
  it("rejects sub-BPS policy instead of loosening it at persistence", () => {
    expect(premiumSchema.safeParse("5.005").success).toBe(false);
    expect(premiumSchema.safeParse("5.01").success).toBe(true);
  });
  it("rejects malformed wallet", () => expect(publicKeySchema.safeParse("0".repeat(44)).success).toBe(false));
  it("rejects duplicate and malformed PreStocks identity", () => {
    const asset = { name: "OPENAI", symbol: "OPENAI", contract_address: mint, markPrice: 100 };
    expect(RawPreStocksResponseSchema.safeParse([asset, asset]).success).toBe(false);
    expect(RawPreStocksResponseSchema.safeParse([{ ...asset, contract_address: "0".repeat(44) }]).success).toBe(false);
    for (const markPrice of [0, -1, NaN, Infinity]) expect(RawPreStocksResponseSchema.safeParse([{ ...asset, markPrice }]).success).toBe(false);
  });
  it("rejects unsafe scaled product and incorrect decimals", () => {
    expect(() => rawToEconomicDisplay(9007199254740991n, 6, "2")).toThrow();
    expect(() => rawToEconomicDisplay(1n, 255, "1")).toThrow();
    expect(() => toDecimal(new (toDecimal("1").constructor as any)(Infinity))).toThrow();
  });
  it.each(["1", "1.4861347", "0.75"])("ceil minimum preserves equality and adjacent raw-unit BUY boundary with multiplier %s", (multiplier) => {
    const minimum = calculateMinimumTargetTokensRaw("1", "100", 9, multiplier);
    expect(rawToEconomicDisplay(minimum, 9, multiplier).gte("0.01")).toBe(true);
    expect(rawToEconomicDisplay(minimum - 1n, 9, multiplier).lt("0.01")).toBe(true);
    expect(rawToEconomicDisplay(minimum + 1n, 9, multiplier).gte("0.01")).toBe(true);
  });
  it("ceil SELL proceeds never weakens the floor by one raw unit", () => {
    const raw = calculateMinimumSellProceedsRaw("0.333333333", "95", 6);
    const required = toDecimal("0.333333333").mul(95).mul(1000000);
    expect(toDecimal(raw.toString()).gte(required)).toBe(true);
    expect(toDecimal((raw - 1n).toString()).lt(required)).toBe(true);
  });
});

describe("signed message binding", () => {
  it("accepts only valid signatures over the persisted exact message", () => {
    const tx = testTransaction();
    expect(verifySignedTransaction({ signedTransaction: tx.signed, wallet: testWallet, transactionMessageHash: tx.hash })).toBe(tx.signature);
  });
  it.each(["amount", "destination", "wallet", "signature", "unsigned", "missing hash"])("rejects changed %s before submission", (change) => {
    const tx = testTransaction();
    const input = { signedTransaction: tx.signed, wallet: testWallet, transactionMessageHash: tx.hash, signature: tx.signature };
    if (change === "amount") input.signedTransaction = testTransaction(testWallet, 2).signed;
    if (change === "destination") input.signedTransaction = testTransaction(testWallet, 1, mint).signed;
    if (change === "wallet") input.wallet = PublicKey.default.toBase58();
    if (change === "signature") input.signature = "wrong";
    if (change === "unsigned") input.signedTransaction = tx.unsigned;
    if (change === "missing hash") input.transactionMessageHash = "";
    expect(() => verifySignedTransaction(input)).toThrow();
  });
  it("does not claim message hashing proves swap semantics", () => {
    // This is deliberately a System transfer, demonstrating unresolved S-01.
    // Semantic router verification must be added before Mainnet release.
    expect(messageHash(testTransaction().unsigned)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("authentication, access and API abuse", () => {
  it("authenticates a wallet proof and rejects cross-wallet access", () => {
    const req = new Request("http://localhost:3000", { headers: authenticatedHeaders() });
    expect(sessionWallet(req)).toBe(testWallet);
    expect(() => requireWallet(req, mint)).toThrow();
  });
  it("rejects forged and expired challenge proofs", () => {
    const challenge = createChallenge(testWallet);
    const request = new Request("http://localhost:3000", { headers: { cookie: challenge.cookie.split(";")[0] } });
    expect(() => finishChallenge(request, testWallet, Buffer.alloc(64).toString("base64"))).toThrow();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 301000);
    expect(() => finishChallenge(request, testWallet, Buffer.from(signBytes(Buffer.from(challenge.message))).toString("base64"))).toThrow();
  });
  it("rejects unauthorized history and cross-wallet history", async () => {
    const url = `http://localhost:3000/api/history?wallet=${mint}`;
    expect((await history(new NextRequest(url))).status).toBe(401);
    expect((await history(new NextRequest(url, { headers: authenticatedHeaders() }))).status).toBe(401);
  });
  it.each(["amount", "targetMint", "maxPremiumPct", "network"])("rejects build parameter override %s", async (field) => {
    const request = new Request("http://localhost:3000/api/build", { method: "POST", headers: authenticatedHeaders(), body: JSON.stringify({ checkId: "11111111-1111-4111-8111-111111111111", wallet: testWallet, [field]: "evil" }) });
    expect((await build(request)).status).toBe(400);
  });
  it("rejects unlimited history windows and duplicate parameters", async () => {
    for (const suffix of ["&limit=99999999", "&offset=-1", `&wallet=${mint}`]) expect((await history(new NextRequest(`http://localhost:3000/api/history?wallet=${testWallet}${suffix}`, { headers: authenticatedHeaders() }))).status).toBe(400);
  });
  it("wallet rotation and spoofed forwarding headers do not reset quotas", () => {
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
    for (let i = 0; i < 6; i++) limitRequest(new Request("http://localhost:3000", { headers: { "x-forwarded-for": `10.0.0.${i}` } }), "capacity", 6);
    expect(() => limitRequest(new Request("http://localhost:3000", { headers: { "x-forwarded-for": "8.8.8.8" } }), "capacity", 6)).toThrow();
    expect(getClientIdentifier(new Request("http://localhost:3000"), testWallet)).toBe(getClientIdentifier(new Request("http://localhost:3000"), mint));
  });
  it("rejects oversized or malformed JSON without trusting Content-Length", async () => {
    for (const body of ["{", JSON.stringify({ amount: "1".repeat(9000) })]) await expect(readJson(new Request("http://localhost:3000", { method: "POST", headers: { "Content-Type": "application/json" }, body }))).rejects.toThrow();
  });
  it("redacts unexpected exception messages", async () => expect(JSON.stringify(await publicError(new Error("postgres://secret:password@internal")).json())).not.toContain("password"));
});

describe("chain evidence, replay and timeouts", () => {
  function harness(chain: { confirmed: boolean; failed: boolean; inputRaw: string | null; outputRaw: string | null }, status = "Success") {
    const tx = testTransaction();
    const repo = new InMemorySieveRepository();
    const intent: any = { id: "build", checkId: "check", wallet: testWallet, network: "mainnet", transactionBase64: tx.unsigned, transactionMessageHash: tx.hash, requestId: "order", expiresAt: new Date(Date.now() + 60000).toISOString(), minimumAcceptableOutputRaw: 10n, summary: { fundingAsset: "USDC", fundingAmount: "1", targetSymbol: "OPENAI", targetDecimals: 6, expectedTargetAmount: "0.00001", referencePriceUsd: "100", currentBuyPriceUsd: "100", premiumPct: "0", maxPremiumPct: "5", premiumBps: 0 } };
    const jupiter = { executeTransaction: vi.fn().mockResolvedValue({ status, signature: tx.signature, totalInputAmount: "99999999", totalOutputAmount: "999999999" }) } as any;
    const solana = { verifyExecution: vi.fn().mockResolvedValue(chain), resolveMintMetadata: async () => ({ scaledUiAmount: null }) } as any;
    const service = new ConfirmationService(solana, jupiter, repo);
    return { tx, repo, intent, jupiter, service, async prepare() { await repo.savePriceCheck({ id: "check", asset: { mint }, funding: { fundingAsset: "USDC", inputRaw: 1000000n }, maxPremiumBps: 500 } as any); await repo.saveBuildIntent(intent); }, input: { buildIntentId: "build", signedTransaction: tx.signed, wallet: testWallet } };
  }
  it("provider Success cannot mark a failed chain transaction confirmed", async () => {
    const h = harness({ confirmed: false, failed: true, inputRaw: null, outputRaw: null }); await h.prepare();
    expect((await h.service.confirmTransaction(h.input)).status).toBe("FAILED");
  });
  it("unknown landing remains pending with no fabricated receipt", async () => {
    const h = harness({ confirmed: false, failed: false, inputRaw: null, outputRaw: null }); await h.prepare();
    expect((await h.service.confirmTransaction(h.input)).status).toBe("PENDING");
    expect(await h.repo.listTradeReceipts()).toHaveLength(0);
  });
  it("confirmed amounts come from chain; duplicate confirmations return one receipt", async () => {
    const h = harness({ confirmed: true, failed: false, inputRaw: "1000000", outputRaw: "10" }); await h.prepare();
    const results = await Promise.all([h.service.confirmTransaction({ ...h.input }), h.service.confirmTransaction({ ...h.input })]);
    expect(results[0].receipt?.realizedTargetAmount).toBe("0.00001");
    expect(results[0].receiptId).toBe(results[1].receiptId);
    expect(await h.repo.listTradeReceipts()).toHaveLength(1);
  });
  it.each([true, false])("reconciles execution timeout without inventing failure (landed=%s)", async (landed) => {
    const h = harness({ confirmed: landed, failed: false, inputRaw: landed ? "1000000" : null, outputRaw: landed ? "10" : null });
    await h.prepare();
    h.jupiter.executeTransaction.mockRejectedValue(new Error("Provider timeout after submission"));
    expect((await h.service.confirmTransaction(h.input)).status).toBe(landed ? "CONFIRMED" : "PENDING");
    expect(await h.repo.listTradeReceipts()).toHaveLength(landed ? 1 : 0);
  });
  it("rejects wrong provider signature even for claimed Success", async () => {
    const h = harness({ confirmed: true, failed: false, inputRaw: "1000000", outputRaw: "10" }); await h.prepare();
    h.jupiter.executeTransaction.mockResolvedValue({ status: "Success", signature: "wrong" });
    await expect(h.service.confirmTransaction(h.input)).rejects.toThrow();
  });
  it("rejects concurrent duplicate builds before releasing a second intent", async () => {
    const h = harness({ confirmed: false, failed: false, inputRaw: null, outputRaw: null });
    const results = await Promise.allSettled([h.repo.saveBuildIntent(h.intent), h.repo.saveBuildIntent({ ...h.intent, id: "second" })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("provider timeout and body size fail closed", async () => {
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    await expect(providerFetch("https://api.jup.ag", {}, 5)).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(20))));
    await expect(providerFetch("https://api.jup.ag", {}, 100, 10)).rejects.toThrow(/large/);
  });
  it("wrong RPC genesis fails before accepting balances", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: "devnet" }))));
    const adapter = new SolanaAdapter("https://rpc.example.com");
    await expect(adapter.getConnection().getBalance(new PublicKey(testWallet))).rejects.toThrow(/Mainnet/);
  });
  it("accepts the full Mainnet genesis hash, not the truncated CAIP identifier", async () => {
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const request = JSON.parse(init.body as string);
      const result = request.method === "getGenesisHash" ? "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" : { context: { slot: 100 }, value: 123 };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
    });
    expect(await new SolanaAdapter("https://rpc.example.com").getConnection().getBalance(new PublicKey(testWallet))).toBe(123);
  });
  it("RPC errors cannot become a confirmed result", async () => {
    const adapter = new SolanaAdapter();
    vi.spyOn(adapter, "getConnection").mockReturnValue({ getTransaction: async () => { throw new Error("RPC timeout"); } } as any);
    await expect(adapter.verifyExecution(testTransaction().signature, testTransaction().hash, testWallet, usdc, mint)).rejects.toThrow(/timeout/);
  });
});
