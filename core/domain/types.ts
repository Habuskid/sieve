export type NetworkMode = "mainnet" | "testnet";

export type FundingAsset = "SOL" | "USDC";

export type DecisionStatus =
  | "GOOD_TO_GO"
  | "PRICE_TOO_HIGH"
  | "STALE_REFERENCE"
  | "STALE_QUOTE"
  | "NO_ROUTE"
  | "DATA_UNAVAILABLE"
  | "ROUTE_RISK";

export type MarketAsset = {
  name: string;
  symbol: string;
  mint: string;
  imageUrl: string | null;
  productUrl: string | null;
  referencePriceUsd: string;
  tokenPriceUsd: string | null;
  referenceValuationUsd: string | null;
  impliedValuationUsd: string | null;
  supply: string | null;
  source: "PRESTOCKS" | "PRACTICE_FIXTURE";
  observedAt: string;
  network: NetworkMode;
};

export type FundingValuation = {
  fundingAsset: FundingAsset;
  inputRaw: bigint;
  inputDisplay: string;
  inputUsdValue: string;
  method: "USDC_PAR" | "CURRENT_MARKET_ROUTE" | "PRACTICE_FIXTURE";
  observedAt: string;
};

export type MarketQuote = {
  provider: "JUPITER" | "PRACTICE_FIXTURE";
  inputMint: string;
  outputMint: string;
  inputRaw: bigint;
  outputRaw: bigint;
  outputDecimals: number;
  expectedTargetAmount: string;
  priceImpactPct: string | null;
  observedAt: string;
  expiresAt: string | null;
  routeFingerprint: string;
  providerPayloadRef?: string;
};

export type PriceDecision = {
  status: DecisionStatus;
  isExecutable: boolean;
  referencePriceUsd: string;
  currentBuyPriceUsd: string | null;
  maximumBuyPriceUsd: string;
  premiumPct: string | null;
  maxPremiumPct: string;
  premiumBps: number | null;
  maxPremiumBps: number;
  differenceUsd: string | null;
  displayTitle: string;
  displayMessage: string;
};

export type SellDecisionStatus =
  | "GOOD_TO_GO"
  | "PRICE_TOO_LOW"
  | "STALE_REFERENCE"
  | "STALE_QUOTE"
  | "NO_ROUTE"
  | "DATA_UNAVAILABLE"
  | "ROUTE_RISK";

export type SellPriceDecision = {
  status: SellDecisionStatus;
  isExecutable: boolean;
  referencePriceUsd: string;
  currentSellPriceUsd: string | null;
  minimumSellPriceUsd: string;
  discountPct: string | null;
  maxDiscountPct: string;
  discountBps: number | null;
  maxDiscountBps: number;
  differenceUsd: string | null;
  displayTitle: string;
  displayMessage: string;
};

export type ProtectionResult = {
  minimumAcceptableOutputRaw: bigint;
  minimumAcceptableOutputDisplay: string;
  slippageBps: number;
  isExecutable: boolean;
};

export type PriceCheck = {
  id: string;
  network: NetworkMode;
  wallet: string | null;
  clientIntentVersion: string;
  asset: MarketAsset;
  funding: FundingValuation;
  quote: MarketQuote | null;
  maxPremiumPct: string;
  maxPremiumBps: number;
  decision: PriceDecision;
  createdAt: string;
  expiresAt: string;
};

export type IssuerControls = {
  permanentDelegate: boolean;
  pausable: boolean;
  isPaused: boolean;
  defaultAccountState: "Initialized" | "Frozen" | "Uninitialized";
};

export type BuildIntent = {
  id: string;
  checkId: string;
  network: NetworkMode;
  wallet: string;
  minimumAcceptableOutputRaw: bigint;
  protectionMethod: string;
  transactionBase64: string;
  lastValidBlockHeight?: string;
  requestId?: string;
  expiresAt: string;
  summary: {
    fundingAsset: FundingAsset;
    fundingAmount: string;
    targetSymbol: string;
    targetDecimals?: number;
    expectedTargetAmount: string;
    referencePriceUsd: string;
    currentBuyPriceUsd: string;
    premiumPct: string;
    maxPremiumPct: string;
    maxBuyPriceUsd?: string;
    minimumAcceptableOutput?: string;
    premiumBps?: number;
    activeMultiplier?: string;
    chainTimestamp?: number;
    epoch?: string;
    issuerControls?: IssuerControls;
    feeInfo?: {
      signatureFeeLamports?: number | null;
      signatureFeePayer?: string | null;
      prioritizationFeeLamports?: number | null;
      prioritizationFeePayer?: string | null;
      rentFeeLamports?: number | null;
      rentFeePayer?: string | null;
      gasless?: boolean | null;
    };
  };
};

export type TradeReceipt = {
  id: string;
  checkId: string;
  buildIntentId: string;
  wallet: string;
  network: NetworkMode;
  signature: string | null;
  internalExecutionId?: string | null;
  status: "CONFIRMED" | "FAILED";
  fundingAsset: FundingAsset;
  fundingAmount: string;
  requestedFundingAmount: string;
  actualFundingAmount: string | null;
  targetSymbol: string;
  targetMint: string;
  targetDecimals?: number | null;
  expectedTargetAmount: string;
  realizedTargetAmount: string | null;
  rawWalletOutput?: string | null;
  activeMultiplier?: string | null;
  chainTimestamp?: number | null;
  epoch?: string | null;
  referencePriceUsd: string;
  checkedBuyPriceUsd: string;
  maxPremiumBps: number;
  premiumBps: number;
  submittedAt: string;
  confirmedAt: string | null;
  failureCode?: string | null;
};

