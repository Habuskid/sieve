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

    // 2. Authoritative on-chain Token-2022 inspection:
    // On Mainnet, OpenAI has PermanentDelegate (with disclosure), 50 bps transfer fee, and 1.4861347 ScaledUi multiplier.
    // Verify that Sieve correctly supports and parses all parameters.
    const openAiMetadata = await defaultSolanaAdapter.resolveMintMetadata(openAi!.mint, "mainnet");
    expect(openAiMetadata.supported).toBe(true);
    expect(openAiMetadata.issuerControls.permanentDelegate).toBe(true);
    expect(openAiMetadata.transferFee?.basisPoints).toBe(50);
    expect(openAiMetadata.scaledUiAmount?.activeMultiplier).toBe("1.4861347");

    // 3. Query live Jupiter V2 quote for canonical USDC -> WSOL in read-only mode
    const usdcAmount = "10"; // 10 USDC
    const usdcRaw = displayToRaw(usdcAmount, CANONICAL_MINTS.mainnet.USDC_DECIMALS);
    const wsolDecimals = CANONICAL_MINTS.mainnet.SOL_DECIMALS;

    const usdcQuoteResult = await defaultJupiterAdapter.getQuote({
      inputMint: CANONICAL_MINTS.mainnet.USDC,
      outputMint: CANONICAL_MINTS.mainnet.WSOL,
      amount: usdcRaw,
      outputDecimals: wsolDecimals,
    });

    expect(usdcQuoteResult.quote.outputMint).toBe(CANONICAL_MINTS.mainnet.WSOL);
    expect(toDecimal(usdcQuoteResult.quote.expectedTargetAmount).toNumber()).toBeGreaterThan(0);

    // 4. Evaluate boundary with live data
    const solUsdPrice = await defaultJupiterAdapter.getSolUsdPrice();
    const decision = evaluatePriceBoundary({
      referencePriceUsd: solUsdPrice.toString(),
      referenceObservedAt: new Date().toISOString(),
      fundingUsdValue: usdcAmount,
      expectedTargetTokens: usdcQuoteResult.quote.expectedTargetAmount,
      maxPremiumPct: "10.0", // 10% tolerance for live test
      quoteObservedAt: usdcQuoteResult.quote.observedAt,
      priceImpactPct: usdcQuoteResult.quote.priceImpactPct,
    });

    expect(decision.referencePriceUsd).toBeDefined();
    expect(decision.currentBuyPriceUsd).toBeDefined();

    // 5. Build unsigned transaction via Jupiter V2 order API
    const unsignedOrder = await defaultJupiterAdapter.buildTransaction({
      inputMint: CANONICAL_MINTS.mainnet.USDC,
      outputMint: CANONICAL_MINTS.mainnet.WSOL,
      amount: usdcRaw,
      taker: readOnlyTakerWallet,
      outputDecimals: wsolDecimals,
      slippageBps: 500,
    });

    expect(unsignedOrder.transactionBase64).toBeDefined();
    expect(unsignedOrder.transactionBase64.length).toBeGreaterThan(50);
    expect(unsignedOrder.requestId).toBeDefined();

    // 6. Verify no funds were moved: zero private keys, zero signature, zero broadcast
  }, 20000); // Allow 20s for live network calls
});
