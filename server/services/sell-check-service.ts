import { v4 as uuidv4 } from "uuid";
import { DEFAULT_CHECK_EXPIRY_MS, deriveSellInputConversion, evaluateSellPriceBoundary, isPositiveFinite, rawToDisplay, toDecimal } from "../../core";
import type { MainnetNetwork, SellPriceCheck } from "../../core";
import { getRepository } from "../database/db";
import type { ISellRepository } from "../database/repository";
import { defaultJupiterAdapter, type JupiterAdapter } from "../jupiter/adapter";
import { guaranteedWalletUsdcOutput } from "../jupiter/sell-output-accounting";
import { CANONICAL_MINTS, defaultSolanaAdapter, type SolanaAdapter } from "../solana/adapter";
import { SieveAppError } from "./errors";
import { defaultMarketService, type MarketService } from "./market-service";

export type SellCheckRequest = { targetMint: string; amount: string; maxDiscountPct: string; wallet?: string | null; clientIntentVersion: string };
export type SellCheckResponse = { checkId: string; clientIntentVersion: string; network: MainnetNetwork; sourceLabel: string; asset: { name: string; symbol: string; mint: string }; input: { requestedEconomicAmount: string; actualEconomicAmount: string; rawWalletInput: string; rawTransferFee: string; rawRouteInput: string }; price: { referenceUsd: string; currentSellUsd: string | null; minimumSellUsd: string; discountPct: string | null }; expected: { usdcProceeds: string; priceImpactPct: string | null }; decision: string; observedAt: string; expiresAt: string; display: { title: string; message: string } };

export class SellCheckService {
  constructor(private markets: MarketService = defaultMarketService, private jupiter: JupiterAdapter = defaultJupiterAdapter, private solana: SolanaAdapter = defaultSolanaAdapter, private repo: ISellRepository = getRepository()) {}

  async executeCheck(input: SellCheckRequest): Promise<SellCheckResponse> {
    if (!isPositiveFinite(input.amount)) throw new SieveAppError("VALIDATION_ERROR", "Sell amount must be positive");
    const discount = toDecimal(input.maxDiscountPct);
    if (discount.lessThan(0) || discount.greaterThanOrEqualTo(100)) throw new SieveAppError("VALIDATION_ERROR", "Maximum discount must be between 0 and less than 100");
    const asset = await this.markets.getMarketByMint(input.targetMint, { bypassCache: true });
    if (!asset) throw new SieveAppError("PRICE_REFERENCE_INVALID", "Target is not a current PreStocks asset");

    const now = Date.now();
    const metadata = await this.solana.resolveMintMetadata(asset.mint, "mainnet", { bypassCache: true });
    if (!metadata.supported) throw new SieveAppError("ROUTE_RISK", metadata.blockers.join("; "));
    const conversion = deriveSellInputConversion({ requestedEconomicAmount: input.amount, decimals: metadata.decimals, activeMultiplier: metadata.scaledUiAmount?.activeMultiplier, transferFee: metadata.transferFee });
    const quote = await this.jupiter.getQuote({ inputMint: asset.mint, outputMint: CANONICAL_MINTS.mainnet.USDC, amount: conversion.rawWalletInput, outputDecimals: 6 });
    if (quote.quote.inputRaw !== conversion.rawWalletInput) throw new SieveAppError("ROUTE_RISK", "Jupiter quote input does not match the authoritative raw wallet debit");
    const proceedsRaw = guaranteedWalletUsdcOutput({ rawAmount: quote.quote.outputRaw, field: "outAmount", outputMint: quote.quote.outputMint, expectedUsdcMint: CANONICAL_MINTS.mainnet.USDC, feeMint: quote.rawResponse.feeMint, platformFeeAmount: quote.rawResponse.platformFee?.amount });
    const priceImpactPct = quote.quote.priceImpactPct;
    const fingerprint = quote.quote.routeFingerprint;

    const proceeds = rawToDisplay(proceedsRaw, 6).toString();
    const decision = evaluateSellPriceBoundary({ referencePriceUsd: asset.referencePriceUsd, referenceObservedAt: asset.observedAt, economicTokensSold: conversion.actualEconomicAmount, netProceedsUsd: proceeds, maxDiscountPct: input.maxDiscountPct, priceImpactPct, now });
    const check: SellPriceCheck = { id: uuidv4(), network: "mainnet", wallet: input.wallet ?? null, clientIntentVersion: input.clientIntentVersion, asset, input: conversion, expectedUsdcProceedsRaw: proceedsRaw, expectedUsdcProceeds: proceeds, priceImpactPct, routeFingerprint: fingerprint, maxDiscountPct: input.maxDiscountPct, maxDiscountBps: decision.maxDiscountBps, decision, source: "JUPITER", createdAt: new Date(now).toISOString(), expiresAt: new Date(now + DEFAULT_CHECK_EXPIRY_MS).toISOString() };
    await this.repo.saveSellPriceCheck(check);
    return this.toDto(check);
  }

  toDto(c: SellPriceCheck): SellCheckResponse {
    return { checkId: c.id, clientIntentVersion: c.clientIntentVersion, network: c.network, sourceLabel: "PreStocks + Jupiter", asset: { name: c.asset.name, symbol: c.asset.symbol, mint: c.asset.mint }, input: { requestedEconomicAmount: c.input.requestedEconomicAmount, actualEconomicAmount: c.input.actualEconomicAmount, rawWalletInput: c.input.rawWalletInput.toString(), rawTransferFee: c.input.rawTransferFee.toString(), rawRouteInput: c.input.rawRouteInput.toString() }, price: { referenceUsd: c.decision.referencePriceUsd, currentSellUsd: c.decision.currentSellPriceUsd, minimumSellUsd: c.decision.minimumSellPriceUsd, discountPct: c.decision.discountPct }, expected: { usdcProceeds: c.expectedUsdcProceeds, priceImpactPct: c.priceImpactPct }, decision: c.decision.status, observedAt: c.createdAt, expiresAt: c.expiresAt, display: { title: c.decision.displayTitle, message: c.decision.displayMessage } };
  }
}

export const defaultSellCheckService = new SellCheckService();
