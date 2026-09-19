import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PreStocksAdapter } from "../../server/prestocks/adapter";
import { JupiterAdapter } from "../../server/jupiter/adapter";
import { SolanaAdapter, CANONICAL_MINTS } from "../../server/solana/adapter";
import { RawPreStocksResponseSchema } from "../../server/prestocks/schema";
import { JupiterOrderResponseSchema } from "../../server/jupiter/schema";

describe("PreStocks Adapter Contracts", () => {
  const validPreStocksPayload = [
    {
      name: "OpenAI PreStocks",
      symbol: "OPENAI",
      description: "OpenAI pre-IPO token",
      image: "https://www.prestocks.com/logos/openai.png",
      external_url: "https://www.prestocks.com/openai",
      contract_address: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      markPrice: 987.88,
      tokenPrice: 1154.00,
      markValuation: 1223909652284,
      impliedValuation: 1429733010783,
      supply: 2826.46,
    },
    {
      name: "SpaceX PreStocks",
      symbol: "SPACEX",
      contract_address: "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh",
      markPrice: 152.75,
    },
  ];

  it("validates and normalizes valid PreStocks payloads", () => {
    const parseResult = RawPreStocksResponseSchema.safeParse(validPreStocksPayload);
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    expect(parseResult.data).toHaveLength(2);
    expect(parseResult.data[0].contract_address).toBe("PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");
    expect(parseResult.data[0].markPrice).toBe(987.88);
  });

  it("rejects malformed PreStocks payload (e.g. invalid mark price or short contract address)", () => {
    const invalidPayload = [
      {
        name: "Broken Token",
        symbol: "BROKEN",
        contract_address: "short", // Invalid length < 32
        markPrice: -10, // Invalid negative
      },
    ];

    const parseResult = RawPreStocksResponseSchema.safeParse(invalidPayload);
    expect(parseResult.success).toBe(false);
  });

  it("fetches and normalizes markets via mocked fetch", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => validPreStocksPayload,
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = new PreStocksAdapter({ apiUrl: "https://mock.prestocks.com/api" });
    const markets = await adapter.fetchMarkets(true);

    expect(markets).toHaveLength(2);
    expect(markets[0].name).toBe("OpenAI PreStocks");
    expect(markets[0].symbol).toBe("OPENAI");
    expect(markets[0].mint).toBe("PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");
    expect(markets[0].referencePriceUsd).toBe("987.88");
    expect(markets[0].source).toBe("PRESTOCKS");
    expect(markets[0].network).toBe("mainnet");

    vi.unstubAllGlobals();
  });
});

describe("Jupiter Adapter Contracts", () => {
  const validOrderResponse = {
    inAmount: "10000000",
    outAmount: "5798185",
    inUsdValue: 9.9975,
    outUsdValue: 9.8413,
    priceImpact: -1.56,
    otherAmountThreshold: "5508275",
    swapMode: "ExactIn",
    slippageBps: 500,
    requestId: "mock-request-id-123",
    router: "metis",
    transaction: "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    lastValidBlockHeight: "426535324",
  };

  it("validates Jupiter Swap V2 order response schema", () => {
    const parseResult = JupiterOrderResponseSchema.safeParse(validOrderResponse);
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    expect(parseResult.data.inAmount).toBe("10000000");
    expect(parseResult.data.outAmount).toBe("5798185");
    expect(parseResult.data.priceImpact).toBe(-1.56);
    expect(parseResult.data.transaction).toBe("AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  });

  it("normalizes quote via getQuote without taker", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...validOrderResponse,
        transaction: null,
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = new JupiterAdapter({ apiBase: "https://mock.jup.ag" });
    const result = await adapter.getQuote({
      inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      outputMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      amount: "10000000",
      outputDecimals: 6,
    });

    expect(result.quote.provider).toBe("JUPITER");
    expect(result.quote.inputRaw).toBe(10_000_000n);
    expect(result.quote.outputRaw).toBe(5_798_185n);
    expect(result.quote.expectedTargetAmount).toBe("5.798185");
    expect(result.quote.priceImpactPct).toBe("-1.56");

    vi.unstubAllGlobals();
  });

  it("handles NO_ROUTE error gracefully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error": "No routes found"}',
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = new JupiterAdapter({ apiBase: "https://mock.jup.ag" });
    await expect(
      adapter.getQuote({
        inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        outputMint: "InvalidMint111111111111111111111111111111",
        amount: "10000000",
        outputDecimals: 6,
      })
    ).rejects.toThrow(/NO_ROUTE/);

    vi.unstubAllGlobals();
  });
});

describe("Solana Adapter Contracts", () => {
  it("exposes canonical mint constants for Mainnet and Testnet", () => {
    expect(CANONICAL_MINTS.mainnet.USDC).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(CANONICAL_MINTS.mainnet.USDC_DECIMALS).toBe(6);
    expect(CANONICAL_MINTS.mainnet.WSOL).toBe("So11111111111111111111111111111111111111112");
    expect(CANONICAL_MINTS.mainnet.SOL_DECIMALS).toBe(9);
  });

  it("resolves known PreStocks mint decimals correctly without RPC call", async () => {
    const adapter = new SolanaAdapter();
    const openaiDecimals = await adapter.resolveMintDecimals(
      "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      "mainnet"
    );
    expect(openaiDecimals).toBe(6);

    const spacexDecimals = await adapter.resolveMintDecimals(
      "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh",
      "mainnet"
    );
    expect(spacexDecimals).toBe(6);
  });
});

describe("Security & Import Firewall Verification (NETWORKS_FIXTURES.md & SECURITY.md)", () => {
  it("verifies Mainnet adapter modules never import from lib/fixtures or server/practice", () => {
    const rootDir = path.resolve(__dirname, "../../");
    const mainnetAdapterFiles = [
      path.join(rootDir, "server", "prestocks", "adapter.ts"),
      path.join(rootDir, "server", "prestocks", "schema.ts"),
      path.join(rootDir, "server", "jupiter", "adapter.ts"),
      path.join(rootDir, "server", "jupiter", "schema.ts"),
      path.join(rootDir, "server", "solana", "adapter.ts"),
    ];

    for (const filePath of mainnetAdapterFiles) {
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf8");

      // Assert no imports from fixtures or practice
      expect(content).not.toMatch(/from\s+["'].*\/fixtures/);
      expect(content).not.toMatch(/from\s+["'].*\/practice/);
      expect(content).not.toMatch(/PRACTICE_FIXTURE/);
    }
  });

  it("verifies Core modules never import from server or React or fetch", () => {
    const coreDir = path.resolve(__dirname, "../../core");
    const coreFiles = fs.readdirSync(coreDir, { recursive: true }) as string[];

    for (const relPath of coreFiles) {
      if (!relPath.endsWith(".ts")) continue;
      const fullPath = path.join(coreDir, relPath);
      const content = fs.readFileSync(fullPath, "utf8");

      expect(content).not.toMatch(/from\s+["']react["']/);
      expect(content).not.toMatch(/from\s+["'].*\/server/);
      expect(content).not.toMatch(/fetch\s*\(/);
    }
  });
});
