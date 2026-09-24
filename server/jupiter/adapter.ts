import { positiveRawSchema, publicKeySchema } from "../security/validation";
import { buildVerifiedSwap } from "./verified-build";
import { defaultSolanaAdapter } from "../solana/adapter";
import type { Connection } from "@solana/web3.js";
import { decodeTransaction, messageHash } from "../security/transaction-binding";
import { providerFetch } from "../security/provider-fetch";
import {
  JupiterOrderResponseSchema,
  type JupiterOrderResponse,
  type JupiterExecuteResponse,
} from "./schema";
import { rawToDisplay, toDecimal, Decimal } from "../../core/money/decimal";
import type { MarketQuote } from "../../core/domain/types";
import { SieveAppError } from "../services/errors";

export interface JupiterAdapterConfig {
  apiBase?: string;
  apiKey?: string;
  timeoutMs?: number;
  connection?: Connection;
}

export interface JupiterQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: string | bigint;
  outputDecimals: number;
  slippageBps?: number;
}

export interface JupiterBuildParams extends JupiterQuoteParams {
  taker: string;
  slippageBps: number;
  minimumNetOutputRaw?: bigint;
  side?: "BUY" | "SELL";
}

export interface JupiterExecuteParams {
  signedTransaction: string;
  requestId: string;
  lastValidBlockHeight?: string;
}

export class JupiterAdapter {
  private apiBase: string;
  private apiKey?: string;
  private timeoutMs: number;
  private connection?: Connection;

  constructor(config: JupiterAdapterConfig = {}) {
    this.apiBase = config.apiBase || process.env.JUPITER_API_BASE || "https://api.jup.ag";
    this.apiKey = config.apiKey || process.env.JUPITER_API_KEY;
    this.timeoutMs = config.timeoutMs ?? 10000;
    this.connection = config.connection;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "Sieve-App/1.0",
    };
    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }
    return headers;
  }

  /**
   * Fetches a live quote from Jupiter Swap V2 without taker parameter.
   */
  async getQuote(params: JupiterQuoteParams): Promise<{
    quote: MarketQuote;
    rawResponse: JupiterOrderResponse;
    inUsdValue?: number | null;
    outUsdValue?: number | null;
  }> {
    positiveRawSchema.parse(params.amount.toString());
    publicKeySchema.parse(params.inputMint);
    publicKeySchema.parse(params.outputMint);
    const amountStr = typeof params.amount === "bigint" ? params.amount.toString() : params.amount;
    const url = new URL(`${this.apiBase}/swap/v2/order`);
    url.searchParams.set("inputMint", params.inputMint);
    url.searchParams.set("outputMint", params.outputMint);
    url.searchParams.set("amount", amountStr);
    if (params.slippageBps !== undefined) {
      url.searchParams.set("slippageBps", params.slippageBps.toString());
    }

    const response = await this.fetchWithTimeout(url.toString(), {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      if (response.status === 400 && (errorText.includes("No routes found") || errorText.includes("NO_ROUTE") || errorText.includes("no route"))) {
        throw new SieveAppError("NO_ROUTE", `NO_ROUTE: No routes found between ${params.inputMint} and ${params.outputMint}`);
      }
      if (response.status === 429) {
        throw new SieveAppError("RATE_LIMITED", "Please wait a moment before trying again.");
      }
      if (response.status === 504 || response.status === 502) {
        throw new SieveAppError("SOURCE_TIMEOUT", "The market is taking too long to respond.");
      }
      if (response.status === 400 || response.status === 404) {
        throw new SieveAppError("NO_ROUTE", "No executable Jupiter route is available for this market right now. Try another funding asset or market.");
      }
      throw new SieveAppError("DATA_UNAVAILABLE", "Market quote is temporarily unavailable.");
    }

    const json = await response.json();
    const parseResult = JupiterOrderResponseSchema.safeParse(json);
    if (!parseResult.success) throw new SieveAppError("DATA_UNAVAILABLE", "Market quote is temporarily unavailable.");

    const data = parseResult.data;
    if (data.error || data.errorMessage) {
      const errStr = (data.errorMessage || data.error || "").toLowerCase();
      if (errStr.includes("no route") || errStr.includes("not found")) {
        throw new SieveAppError("NO_ROUTE", "No executable Jupiter route is available for this market right now. Try another funding asset or market.");
      }
      throw new SieveAppError("ROUTE_RISK", "A market route exists, but it is not currently supported by Sieve's verified execution path.");
    }
    try {
      this.validateOrder(data, params);
    } catch {
      throw new SieveAppError("ROUTE_RISK", "A market route exists, but it is not currently supported by Sieve's verified execution path.");
    }

    const observedAt = new Date().toISOString();
    const outputRaw = BigInt(data.outAmount);
    const expectedTargetAmount = rawToDisplay(outputRaw, params.outputDecimals).toString();
    const priceImpactPct = data.priceImpact != null ? data.priceImpact.toString() : null;

    const quote: MarketQuote = {
      provider: "JUPITER",
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      inputRaw: BigInt(data.inAmount),
      outputRaw,
      outputDecimals: params.outputDecimals,
      expectedTargetAmount,
      priceImpactPct,
      observedAt,
      expiresAt: null,
      routeFingerprint: data.requestId,
      providerPayloadRef: data.requestId,
    };

    return {
      quote,
      rawResponse: data,
      inUsdValue: data.inUsdValue,
      outUsdValue: data.outUsdValue,
    };
  }

  /**
   * Constructs an unsigned transaction via Jupiter Swap V2 by providing the taker public key and derived slippage.
   */
  async buildTransaction(params: JupiterBuildParams): Promise<{
    transactionBase64: string;
    requestId: string;
    lastValidBlockHeight?: string;
    otherAmountThreshold?: string;
    signatureFeeLamports?: number | null;
    signatureFeePayer?: string | null;
    prioritizationFeeLamports?: number | null;
    prioritizationFeePayer?: string | null;
    rentFeeLamports?: number | null;
    rentFeePayer?: string | null;
    gasless?: boolean | null;
    feeMint?: string | null;
    feeBps?: number | null;
    platformFee?: { feeMint?: string; feeBps?: number; amount?: string } | null;
    quote: MarketQuote;
    rawResponse: JupiterOrderResponse;
    verification?: Awaited<ReturnType<typeof buildVerifiedSwap>>["verification"];
  }> {
    return buildVerifiedSwap(params, this.apiBase,
      (url) => this.fetchWithTimeout(url, { method: "GET", headers: this.getHeaders() }),
      this.connection ?? defaultSolanaAdapter.getConnection());
  }

  /**
   * Executes a signed order transaction using Jupiter's managed landing infrastructure.
   */
  async executeTransaction(params: JupiterExecuteParams): Promise<JupiterExecuteResponse> {
    // /build transactions use self-managed RPC submission, not /order execute.
    // Old opaque orders cannot enter this execution path after migration.
    if (params.requestId !== `sieve-rpc:${messageHash(params.signedTransaction)}` || !params.lastValidBlockHeight) throw new Error("Unverified execution transport");
    const rpc = this.connection ?? defaultSolanaAdapter.getConnection();
    const tx = decodeTransaction(params.signedTransaction);
    const [height, valid] = await Promise.all([rpc.getBlockHeight("confirmed"), rpc.isBlockhashValid(tx.message.recentBlockhash, { commitment: "confirmed" })]);
    if (!valid.value || BigInt(height) >= BigInt(params.lastValidBlockHeight)) throw new Error("Transaction blockhash expired");
    const signature = await rpc.sendRawTransaction(Buffer.from(params.signedTransaction, "base64"), { skipPreflight: false, maxRetries: 2 });
    // Submitted is not confirmed. Confirmation services independently verify chain.
    return { status: "Submitted", signature };
  }

  /**
   * Derives contemporaneous SOL/USD valuation by querying Jupiter for SOL -> USDC quote
   * and using the authoritative input USD valuation (inUsdValue).
   * Fails closed if inUsdValue is unavailable to prevent fees/slippage from understating funding value.
   */
  async getSolUsdPrice(): Promise<Decimal> {
    const quote = await this.getQuote({
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amount: 1_000_000_000n, // 1 SOL (9 decimals)
      outputDecimals: 6, // USDC 6 decimals
    });

    if (quote.inUsdValue != null && quote.inUsdValue > 0) {
      return toDecimal(quote.inUsdValue);
    }

    throw new Error(
      "Contemporaneous SOL input USD valuation (inUsdValue) is unavailable from Jupiter; failing closed to prevent understating funding value"
    );
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await providerFetch(url, {
        ...init,
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      }, this.timeoutMs);
    } catch (err) {
      if (err instanceof SieveAppError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new SieveAppError("SOURCE_TIMEOUT", "The market is taking too long to respond.");
      }
      throw new SieveAppError("DATA_UNAVAILABLE", "Market quote is temporarily unavailable.");
    } finally {
      clearTimeout(timeoutId);
    }
  }
  private validateOrder(data: JupiterOrderResponse, params: JupiterQuoteParams): void {
    if (data.inputMint !== params.inputMint || data.outputMint !== params.outputMint ||
        data.inAmount !== params.amount.toString() || data.swapMode !== "ExactIn" ||
        data.error || data.errorMessage || data.errorCode != null ||
        (data.otherAmountThreshold != null && BigInt(data.otherAmountThreshold) > BigInt(data.outAmount)) ||
        (data.platformFee?.feeMint && data.feeMint && data.platformFee.feeMint !== data.feeMint)) {
      throw new Error("Jupiter order does not match requested intent");
    }
  }
}

export const defaultJupiterAdapter = new JupiterAdapter();
