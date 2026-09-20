import { v4 as uuidv4 } from "uuid";
import { DEFAULT_CHECK_EXPIRY_MS, deriveSellInputConversion, evaluateSellPriceBoundary, isPositiveFinite, rawToDisplay, toDecimal } from "../../core";
import type { NetworkMode, SellPriceCheck } from "../../core";
import { getRepository } from "../database/db";
import type { ISellRepository } from "../database/repository";
import { defaultJupiterAdapter, type JupiterAdapter } from "../jupiter/adapter";
import { guaranteedWalletUsdcOutput } from "../jupiter/sell-output-accounting";
import { CANONICAL_MINTS, defaultSolanaAdapter, type SolanaAdapter } from "../solana/adapter";
import { SieveAppError } from "./errors";
import { defaultMarketService, type MarketService } from "./market-service";

const SELL_PRACTICE_SCENARIOS = ["SELL_PASS", "SELL_BLOCK", "SELL_EXACT", "SELL_PASS_THEN_MOVE"] as const;
type SellPracticeScenario = (typeof SELL_PRACTICE_SCENARIOS)[number];

export type SellCheckRequest = { network: NetworkMode; targetMint: string; amount: string; maxDiscountPct: string; wallet?: string | null; clientIntentVersion: string; scenarioId?: string };
export type SellCheckResponse = { checkId: string; clientIntentVersion: string; network: NetworkMode; sourceLabel: string; simulated: boolean; asset: { name: string; symbol: string; mint: string }; input: { requestedEconomicAmount: string; actualEconomicAmount: string; rawWalletInput: string; rawTransferFee: string; rawRouteInput: string }; price: { referenceUsd: string; currentSellUsd: string | null; minimumSellUsd: string; discountPct: string | null }; expected: { usdcProceeds: string; priceImpactPct: string | null }; decision: string; observedAt: string; expiresAt: string; display: { title: string; message: string } };

function resolvePracticeScenario(network: NetworkMode, scenarioId?: string): SellPracticeScenario | null {
  if (network === "mainnet") {
    if (scenarioId) throw new SieveAppError("VALIDATION_ERROR", "Test scenarios are not allowed on Mainnet");
    return null;
  }
  const selected = scenarioId ?? "SELL_PASS";
  if (!SELL_PRACTICE_SCENARIOS.includes(selected as SellPracticeScenario)) throw new SieveAppError("VALIDATION_ERROR", "Unknown Sell Testnet scenario");
  return selected as SellPracticeScenario;
}

export class SellCheckService {
  constructor(private markets: MarketService = defaultMarketService, private jupiter: JupiterAdapter = defaultJupiterAdapter, private solana: SolanaAdapter = defaultSolanaAdapter, private repo: ISellRepository = getRepository()) {}

  async executeCheck(input: SellCheckRequest): Promise<SellCheckResponse> {
    if (!isPositiveFinite(input.amount)) throw new SieveAppError("VALIDATION_ERROR", "Sell amount must be positive");
    const discount = toDecimal(input.maxDiscountPct);
    if (discount.lessThan(0) || discount.greaterThanOrEqualTo(100)) throw new SieveAppError("VALIDATION_ERROR", "Maximum discount must be between 0 and less than 100");
    const practiceScenarioId = resolvePracticeScenario(input.network, input.scenarioId);
    const asset = await this.markets.getMarketByMint(input.targetMint, input.network, { bypassCache: input.network === "mainnet" });
    if (!asset) throw new SieveAppError("PRICE_REFERENCE_INVALID", "Target is not a current PreStocks asset");

    const now = Date.now();
    let conversion;
    let proceedsRaw: bigint;
    let priceImpactPct: string | null;
    let fingerprint: string | null;
    if (input.network === "mainnet") {
      const metadata = await this.solana.resolveMintMetadata(asset.mint, "mainnet", { bypassCache: true });
      if (!metadata.supported) throw new SieveAppError("ROUTE_RISK", metadata.blockers.join("; "));
      conversion = deriveSellInputConversion({ requestedEconomicAmount: input.amount, decimals: metadata.decimals, activeMultiplier: metadata.scaledUiAmount?.activeMultiplier, transferFee: metadata.transferFee });
      const quote = await this.jupiter.getQuote({ inputMint: asset.mint, outputMint: CANONICAL_MINTS.mainnet.USDC, amount: conversion.rawWalletInput, outputDecimals: 6 });
      if (quote.quote.inputRaw !== conversion.rawWalletInput) throw new SieveAppError("ROUTE_RISK", "Jupiter quote input does not match the authoritative raw wallet debit");
      proceedsRaw = guaranteedWalletUsdcOutput({ rawAmount: quote.quote.outputRaw, field: "outAmount", outputMint: quote.quote.outputMint, expectedUsdcMint: CANONICAL_MINTS.mainnet.USDC, feeMint: quote.rawResponse.feeMint, platformFeeAmount: quote.rawResponse.platformFee?.amount });
      priceImpactPct = quote.quote.priceImpactPct;
      fingerprint = quote.quote.routeFingerprint;
    } else {
      conversion = deriveSellInputConversion({ requestedEconomicAmount: input.amount, decimals: 9, activeMultiplier: "1", transferFee: null });
      const factor = practiceScenarioId === "SELL_BLOCK" ? "0.94" : practiceScenarioId === "SELL_EXACT" ? "0.95" : "0.97";
      proceedsRaw = BigInt(toDecimal(conversion.actualEconomicAmount).mul(asset.referencePriceUsd).mul(factor).mul(1_000_000).floor().toFixed(0));
      priceImpactPct = "0.10";
      fingerprint = `practice-sell-${practiceScenarioId}`;
    }

    const proceeds = rawToDisplay(proceedsRaw, 6).toString();
    const decision = evaluateSellPriceBoundary({ referencePriceUsd: asset.referencePriceUsd, referenceObservedAt: asset.observedAt, economicTokensSold: conversion.actualEconomicAmount, netProceedsUsd: proceeds, maxDiscountPct: input.maxDiscountPct, priceImpactPct, now });
    const check: SellPriceCheck = { id: uuidv4(), network: input.network, wallet: input.wallet ?? null, clientIntentVersion: input.clientIntentVersion, asset, input: conversion, expectedUsdcProceedsRaw: proceedsRaw, expectedUsdcProceeds: proceeds, priceImpactPct, routeFingerprint: fingerprint, maxDiscountPct: input.maxDiscountPct, maxDiscountBps: decision.maxDiscountBps, decision, practiceScenarioId, source: input.network === "mainnet" ? "JUPITER" : "PRACTICE_FIXTURE", createdAt: new Date(now).toISOString(), expiresAt: new Date(now + DEFAULT_CHECK_EXPIRY_MS).toISOString() };
    await this.repo.saveSellPriceCheck(check);
    return this.toDto(check);
  }

  toDto(c: SellPriceCheck): SellCheckResponse {
    return { checkId: c.id, clientIntentVersion: c.clientIntentVersion, network: c.network, sourceLabel: c.source === "JUPITER" ? "PreStocks + Jupiter" : "Practice Fixture (Test data)", simulated: c.source === "PRACTICE_FIXTURE", asset: { name: c.asset.name, symbol: c.asset.symbol, mint: c.asset.mint }, input: { requestedEconomicAmount: c.input.requestedEconomicAmount, actualEconomicAmount: c.input.actualEconomicAmount, rawWalletInput: c.input.rawWalletInput.toString(), rawTransferFee: c.input.rawTransferFee.toString(), rawRouteInput: c.input.rawRouteInput.toString() }, price: { referenceUsd: c.decision.referencePriceUsd, currentSellUsd: c.decision.currentSellPriceUsd, minimumSellUsd: c.decision.minimumSellPriceUsd, discountPct: c.decision.discountPct }, expected: { usdcProceeds: c.expectedUsdcProceeds, priceImpactPct: c.priceImpactPct }, decision: c.decision.status, observedAt: c.createdAt, expiresAt: c.expiresAt, display: { title: c.decision.displayTitle, message: c.decision.displayMessage } };
  }
}

export const defaultSellCheckService = new SellCheckService();
