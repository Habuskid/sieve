import type { IssuerControls, MainnetNetwork, MarketAsset, SellPriceDecision } from "./types";

export type SellInputConversion = {
  requestedEconomicAmount: string;
  actualEconomicAmount: string;
  rawWalletInput: bigint;
  rawTransferFee: bigint;
  rawRouteInput: bigint;
  decimals: number;
  activeMultiplier: string;
};

export type SellPriceCheck = {
  id: string; network: MainnetNetwork; wallet: string | null; clientIntentVersion: string;
  asset: MarketAsset; input: SellInputConversion; expectedUsdcProceedsRaw: bigint;
  expectedUsdcProceeds: string; priceImpactPct: string | null; routeFingerprint: string | null;
  maxDiscountPct: string; maxDiscountBps: number; decision: SellPriceDecision;
  source: "JUPITER"; createdAt: string; expiresAt: string;
};

export type SellBuildIntent = {
  id: string; checkId: string; network: MainnetNetwork; wallet: string;
  transactionBase64: string; requestId?: string; lastValidBlockHeight?: string;
  minimumUsdcOutputRaw: bigint; expiresAt: string;
  summary: {
    side: "SELL"; targetSymbol: string; targetMint: string;
    requestedEconomicAmount: string; actualEconomicAmount: string;
    rawWalletInput: string; rawTransferFee: string; rawRouteInput: string;
    expectedUsdcProceeds: string; referencePriceUsd: string; currentSellPriceUsd: string;
    minimumSellPriceUsd: string; maxDiscountPct: string; discountBps: number;
    inputDecimals: number; activeMultiplier: string; chainTimestamp?: number; epoch?: string;
    jupiterFeeMint?: string | null; jupiterPlatformFeeRaw?: string | null;
    issuerControls?: IssuerControls;
  };
};

export type SellTradeReceipt = {
  id: string; side: "SELL"; checkId: string; buildIntentId: string;
  wallet: string; network: MainnetNetwork; signature: string | null; internalExecutionId?: string | null;
  status: "CONFIRMED" | "FAILED"; targetSymbol: string; targetMint: string;
  requestedEconomicAmount: string; actualEconomicInput: string | null; rawInput: string | null;
  expectedUsdcProceeds: string; realizedUsdcProceeds: string | null;
  referencePriceUsd: string; checkedSellPriceUsd: string; minimumSellPriceUsd: string;
  maxDiscountBps: number; realizedDiscountBps: number | null;
  submittedAt: string; confirmedAt: string | null; failureCode?: string | null;
};
