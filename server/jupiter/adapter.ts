import {
  JupiterOrderResponseSchema,
  JupiterExecuteResponseSchema,
  type JupiterOrderResponse,
  type JupiterExecuteResponse,
} from "./schema";
import { rawToDisplay, toDecimal, Decimal } from "../../core/money/decimal";
import type { MarketQuote } from "../../core/domain/types";

export interface JupiterAdapterConfig {
  apiBase?: string;
  apiKey?: string;
  timeoutMs?: number;
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

  constructor(config: JupiterAdapterConfig = {}) {
    this.apiBase = config.apiBase || process.env.JUPITER_API_BASE || "https://api.jup.ag";
    this.apiKey = config.apiKey || process.env.JUPITER_API_KEY;
    this.timeoutMs = config.timeoutMs ?? 10000;
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
      if (response.status === 400 && errorText.includes("No routes found")) {
        throw new Error(`NO_ROUTE: No routes found between ${params.inputMint} and ${params.outputMint}`);
      }
      if (response.status === 429) {
        throw new Error(`RATE_LIMIT: Jupiter API rate limit reached`);
      }
      throw new Error(`Jupiter /order quote error (${response.status}): ${errorText}`);
    }

    const json = await response.json();
    const parseResult = JupiterOrderResponseSchema.safeParse(json);
    if (!parseResult.success) {
      throw new Error(`Jupiter /order response schema mismatch: ${parseResult.error.message}`);
    }

    const data = parseResult.data;
    if (data.error || data.errorMessage) {
      throw new Error(`Jupiter quote error: ${data.errorMessage || data.error}`);
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
    quote: MarketQuote;
    rawResponse: JupiterOrderResponse;
  }> {
    const amountStr = typeof params.amount === "bigint" ? params.amount.toString() : params.amount;
    const url = new URL(`${this.apiBase}/swap/v2/order`);
    url.searchParams.set("inputMint", params.inputMint);
    url.searchParams.set("outputMint", params.outputMint);
    url.searchParams.set("amount", amountStr);
    url.searchParams.set("taker", params.taker);
    url.searchParams.set("slippageBps", params.slippageBps.toString());

    const response = await this.fetchWithTimeout(url.toString(), {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Jupiter /order build error (${response.status}): ${errorText}`);
    }

    const json = await response.json();
    const parseResult = JupiterOrderResponseSchema.safeParse(json);
    if (!parseResult.success) {
      throw new Error(`Jupiter /order build schema mismatch: ${parseResult.error.message}`);
    }

    const data = parseResult.data;
    if (!data.transaction) {
      const errCode = data.errorCode ? ` (code: ${data.errorCode})` : "";
      throw new Error(`Jupiter failed to assemble transaction${errCode}: ${data.errorMessage || data.error || "Empty transaction"}`);
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
      transactionBase64: data.transaction,
      requestId: data.requestId,
      lastValidBlockHeight: data.lastValidBlockHeight ?? undefined,
      otherAmountThreshold: data.otherAmountThreshold ?? undefined,
      quote,
      rawResponse: data,
    };
  }

  /**
   * Executes a signed order transaction using Jupiter's managed landing infrastructure.
   */
  async executeTransaction(params: JupiterExecuteParams): Promise<JupiterExecuteResponse> {
    const url = `${this.apiBase}/swap/v2/execute`;
    const body: Record<string, unknown> = {
      signedTransaction: params.signedTransaction,
      requestId: params.requestId,
    };
    if (params.lastValidBlockHeight) {
      body.lastValidBlockHeight = params.lastValidBlockHeight;
    }

    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        ...this.getHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Jupiter /execute error (${response.status}): ${errorText}`);
    }

    const json = await response.json();
    const parseResult = JupiterExecuteResponseSchema.safeParse(json);
    if (!parseResult.success) {
      throw new Error(`Jupiter /execute schema mismatch: ${parseResult.error.message}`);
    }

    return parseResult.data;
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
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Jupiter request timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const defaultJupiterAdapter = new JupiterAdapter();
