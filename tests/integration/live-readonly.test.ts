import { describe, it, expect } from "vitest";
import { defaultPreStocksAdapter } from "../../server/prestocks/adapter";
import { defaultJupiterAdapter } from "../../server/jupiter/adapter";
import { defaultSolanaAdapter, CANONICAL_MINTS } from "../../server/solana/adapter";
import { evaluatePriceBoundary } from "../../core/policy/evaluator";
import { displayToRaw, toDecimal } from "../../core/money/decimal";

describe("Phase 9: Mainnet Read-Only Live Integration", () => {
  const readOnlyTakerWallet = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

  it("queries real PreStocks markets and Jupiter V2 routes in read-only mode", async () => {
    // 1. Fetch live PreStocks markets
    const markets = await defaultPreStocksAdapter.fetchMarkets();
    expect(markets.length).toBeGreaterThan(0);
    const openAi = markets.find(
      (m) => m.symbol.toUpperCase() === "OPENAI" || m.name.toUpperCase().includes("OPENAI")
    );
    expect(openAi).toBeDefined();
    expect(openAi!.mint).toBe("PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");
    expect(parseFloat(openAi!.referencePriceUsd)).toBeGreaterThan(0);

    // 2. Fetch live Jupiter V2 quote for USDC -> OPENAI
    const usdcAmount = "10"; // 10 USDC
    const usdcRaw = displayToRaw(usdcAmount, CANONICAL_MINTS.mainnet.USDC_DECIMALS);
    const openAiDecimals = await defaultSolanaAdapter.resolveMintDecimals(openAi!.mint, "mainnet");

    const usdcQuoteResult = await defaultJupiterAdapter.getQuote({
      inputMint: CANONICAL_MINTS.mainnet.USDC,
      outputMint: openAi!.mint,
      amount: usdcRaw,
      outputDecimals: openAiDecimals,
    });

    expect(usdcQuoteResult.quote.outputMint).toBe(openAi!.mint);
    expect(toDecimal(usdcQuoteResult.quote.expectedTargetAmount).toNumber()).toBeGreaterThan(0);

    // 3. Evaluate boundary with live data
    const decision = evaluatePriceBoundary({
      referencePriceUsd: openAi!.referencePriceUsd,
      referenceObservedAt: openAi!.observedAt,
      fundingUsdValue: usdcAmount,
      expectedTargetTokens: usdcQuoteResult.quote.expectedTargetAmount,
      maxPremiumPct: "10.0", // 10% tolerance for live test
      quoteObservedAt: usdcQuoteResult.quote.observedAt,
      priceImpactPct: usdcQuoteResult.quote.priceImpactPct,
    });

    expect(decision.referencePriceUsd).toBeDefined();
    expect(decision.currentBuyPriceUsd).toBeDefined();

    // 4. Build unsigned transaction via Jupiter V2 order API
    const unsignedOrder = await defaultJupiterAdapter.buildTransaction({
      inputMint: CANONICAL_MINTS.mainnet.USDC,
      outputMint: openAi!.mint,
      amount: usdcRaw,
      taker: readOnlyTakerWallet,
      outputDecimals: openAiDecimals,
      slippageBps: 500,
    });

    expect(unsignedOrder.transactionBase64).toBeDefined();
    expect(unsignedOrder.transactionBase64.length).toBeGreaterThan(50);
    expect(unsignedOrder.lastValidBlockHeight).toBeDefined();

    // 5. Verify no funds were moved
    // Zero private keys, zero signature, zero broadcast
  }, 20000); // Allow 20s for live network calls
});
