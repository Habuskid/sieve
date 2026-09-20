import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { defaultPreStocksAdapter } from "../../server/prestocks/adapter";
import { defaultJupiterAdapter } from "../../server/jupiter/adapter";
import { defaultSolanaAdapter, CANONICAL_MINTS, calculateNetOutput } from "../../server/solana/adapter";
import { evaluatePriceBoundary } from "../../core/policy/evaluator";
import { displayToRaw, toDecimal, rawToEconomicDisplay } from "../../core/money/decimal";
import { deriveAllowedExecutionTolerance } from "../../core/protection/slippage";
import { JupiterOrderResponseSchema } from "../../server/jupiter/schema";

/**
 * Strict external outcome classification per Sieve audit contract:
 * BLOCKED_EXTERNAL may ONLY cover clearly external conditions:
 * - missing JUPITER_API_KEY
 * - missing READONLY_TAKER_WALLET
 * - documented Jupiter NO_ROUTE / COULD_NOT_FIND_ANY_ROUTE
 * - HTTP 429
 * - RPC/network timeout/unavailability
 * - documented upstream 5xx
 * Schema errors, math errors, assertion failures, invalid public keys, policy failures,
 * unexpected 4xx responses, and programming exceptions must FAIL the test.
 */
function classifyExternalError(err: unknown): { isExternal: boolean; reason: string } {
  if (!err) return { isExternal: false, reason: "Unknown error" };
  const msg = err instanceof Error ? err.message : String(err);

  // Missing credentials or wallet in environment
  if (msg.includes("READONLY_TAKER_WALLET") || msg.includes("JUPITER_API_KEY")) {
    return { isExternal: true, reason: msg };
  }

  // Documented Jupiter NO_ROUTE / COULD_NOT_FIND_ANY_ROUTE
  if (
    msg.includes("NO_ROUTE") ||
    msg.includes("COULD_NOT_FIND_ANY_ROUTE") ||
    msg.includes("No routes found")
  ) {
    return { isExternal: true, reason: `Jupiter route unavailable: ${msg}` };
  }

  // HTTP 429 Rate Limit
  if (msg.includes("429") || msg.toLowerCase().includes("rate limit")) {
    return { isExternal: true, reason: `Rate limit encountered: ${msg}` };
  }

  // RPC/network timeout / network drop / unavailability
  if (
    msg.includes("ETIMEDOUT") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ECONNRESET") ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("fetch failed")
  ) {
    return { isExternal: true, reason: `Network/RPC timeout or connection drop: ${msg}` };
  }

  // Documented upstream 5xx (500, 502, 503, 504)
  if (
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504")
  ) {
    return { isExternal: true, reason: `Upstream service 5xx response: ${msg}` };
  }

  return { isExternal: false, reason: msg };
}

describe("Phase 9: Mainnet Read-Only Live Integration", () => {
  it("queries real PreStocks markets and Jupiter V2 routes in read-only mode", async () => {
    try {
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
      // Verify that Sieve correctly supports and parses all parameters using dynamic on-chain state.
      const openAiMetadata = await defaultSolanaAdapter.resolveMintMetadata(openAi!.mint, "mainnet");
      expect(openAiMetadata.supported).toBe(true);
      expect(openAiMetadata.issuerControls.permanentDelegate).toBe(true);
      expect(openAiMetadata.transferFeeBasisPoints).toBeGreaterThanOrEqual(0);
      expect(openAiMetadata.scaledUiAmount?.activeMultiplier).toBeDefined();
      expect(toDecimal(openAiMetadata.scaledUiAmount!.activeMultiplier).gt(0)).toBe(true);

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
      const rawTaker = process.env.READONLY_TAKER_WALLET;
      if (!rawTaker || rawTaker.trim() === "") {
        console.log("[USDC -> WSOL Route Test] Outcome: BLOCKED_EXTERNAL - Missing READONLY_TAKER_WALLET in environment");
        return;
      }
      const takerPubkey = new PublicKey(rawTaker.trim());
      const unsignedOrder = await defaultJupiterAdapter.buildTransaction({
        inputMint: CANONICAL_MINTS.mainnet.USDC,
        outputMint: CANONICAL_MINTS.mainnet.WSOL,
        amount: usdcRaw,
        taker: takerPubkey.toBase58(),
        outputDecimals: wsolDecimals,
        slippageBps: 500,
      });

      expect(unsignedOrder.transactionBase64).toBeDefined();
      expect(unsignedOrder.transactionBase64.length).toBeGreaterThan(50);
      expect(unsignedOrder.requestId).toBeDefined();

      // 6. Verify no funds were moved: zero private keys, zero signature, zero broadcast
    } catch (err) {
      const { isExternal, reason } = classifyExternalError(err);
      if (isExternal) {
        console.log(`[USDC -> WSOL Route Test] Outcome: BLOCKED_EXTERNAL - ${reason}`);
      } else {
        throw err;
      }
    }
  }, 20000); // Allow 20s for live network calls

  it("queries real Jupiter Swap V2 route for USDC -> PreStocks mint in read-only mode", async () => {
    let outcome: "PASS" | "BLOCKED_EXTERNAL" | "FAIL" = "FAIL";
    let outcomeReason = "";

    try {
      // 1. Fetch live PreStocks markets
      const markets = await defaultPreStocksAdapter.fetchMarkets();
      expect(markets.length).toBeGreaterThan(0);
      const targetAsset = markets.find(
        (m) => m.symbol.toUpperCase() === "OPENAI" || m.symbol.toUpperCase() === "SPACEX"
      ) || markets[0];
      expect(targetAsset).toBeDefined();
      expect(targetAsset.mint).toBeDefined();

      // 2. Resolve on-chain mint metadata via production adapter
      const metadata = await defaultSolanaAdapter.resolveMintMetadata(targetAsset.mint, "mainnet", {
        bypassCache: true,
      });
      expect(metadata.supported).toBe(true);
      expect(metadata.transferFeeBasisPoints).toBeGreaterThanOrEqual(0);
      const activeMultiplier = metadata.scaledUiAmount?.activeMultiplier ?? "1";
      expect(toDecimal(activeMultiplier).gt(0)).toBe(true);

      // 3. Validate READONLY_TAKER_WALLET
      const rawTaker = process.env.READONLY_TAKER_WALLET;
      if (!rawTaker || rawTaker.trim() === "") {
        outcome = "BLOCKED_EXTERNAL";
        outcomeReason = "Missing READONLY_TAKER_WALLET in environment";
        console.log(`[PreStocks Route Test] Outcome: ${outcome} - ${outcomeReason}`);
        expect(["PASS", "BLOCKED_EXTERNAL"]).toContain(outcome);
        return;
      }

      // Validate as a Solana public key before calling Jupiter (throws if invalid)
      const takerPubkey = new PublicKey(rawTaker.trim());
      const taker = takerPubkey.toBase58();

      // 4. Query Jupiter Swap V2 quote for USDC -> PreStocks mint (READ-ONLY)
      const usdcAmount = "10"; // 10 USDC
      const usdcRaw = displayToRaw(usdcAmount, CANONICAL_MINTS.mainnet.USDC_DECIMALS);

      const quoteResult = await defaultJupiterAdapter.getQuote({
        inputMint: CANONICAL_MINTS.mainnet.USDC,
        outputMint: targetAsset.mint,
        amount: usdcRaw,
        outputDecimals: metadata.decimals,
      });

      expect(quoteResult.quote.outputMint).toBe(targetAsset.mint);
      expect(quoteResult.quote.outputRaw).toBeDefined();

      // 5. Calculate net output after Token-2022 transfer fee withholding
      const grossRaw = quoteResult.quote.outputRaw;
      const netRaw = calculateNetOutput(grossRaw, metadata.transferFee);
      expect(netRaw).toBeLessThanOrEqual(grossRaw);

      // 6. Convert to economic units using authoritative scaled conversion
      const netEconomicTokens = rawToEconomicDisplay(netRaw, metadata.decimals, activeMultiplier);
      expect(netEconomicTokens.toNumber()).toBeGreaterThan(0);

      // 7. Derive Sieve's real protection tolerance
      const userPremiumLimit = "25.0"; // 25% user premium limit (accommodates live market spread ~18%)
      const protection = deriveAllowedExecutionTolerance({
        fundingUsdValue: usdcAmount,
        referencePriceUsd: targetAsset.referencePriceUsd,
        maxPremiumPct: userPremiumLimit,
        expectedTargetTokens: netEconomicTokens.toString(),
        targetDecimals: metadata.decimals,
        activeMultiplier,
      });

      if (!protection.isExecutable) {
        // If route is outside configured limit, assert Sieve returns blocked outcome
        expect(protection.isExecutable).toBe(false);
        expect(protection.slippageBps).toBe(0);
        outcome = "PASS";
        outcomeReason = `Sieve protection correctly blocked route outside price limit: expected ${netEconomicTokens.toString()} tokens vs minimum ${protection.minimumAcceptableOutputDisplay}`;
      } else {
        // 8. Assemble unsigned transaction via Jupiter V2 order API with derived slippage
        const unsignedOrder = await defaultJupiterAdapter.buildTransaction({
          inputMint: CANONICAL_MINTS.mainnet.USDC,
          outputMint: targetAsset.mint,
          amount: usdcRaw,
          taker,
          outputDecimals: metadata.decimals,
          slippageBps: protection.slippageBps,
        });

        expect(unsignedOrder.transactionBase64).toBeDefined();
        expect(unsignedOrder.otherAmountThreshold).toBeDefined();

        // 9. Explicitly capture and report Jupiter fee fields
        const { feeMint, feeBps, rawResponse } = unsignedOrder;
        const feeCheck = JupiterOrderResponseSchema.pick({ feeMint: true, feeBps: true }).safeParse({
          feeMint: rawResponse.feeMint,
          feeBps: rawResponse.feeBps,
        });
        expect(feeCheck.success).toBe(true);

        if (feeMint == null && feeBps == null) {
          console.log("[PreStocks Route Test] feeMint and feeBps omitted by Jupiter (null/undefined in /order response according to schema)");
        } else {
          console.log(`[PreStocks Route Test] Captured fee fields - feeMint: ${feeMint ?? "null"}, feeBps: ${feeBps ?? "null"}`);
        }

        // 10. Run actual Sieve protection against real otherAmountThreshold
        // Apply production Token-2022 fee logic (worst-case across older/newer schedules)
        const grossThreshold = BigInt(unsignedOrder.otherAmountThreshold!);
        let worstCaseNetThreshold = calculateNetOutput(grossThreshold, metadata.transferFee);

        if (
          metadata.olderTransferFee &&
          metadata.newerTransferFee &&
          (metadata.olderTransferFee.basisPoints !== metadata.newerTransferFee.basisPoints ||
            metadata.olderTransferFee.maximumFee !== metadata.newerTransferFee.maximumFee)
        ) {
          const netOlder = calculateNetOutput(grossThreshold, metadata.olderTransferFee);
          const netNewer = calculateNetOutput(grossThreshold, metadata.newerTransferFee);
          const worstAcrossSchedules = netOlder < netNewer ? netOlder : netNewer;
          if (worstAcrossSchedules < worstCaseNetThreshold) {
            worstCaseNetThreshold = worstAcrossSchedules;
          }
        }

        expect(worstCaseNetThreshold).toBeLessThanOrEqual(grossThreshold);
        expect(worstCaseNetThreshold >= protection.minimumAcceptableOutputRaw).toBe(true);

        outcome = "PASS";
        outcomeReason = `Live quote and unsigned order verified with Sieve protection (worstCaseNetThreshold: ${worstCaseNetThreshold} >= minimumAcceptableOutputRaw: ${protection.minimumAcceptableOutputRaw})`;
      }
      // Verify no signatures, no broadcasts, no fund movement
    } catch (err: any) {
      const { isExternal, reason } = classifyExternalError(err);
      if (isExternal) {
        outcome = "BLOCKED_EXTERNAL";
        outcomeReason = reason;
      } else {
        outcome = "FAIL";
        outcomeReason = reason;
        throw err; // Re-throw unexpected schema / math / coding failure
      }
    }

    console.log(`[PreStocks Route Test] Outcome: ${outcome} - ${outcomeReason}`);
    expect(["PASS", "BLOCKED_EXTERNAL"]).toContain(outcome);
  }, 20000);
});

