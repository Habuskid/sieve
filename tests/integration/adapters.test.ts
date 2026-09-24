import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ExtensionType } from "@solana/spl-token";
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
    inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", outputMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
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
        outputMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
        amount: "10000000",
        outputDecimals: 6,
      })
    ).rejects.toThrow(/NO_ROUTE/);

    vi.unstubAllGlobals();
  });

  it("getSolUsdPrice: derives contemporaneous SOL/USD valuation from /order inUsdValue", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...validOrderResponse,
        inUsdValue: 150.25, inputMint: "So11111111111111111111111111111111111111112", outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", inAmount: "1000000000",
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = new JupiterAdapter({ apiBase: "https://mock.jup.ag" });
    const price = await adapter.getSolUsdPrice();
    expect(price.toNumber()).toBe(150.25);

    vi.unstubAllGlobals();
  });

  it("getSolUsdPrice: fails closed when contemporaneous inUsdValue is unavailable", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...validOrderResponse,
        inUsdValue: null, inputMint: "So11111111111111111111111111111111111111112", outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", inAmount: "1000000000",
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = new JupiterAdapter({ apiBase: "https://mock.jup.ag" });
    await expect(adapter.getSolUsdPrice()).rejects.toThrow(/unavailable/i);

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

  it("validates standard SPL Token mint via on-chain RPC", async () => {
    const { TOKEN_PROGRAM_ID } = await import("@solana/spl-token");
    const adapter = new SolanaAdapter();

    const data = Buffer.alloc(82);
    data[44] = 6; // decimals = 6
    data[45] = 1; // isInitialized = true

    (adapter as any).getConnection = () => ({
      getAccountInfo: async () => ({
        owner: TOKEN_PROGRAM_ID,
        data,
      }),
    });

    const meta = await adapter.resolveMintMetadata(CANONICAL_MINTS.mainnet.USDC, "mainnet");
    expect(meta.decimals).toBe(6);
    expect(meta.extensions).toEqual([]);
    expect(meta.supported).toBe(true);

    const decimals = await adapter.resolveMintDecimals(CANONICAL_MINTS.mainnet.USDC, "mainnet");
    expect(decimals).toBe(6);
  });

  it("validates Token-2022 mint and allows harmless extensions", async () => {
    const { TOKEN_2022_PROGRAM_ID } = await import("@solana/spl-token");
    const { Keypair } = await import("@solana/web3.js");
    const adapter = new SolanaAdapter();

    const data = Buffer.alloc(82);
    data[44] = 9; // decimals = 9
    data[45] = 1;

    (adapter as any).getConnection = () => ({
      getAccountInfo: async () => ({
        owner: TOKEN_2022_PROGRAM_ID,
        data,
      }),
    });

    const cleanMint = Keypair.generate().publicKey.toBase58();
    const meta = await adapter.resolveMintMetadata(cleanMint, "mainnet");
    expect(meta.decimals).toBe(9);
    expect(meta.supported).toBe(true);
  });

  it("fails closed on Token-2022 mint with custom TransferHook extension program", async () => {
    const { TOKEN_2022_PROGRAM_ID, ExtensionType } = await import("@solana/spl-token");
    const { Keypair } = await import("@solana/web3.js");
    const adapter = new SolanaAdapter();

    // Construct Token-2022 buffer with TransferHook TLV pointing to a custom program
    const hookProgram = Keypair.generate().publicKey;
    const tlvLen = 64;
    const data = Buffer.alloc(165 + 1 + 4 + tlvLen);
    data[44] = 6;
    data[45] = 1;
    data[165] = 1; // AccountType.Mint = 1
    data.writeUInt16LE(ExtensionType.TransferHook, 166);
    data.writeUInt16LE(tlvLen, 168);
    // authority (32 bytes at 170..202), programId (32 bytes at 202..234)
    hookProgram.toBuffer().copy(data, 202);

    (adapter as any).getConnection = () => ({
      getAccountInfo: async () => ({
        owner: TOKEN_2022_PROGRAM_ID,
        data,
      }),
    });

    const customHookMint = Keypair.generate().publicKey.toBase58();
    await expect(
      adapter.resolveMintMetadata(customHookMint, "mainnet")
    ).rejects.toThrow(/has custom TransferHook program/);
  });

  it("fails closed on Token-2022 mint with NonTransferable extension", async () => {
    const { TOKEN_2022_PROGRAM_ID, ExtensionType } = await import("@solana/spl-token");
    const { Keypair } = await import("@solana/web3.js");
    const adapter = new SolanaAdapter();

    const data = Buffer.alloc(165 + 1 + 4);
    data[44] = 6;
    data[45] = 1;
    data[165] = 1;
    data.writeUInt16LE(ExtensionType.NonTransferable, 166);
    data.writeUInt16LE(0, 168);

    (adapter as any).getConnection = () => ({
      getAccountInfo: async () => ({
        owner: TOKEN_2022_PROGRAM_ID,
        data,
      }),
    });

    const nonTransferableMint = Keypair.generate().publicKey.toBase58();
    await expect(
      adapter.resolveMintMetadata(nonTransferableMint, "mainnet")
    ).rejects.toThrow(/NonTransferable/);
  });

  it("fails closed if mint account is not owned by SPL Token or Token-2022", async () => {
    const { PublicKey, Keypair } = await import("@solana/web3.js");
    const adapter = new SolanaAdapter();

    (adapter as any).getConnection = () => ({
      getAccountInfo: async () => ({
        owner: PublicKey.default, // System program or rogue program
        data: Buffer.alloc(82),
      }),
    });

    const rogueMint = Keypair.generate().publicKey.toBase58();
    await expect(
      adapter.resolveMintMetadata(rogueMint, "mainnet")
    ).rejects.toThrow(/not owned by SPL Token or Token-2022/);
  });

  it("Defect 1: resolves fresh Token-2022 metadata when bypassCache: true, proving build uses fresh on-chain state", async () => {
    const { TOKEN_2022_PROGRAM_ID, ExtensionType } = await import("@solana/spl-token");
    const { Keypair } = await import("@solana/web3.js");
    const adapter = new SolanaAdapter();
    const mintPubkey = Keypair.generate().publicKey;
    const mintAddress = mintPubkey.toBase58();

    function createFeeBuffer(bps: number, maxFee: bigint) {
      const tlvLen = 108;
      const data = Buffer.alloc(165 + 1 + 4 + tlvLen);
      data[44] = 6;
      data[45] = 1;
      data[165] = 1;
      data.writeUInt16LE(ExtensionType.TransferFeeConfig, 166);
      data.writeUInt16LE(tlvLen, 168);
      const payloadOffset = 170;
      data.writeBigUInt64LE(0n, payloadOffset + 72);
      data.writeBigUInt64LE(maxFee, payloadOffset + 80);
      data.writeUInt16LE(bps, payloadOffset + 88);
      data.writeBigUInt64LE(1000n, payloadOffset + 90);
      data.writeBigUInt64LE(maxFee, payloadOffset + 98);
      data.writeUInt16LE(bps, payloadOffset + 106);
      return data;
    }

    let currentAccountData = createFeeBuffer(100, 1_000_000n);

    (adapter as any).getConnection = () => ({
      getAccountInfo: async () => ({
        owner: TOKEN_2022_PROGRAM_ID,
        data: currentAccountData,
      }),
      getEpochInfo: async () => ({ epoch: 50 }),
      getBlockTime: async () => 1711000000,
    });

    // 1. Initial resolution (populates cache with 100 bps)
    const initial = await adapter.resolveMintMetadata(mintAddress, "mainnet");
    expect(initial.transferFeeBasisPoints).toBe(100);

    // 2. On-chain state changes: fee increases to 500 bps
    currentAccountData = createFeeBuffer(500, 5_000_000n);

    // 3. Normal resolution without bypass returns cached 100 bps
    const cached = await adapter.resolveMintMetadata(mintAddress, "mainnet");
    expect(cached.transferFeeBasisPoints).toBe(100);

    // 4. Build-time resolution with bypassCache: true returns fresh 500 bps
    const fresh = await adapter.resolveMintMetadata(mintAddress, "mainnet", { bypassCache: true });
    expect(fresh.transferFeeBasisPoints).toBe(500);
  });

  describe("Defect 2: TransferFeeConfig epoch verification and fail-closed behavior", () => {
    function createFeeMintBuffer(params: {
      olderEpoch: bigint;
      olderMaxFee: bigint;
      olderBps: number;
      newerEpoch: bigint;
      newerMaxFee: bigint;
      newerBps: number;
    }) {
      const tlvLen = 108;
      const data = Buffer.alloc(165 + 1 + 4 + tlvLen);
      data[44] = 6;
      data[45] = 1;
      data[165] = 1;
      data.writeUInt16LE(1, 166); // ExtensionType.TransferFeeConfig
      data.writeUInt16LE(tlvLen, 168);
      const payloadOffset = 170;
      data.writeBigUInt64LE(params.olderEpoch, payloadOffset + 72);
      data.writeBigUInt64LE(params.olderMaxFee, payloadOffset + 80);
      data.writeUInt16LE(params.olderBps, payloadOffset + 88);
      data.writeBigUInt64LE(params.newerEpoch, payloadOffset + 90);
      data.writeBigUInt64LE(params.newerMaxFee, payloadOffset + 98);
      data.writeUInt16LE(params.newerBps, payloadOffset + 106);
      return data;
    }

    const scheduleData = createFeeMintBuffer({
      olderEpoch: 100n,
      olderMaxFee: 10_000_000n,
      olderBps: 50,
      newerEpoch: 200n,
      newerMaxFee: 1_000_000n,
      newerBps: 300,
    });

    it("uses older schedule when current epoch is before newer schedule epoch", async () => {
      const { TOKEN_2022_PROGRAM_ID } = await import("@solana/spl-token");
      const { Keypair } = await import("@solana/web3.js");
      const adapter = new SolanaAdapter();
      const mint = Keypair.generate().publicKey.toBase58();
      (adapter as any).getConnection = () => ({
        getAccountInfo: async () => ({ owner: TOKEN_2022_PROGRAM_ID, data: scheduleData }),
        getEpochInfo: async () => ({ epoch: 150 }),
        getBlockTime: async () => 1711000000,
      });

      const meta = await adapter.resolveMintMetadata(mint, "mainnet", { bypassCache: true });
      expect(meta.transferFeeBasisPoints).toBe(50);
      expect(meta.maximumFee).toBe(10_000_000n);
    });

    it("uses newer schedule when current epoch is after newer schedule epoch", async () => {
      const { TOKEN_2022_PROGRAM_ID } = await import("@solana/spl-token");
      const { Keypair } = await import("@solana/web3.js");
      const adapter = new SolanaAdapter();
      const mint = Keypair.generate().publicKey.toBase58();
      (adapter as any).getConnection = () => ({
        getAccountInfo: async () => ({ owner: TOKEN_2022_PROGRAM_ID, data: scheduleData }),
        getEpochInfo: async () => ({ epoch: 250 }),
        getBlockTime: async () => 1711000000,
      });

      const meta = await adapter.resolveMintMetadata(mint, "mainnet", { bypassCache: true });
      expect(meta.transferFeeBasisPoints).toBe(300);
      expect(meta.maximumFee).toBe(1_000_000n);
    });

    it("uses newer schedule at exact boundary when current epoch equals newer schedule epoch", async () => {
      const { TOKEN_2022_PROGRAM_ID } = await import("@solana/spl-token");
      const { Keypair } = await import("@solana/web3.js");
      const adapter = new SolanaAdapter();
      const mint = Keypair.generate().publicKey.toBase58();
      (adapter as any).getConnection = () => ({
        getAccountInfo: async () => ({ owner: TOKEN_2022_PROGRAM_ID, data: scheduleData }),
        getEpochInfo: async () => ({ epoch: 200 }),
        getBlockTime: async () => 1711000000,
      });

      const meta = await adapter.resolveMintMetadata(mint, "mainnet", { bypassCache: true });
      expect(meta.transferFeeBasisPoints).toBe(300);
      expect(meta.maximumFee).toBe(1_000_000n);
    });

    it("fails closed when getEpochInfo fails", async () => {
      const { TOKEN_2022_PROGRAM_ID } = await import("@solana/spl-token");
      const { Keypair } = await import("@solana/web3.js");
      const adapter = new SolanaAdapter();
      const mint = Keypair.generate().publicKey.toBase58();
      (adapter as any).getConnection = () => ({
        getAccountInfo: async () => ({ owner: TOKEN_2022_PROGRAM_ID, data: scheduleData }),
        getEpochInfo: async () => {
          throw new Error("Solana RPC getEpochInfo timed out");
        },
      });

      await expect(
        adapter.resolveMintMetadata(mint, "mainnet", { bypassCache: true })
      ).rejects.toThrow(/Failed to retrieve current Solana epoch for TransferFeeConfig verification/);
    });

    it("correctly handles older schedule with high max fee and lower BPS", async () => {
      const { TOKEN_2022_PROGRAM_ID } = await import("@solana/spl-token");
      const { Keypair } = await import("@solana/web3.js");
      const adapter = new SolanaAdapter();
      const mint = Keypair.generate().publicKey.toBase58();
      (adapter as any).getConnection = () => ({
        getAccountInfo: async () => ({ owner: TOKEN_2022_PROGRAM_ID, data: scheduleData }),
        getEpochInfo: async () => ({ epoch: 100 }),
        getBlockTime: async () => 1711000000,
      });

      const meta = await adapter.resolveMintMetadata(mint, "mainnet", { bypassCache: true });
      expect(meta.transferFeeBasisPoints).toBe(50);
      expect(meta.maximumFee).toBe(10_000_000n);
    });

    it("correctly handles newer schedule with high BPS and low max fee", async () => {
      const { TOKEN_2022_PROGRAM_ID } = await import("@solana/spl-token");
      const { Keypair } = await import("@solana/web3.js");
      const adapter = new SolanaAdapter();
      const mint = Keypair.generate().publicKey.toBase58();
      (adapter as any).getConnection = () => ({
        getAccountInfo: async () => ({ owner: TOKEN_2022_PROGRAM_ID, data: scheduleData }),
        getEpochInfo: async () => ({ epoch: 201 }),
        getBlockTime: async () => 1711000000,
      });

      const meta = await adapter.resolveMintMetadata(mint, "mainnet", { bypassCache: true });
      expect(meta.transferFeeBasisPoints).toBe(300);
      expect(meta.maximumFee).toBe(1_000_000n);
    });
  });

  describe("Defect 4: Explicit Token-2022 extension policy tests", () => {
    function createExtensionMintBuffer(extType: number, payloadLen: number = 0) {
      const data = Buffer.alloc(165 + 1 + 4 + payloadLen);
      data[44] = 6;
      data[45] = 1;
      data[165] = 1;
      data.writeUInt16LE(extType, 166);
      data.writeUInt16LE(payloadLen, 168);
      return data;
    }

    it.each([
      ["NonTransferable", ExtensionType.NonTransferable],
      ["InterestBearingConfig", ExtensionType.InterestBearingConfig],
      ["PermissionedBurn", ExtensionType.PermissionedBurn],
    ])("rejects blocked extension %s", async (name, extType) => {
      const { TOKEN_2022_PROGRAM_ID } = await import("@solana/spl-token");
      const { Keypair } = await import("@solana/web3.js");
      const adapter = new SolanaAdapter();
      const mint = Keypair.generate().publicKey.toBase58();
      const buffer = createExtensionMintBuffer(extType, 64);

      (adapter as any).getConnection = () => ({
        getAccountInfo: async () => ({
          owner: TOKEN_2022_PROGRAM_ID,
          data: buffer,
        }),
      });

      await expect(
        adapter.resolveMintMetadata(mint, "mainnet", { bypassCache: true })
      ).rejects.toThrow(/is blocked:.*fails closed/);
    });

    it("allows unpaused PausableConfig with disclosure warning, and blocks paused PausableConfig", async () => {
      const { TOKEN_2022_PROGRAM_ID, ExtensionType } = await import("@solana/spl-token");
      const { Keypair } = await import("@solana/web3.js");
      const adapter = new SolanaAdapter();

      // Unpaused mint
      const unpausedMint = Keypair.generate().publicKey.toBase58();
      const unpausedBuf = createExtensionMintBuffer(ExtensionType.PausableConfig, 33);
      unpausedBuf[165 + 1 + 4 + 32] = 0; // paused = false

      (adapter as any).getConnection = () => ({
        getAccountInfo: async () => ({
          owner: TOKEN_2022_PROGRAM_ID,
          data: unpausedBuf,
        }),
      });

      const unpausedMeta = await adapter.resolveMintMetadata(unpausedMint, "mainnet", { bypassCache: true });
      expect(unpausedMeta.supported).toBe(true);
      expect(unpausedMeta.issuerControls.pausable).toBe(true);
      expect(unpausedMeta.issuerControls.isPaused).toBe(false);
      expect(unpausedMeta.warnings).toContain("Issuer retains pause authority for this token.");

      // Paused mint
      const pausedMint = Keypair.generate().publicKey.toBase58();
      const pausedBuf = createExtensionMintBuffer(ExtensionType.PausableConfig, 33);
      pausedBuf[165 + 1 + 4 + 32] = 1; // paused = true

      (adapter as any).getConnection = () => ({
        getAccountInfo: async () => ({
          owner: TOKEN_2022_PROGRAM_ID,
          data: pausedBuf,
        }),
      });

      await expect(
        adapter.resolveMintMetadata(pausedMint, "mainnet", { bypassCache: true })
      ).rejects.toThrow(/Mint is currently paused/);
    });

    it("allows Initialized DefaultAccountState and blocks Frozen DefaultAccountState", async () => {
      const { TOKEN_2022_PROGRAM_ID, ExtensionType } = await import("@solana/spl-token");
      const { Keypair } = await import("@solana/web3.js");
      const adapter = new SolanaAdapter();

      // Initialized mint (state = 1)
      const initMint = Keypair.generate().publicKey.toBase58();
      const initBuf = createExtensionMintBuffer(ExtensionType.DefaultAccountState, 1);
      initBuf[165 + 1 + 4] = 1; // Initialized

      (adapter as any).getConnection = () => ({
        getAccountInfo: async () => ({
          owner: TOKEN_2022_PROGRAM_ID,
          data: initBuf,
        }),
      });

      const initMeta = await adapter.resolveMintMetadata(initMint, "mainnet", { bypassCache: true });
      expect(initMeta.supported).toBe(true);
      expect(initMeta.issuerControls.defaultAccountState).toBe("Initialized");

      // Frozen mint (state = 2)
      const frozenMint = Keypair.generate().publicKey.toBase58();
      const frozenBuf = createExtensionMintBuffer(ExtensionType.DefaultAccountState, 1);
      frozenBuf[165 + 1 + 4] = 2; // Frozen

      (adapter as any).getConnection = () => ({
        getAccountInfo: async () => ({
          owner: TOKEN_2022_PROGRAM_ID,
          data: frozenBuf,
        }),
      });

      await expect(
        adapter.resolveMintMetadata(frozenMint, "mainnet", { bypassCache: true })
      ).rejects.toThrow(/Default account state is Frozen/);
    });

    it("allows PermanentDelegate with disclosure warning", async () => {
      const { TOKEN_2022_PROGRAM_ID, ExtensionType } = await import("@solana/spl-token");
      const { Keypair } = await import("@solana/web3.js");
      const adapter = new SolanaAdapter();
      const mint = Keypair.generate().publicKey.toBase58();

      const buffer = createExtensionMintBuffer(ExtensionType.PermanentDelegate, 32);

      (adapter as any).getConnection = () => ({
        getAccountInfo: async () => ({
          owner: TOKEN_2022_PROGRAM_ID,
          data: buffer,
        }),
      });

      const meta = await adapter.resolveMintMetadata(mint, "mainnet", { bypassCache: true });
      expect(meta.supported).toBe(true);
      expect(meta.issuerControls.permanentDelegate).toBe(true);
      expect(meta.warnings).toContain("Issuer retains transfer/burn authority for this token.");
    });

    it("allows ScaledUiAmountConfig and correctly derives active multiplier", async () => {
      const { TOKEN_2022_PROGRAM_ID, ExtensionType } = await import("@solana/spl-token");
      const { Keypair } = await import("@solana/web3.js");
      const adapter = new SolanaAdapter();
      const mint = Keypair.generate().publicKey.toBase58();

      const buffer = createExtensionMintBuffer(ExtensionType.ScaledUiAmountConfig, 56);
      // Write multiplier = 1.4861347 at offset 32 (double)
      buffer.writeDoubleLE(1.4861347, 165 + 1 + 4 + 32);
      buffer.writeDoubleLE(1.4861347, 165 + 1 + 4 + 48);

      (adapter as any).getConnection = () => ({
        getAccountInfo: async () => ({
          owner: TOKEN_2022_PROGRAM_ID,
          data: buffer,
        }),
      });

      const meta = await adapter.resolveMintMetadata(mint, "mainnet", { bypassCache: true });
      expect(meta.supported).toBe(true);
      expect(meta.scaledUiAmount).not.toBeNull();
      expect(meta.scaledUiAmount?.activeMultiplier).toBe("1.4861347");
    });

    it("rejects custom TransferHook program", async () => {
      const { TOKEN_2022_PROGRAM_ID, ExtensionType } = await import("@solana/spl-token");
      const { Keypair } = await import("@solana/web3.js");
      const adapter = new SolanaAdapter();
      const mint = Keypair.generate().publicKey.toBase58();
      const customProgram = Keypair.generate().publicKey;

      const buffer = createExtensionMintBuffer(ExtensionType.TransferHook, 64);
      // Write authority (32 bytes) + programId (32 bytes)
      customProgram.toBuffer().copy(buffer, 165 + 1 + 4 + 32);

      (adapter as any).getConnection = () => ({
        getAccountInfo: async () => ({
          owner: TOKEN_2022_PROGRAM_ID,
          data: buffer,
        }),
      });

      await expect(
        adapter.resolveMintMetadata(mint, "mainnet", { bypassCache: true })
      ).rejects.toThrow(/custom TransferHook program/i);
    });

    it("rejects unknown or unclassified Token-2022 extension", async () => {
      const { TOKEN_2022_PROGRAM_ID } = await import("@solana/spl-token");
      const { Keypair } = await import("@solana/web3.js");
      const adapter = new SolanaAdapter();
      const mint = Keypair.generate().publicKey.toBase58();
      const unknownExtType = 999;
      const buffer = createExtensionMintBuffer(unknownExtType, 32);

      (adapter as any).getConnection = () => ({
        getAccountInfo: async () => ({
          owner: TOKEN_2022_PROGRAM_ID,
          data: buffer,
        }),
      });

      await expect(
        adapter.resolveMintMetadata(mint, "mainnet", { bypassCache: true })
      ).rejects.toThrow(/has unclassified or unsupported Token-2022 extension \(type 999\)/);
    });

    it("allows understood harmless extensions like MetadataPointer", async () => {
      const { TOKEN_2022_PROGRAM_ID, ExtensionType } = await import("@solana/spl-token");
      const { Keypair } = await import("@solana/web3.js");
      const adapter = new SolanaAdapter();
      const mint = Keypair.generate().publicKey.toBase58();

      const tlvLen = 64;
      const data = Buffer.alloc(165 + 1 + 4 + tlvLen);
      data[44] = 6;
      data[45] = 1;
      data[165] = 1;
      data.writeUInt16LE(ExtensionType.MetadataPointer, 166);
      data.writeUInt16LE(tlvLen, 168);

      (adapter as any).getConnection = () => ({
        getAccountInfo: async () => ({
          owner: TOKEN_2022_PROGRAM_ID,
          data,
        }),
      });

      const meta = await adapter.resolveMintMetadata(mint, "mainnet", { bypassCache: true });
      expect(meta.supported).toBe(true);
      expect(meta.extensions).toContain(ExtensionType.MetadataPointer);
    });
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
