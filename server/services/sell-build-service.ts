import { v4 as uuidv4 } from "uuid";
import { deriveAllowedSellExecutionTolerance, deriveSellInputConversion, evaluateSellPriceBoundary, isExpired, rawToDisplay } from "../../core";
import type { SellBuildIntent } from "../../core";
import { getRepository } from "../database/db";
import type { ISellRepository } from "../database/repository";
import { defaultJupiterAdapter, type JupiterAdapter } from "../jupiter/adapter";
import { guaranteedWalletUsdcOutput } from "../jupiter/sell-output-accounting";
import { CANONICAL_MINTS, defaultSolanaAdapter, type SolanaAdapter } from "../solana/adapter";
import { SieveAppError } from "./errors";
import { defaultMarketService, type MarketService } from "./market-service";
import { defaultSellCheckService, type SellCheckResponse, type SellCheckService } from "./sell-check-service";

export type SellBuildResult = { status: "READY_FOR_WALLET"; buildIntentId: string; network: "mainnet"; serializedTransaction: string; expiresAt: string; summary: SellBuildIntent["summary"] } | { status: "BLOCKED"; reason: string; refreshedCheck: SellCheckResponse };

export class SellBuildService {
  constructor(private markets: MarketService = defaultMarketService, private jupiter: JupiterAdapter = defaultJupiterAdapter, private solana: SolanaAdapter = defaultSolanaAdapter, private checks: SellCheckService = defaultSellCheckService, private repo: ISellRepository = getRepository()) {}

  async buildTransaction(input: { checkId: string; wallet: string }): Promise<SellBuildResult> {
    const check = await this.repo.getSellPriceCheck(input.checkId);
    if (!check) throw new SieveAppError("QUOTE_EXPIRED", "Sell check not found");
    if (isExpired(check.expiresAt, Date.now())) throw new SieveAppError("TRANSACTION_EXPIRED", "Sell check expired");
    if (check.wallet && check.wallet !== input.wallet) throw new SieveAppError("WALLET_MISMATCH");

    const asset = await this.markets.getMarketByMint(check.asset.mint, { bypassCache: true });
    if (!asset) throw new SieveAppError("DATA_UNAVAILABLE");
    const metadata = await this.solana.resolveMintMetadata(asset.mint, "mainnet", { bypassCache: true });
      if (!metadata.supported) throw new SieveAppError("ROUTE_RISK", metadata.blockers.join("; "));
      const conversion = deriveSellInputConversion({ requestedEconomicAmount: check.input.requestedEconomicAmount, decimals: metadata.decimals, activeMultiplier: metadata.scaledUiAmount?.activeMultiplier, transferFee: metadata.transferFee });
      const balance = await this.solana.checkTokenBalance(input.wallet, asset.mint, conversion.rawWalletInput, "mainnet");
      if (!balance.hasSufficient) throw new SieveAppError("INSUFFICIENT_FUNDS", balance.error);
      const quote = await this.jupiter.getQuote({ inputMint: asset.mint, outputMint: CANONICAL_MINTS.mainnet.USDC, amount: conversion.rawWalletInput, outputDecimals: 6 });
      if (quote.quote.inputRaw !== conversion.rawWalletInput) throw new SieveAppError("ROUTE_RISK", "Jupiter revalidation input does not match the authoritative raw wallet debit");
      const proceedsRaw = guaranteedWalletUsdcOutput({ rawAmount: quote.quote.outputRaw, field: "outAmount", outputMint: quote.quote.outputMint, expectedUsdcMint: CANONICAL_MINTS.mainnet.USDC, feeMint: quote.rawResponse.feeMint, platformFeeAmount: quote.rawResponse.platformFee?.amount });
      const impact = quote.quote.priceImpactPct;

    const proceeds = rawToDisplay(proceedsRaw, 6).toString();
    const decision = evaluateSellPriceBoundary({ referencePriceUsd: asset.referencePriceUsd, referenceObservedAt: asset.observedAt, economicTokensSold: conversion.actualEconomicAmount, netProceedsUsd: proceeds, maxDiscountPct: check.maxDiscountPct, priceImpactPct: impact });
    if (!decision.isExecutable) return { status: "BLOCKED", reason: decision.status === "PRICE_TOO_LOW" ? "PRICE_MOVED" : decision.status, refreshedCheck: this.checks.toDto({ ...check, asset, input: conversion, expectedUsdcProceedsRaw: proceedsRaw, expectedUsdcProceeds: proceeds, priceImpactPct: impact, decision }) };

    const protection = deriveAllowedSellExecutionTolerance({ economicTokensSold: conversion.actualEconomicAmount, referencePriceUsd: asset.referencePriceUsd, maxDiscountPct: check.maxDiscountPct, expectedNetProceedsUsd: proceeds, outputDecimals: 6 });
    if (!protection.isExecutable) throw new SieveAppError("PRICE_MOVED_OUTSIDE_LIMIT");

    let transactionBase64: string;
    let requestId: string | undefined;
    let lastValidBlockHeight: string | undefined;
    let jupiterFeeMint: string | null | undefined;
    let jupiterPlatformFeeRaw: string | null | undefined;
      if (metadata.scaledUiAmount?.newMultiplierEffectiveTimestamp != null) {
        const effectiveAt = metadata.scaledUiAmount.newMultiplierEffectiveTimestamp;
        const chainTime = metadata.chainTimestamp;
        if (chainTime == null || (effectiveAt > chainTime && effectiveAt <= chainTime + 120)) throw new SieveAppError("ROUTE_RISK", "Scaled UI multiplier transition prevents safe Sell build");
      }
      const built = await this.jupiter.buildTransaction({ inputMint: asset.mint, outputMint: CANONICAL_MINTS.mainnet.USDC, amount: conversion.rawWalletInput, outputDecimals: 6, taker: input.wallet, slippageBps: protection.slippageBps });
      if (!built.otherAmountThreshold) throw new SieveAppError("ROUTE_RISK", "Final Jupiter order is missing otherAmountThreshold");
      const finalMinimum = guaranteedWalletUsdcOutput({ rawAmount: BigInt(built.otherAmountThreshold), field: "otherAmountThreshold", outputMint: built.quote.outputMint, expectedUsdcMint: CANONICAL_MINTS.mainnet.USDC, feeMint: built.feeMint, platformFeeAmount: built.platformFee?.amount });
      if (finalMinimum < protection.minimumAcceptableOutputRaw) throw new SieveAppError("PRICE_MOVED_OUTSIDE_LIMIT", "Final Jupiter minimum USDC output is below the Sieve Sell floor");
      transactionBase64 = built.transactionBase64;
      requestId = built.requestId;
      lastValidBlockHeight = built.lastValidBlockHeight;
      jupiterFeeMint = built.feeMint;
      jupiterPlatformFeeRaw = built.platformFee?.amount ?? null;

    const intent: SellBuildIntent = { id: uuidv4(), checkId: check.id, network: check.network, wallet: input.wallet, transactionBase64, requestId, lastValidBlockHeight, minimumUsdcOutputRaw: protection.minimumAcceptableOutputRaw, expiresAt: new Date(Date.now() + 60_000).toISOString(), summary: { side: "SELL", targetSymbol: asset.symbol, targetMint: asset.mint, requestedEconomicAmount: conversion.requestedEconomicAmount, actualEconomicAmount: conversion.actualEconomicAmount, rawWalletInput: conversion.rawWalletInput.toString(), rawTransferFee: conversion.rawTransferFee.toString(), rawRouteInput: conversion.rawRouteInput.toString(), expectedUsdcProceeds: proceeds, referencePriceUsd: decision.referencePriceUsd, currentSellPriceUsd: decision.currentSellPriceUsd!, minimumSellPriceUsd: decision.minimumSellPriceUsd, maxDiscountPct: check.maxDiscountPct, discountBps: decision.discountBps!, inputDecimals: conversion.decimals, activeMultiplier: conversion.activeMultiplier, chainTimestamp: metadata?.chainTimestamp ?? undefined, epoch: metadata?.epoch?.toString(), jupiterFeeMint, jupiterPlatformFeeRaw, issuerControls: metadata?.issuerControls } };
    await this.repo.saveSellBuildIntent(intent);
    return { status: "READY_FOR_WALLET", buildIntentId: intent.id, network: intent.network, serializedTransaction: transactionBase64, expiresAt: intent.expiresAt, summary: intent.summary };
  }
}

export const defaultSellBuildService = new SellBuildService();
