export type ErrorCode =
  | "PRICE_REFERENCE_UNAVAILABLE"
  | "PRICE_REFERENCE_INVALID"
  | "QUOTE_NO_ROUTE"
  | "QUOTE_EXPIRED"
  | "PRICE_MOVED_OUTSIDE_LIMIT"
  | "ROUTE_RISK"
  | "WALLET_NOT_CONNECTED"
  | "WALLET_REJECTED"
  | "WALLET_NETWORK_MISMATCH"
  | "INSUFFICIENT_FUNDS"
  | "TRANSACTION_BUILD_FAILED"
  | "TRANSACTION_EXPIRED"
  | "TRANSACTION_SUBMIT_FAILED"
  | "CONFIRMATION_PENDING"
  | "CONFIRMATION_FAILED"
  | "RATE_LIMITED"
  | "SOURCE_TIMEOUT"
  | "INTERNAL_ERROR";

export interface SieveErrorDetails {
  code: ErrorCode;
  userTitle: string;
  userMessage: string;
  retryable: boolean;
  fundsMoved: "no" | "unknown" | "yes";
  status: number;
}

export const ERROR_REGISTRY: Record<ErrorCode, SieveErrorDetails> = {
  PRICE_REFERENCE_UNAVAILABLE: {
    code: "PRICE_REFERENCE_UNAVAILABLE",
    userTitle: "We couldn't get the latest reference price.",
    userMessage: "Try again in a moment. No trade was created.",
    retryable: true,
    fundsMoved: "no",
    status: 503,
  },
  PRICE_REFERENCE_INVALID: {
    code: "PRICE_REFERENCE_INVALID",
    userTitle: "This market is temporarily unavailable.",
    userMessage: "Please pick another market or try again later. No trade was created.",
    retryable: false,
    fundsMoved: "no",
    status: 400,
  },
  QUOTE_NO_ROUTE: {
    code: "QUOTE_NO_ROUTE",
    userTitle: "There isn't a market route for this amount right now.",
    userMessage: "Try a different amount or check again later.",
    retryable: true,
    fundsMoved: "no",
    status: 404,
  },
  QUOTE_EXPIRED: {
    code: "QUOTE_EXPIRED",
    userTitle: "The price check expired.",
    userMessage: "Check the price again before continuing.",
    retryable: true,
    fundsMoved: "no",
    status: 410,
  },
  PRICE_MOVED_OUTSIDE_LIMIT: {
    code: "PRICE_MOVED_OUTSIDE_LIMIT",
    userTitle: "The price moved past your limit.",
    userMessage: "No trade was created. Check again or change your limit.",
    retryable: true,
    fundsMoved: "no",
    status: 400,
  },
  ROUTE_RISK: {
    code: "ROUTE_RISK",
    userTitle: "This route is too expensive to use right now.",
    userMessage: "The market price impact is higher than safety thresholds. Try a smaller amount.",
    retryable: true,
    fundsMoved: "no",
    status: 400,
  },
  WALLET_NOT_CONNECTED: {
    code: "WALLET_NOT_CONNECTED",
    userTitle: "Connect your wallet to continue.",
    userMessage: "A connected wallet is required to review and sign trades.",
    retryable: true,
    fundsMoved: "no",
    status: 401,
  },
  WALLET_REJECTED: {
    code: "WALLET_REJECTED",
    userTitle: "You didn't approve the buy in your wallet.",
    userMessage: "No funds moved.",
    retryable: true,
    fundsMoved: "no",
    status: 400,
  },
  WALLET_NETWORK_MISMATCH: {
    code: "WALLET_NETWORK_MISMATCH",
    userTitle: "Your wallet and Sieve are using different networks.",
    userMessage: "Please switch your wallet cluster to match the active network in Sieve.",
    retryable: true,
    fundsMoved: "no",
    status: 400,
  },
  INSUFFICIENT_FUNDS: {
    code: "INSUFFICIENT_FUNDS",
    userTitle: "There isn't enough funds in this wallet.",
    userMessage: "Make sure you have enough SOL or USDC to cover both the purchase and network fees.",
    retryable: true,
    fundsMoved: "no",
    status: 400,
  },
  TRANSACTION_BUILD_FAILED: {
    code: "TRANSACTION_BUILD_FAILED",
    userTitle: "We couldn't prepare this buy.",
    userMessage: "Nothing was sent. Check again.",
    retryable: true,
    fundsMoved: "no",
    status: 500,
  },
  TRANSACTION_EXPIRED: {
    code: "TRANSACTION_EXPIRED",
    userTitle: "The trade expired before it was sent.",
    userMessage: "Check the price again.",
    retryable: true,
    fundsMoved: "no",
    status: 410,
  },
  TRANSACTION_SUBMIT_FAILED: {
    code: "TRANSACTION_SUBMIT_FAILED",
    userTitle: "The trade wasn't sent.",
    userMessage: "The transaction could not be submitted to the network.",
    retryable: true,
    fundsMoved: "no",
    status: 500,
  },
  CONFIRMATION_PENDING: {
    code: "CONFIRMATION_PENDING",
    userTitle: "The trade was sent, but confirmation is taking longer than expected.",
    userMessage: "Solana is still processing your transaction. You can check the transaction signature on Solscan.",
    retryable: false,
    fundsMoved: "unknown",
    status: 202,
  },
  CONFIRMATION_FAILED: {
    code: "CONFIRMATION_FAILED",
    userTitle: "The trade wasn't completed.",
    userMessage: "The transaction failed on-chain or expired before landing.",
    retryable: true,
    fundsMoved: "no",
    status: 500,
  },
  RATE_LIMITED: {
    code: "RATE_LIMITED",
    userTitle: "Too many checks at once.",
    userMessage: "Please wait a moment before trying again.",
    retryable: true,
    fundsMoved: "no",
    status: 429,
  },
  SOURCE_TIMEOUT: {
    code: "SOURCE_TIMEOUT",
    userTitle: "The market is taking too long to respond.",
    userMessage: "Please try again.",
    retryable: true,
    fundsMoved: "no",
    status: 504,
  },
  INTERNAL_ERROR: {
    code: "INTERNAL_ERROR",
    userTitle: "Something went wrong while checking the trade.",
    userMessage: "An unexpected error occurred. Please try again.",
    retryable: true,
    fundsMoved: "no",
    status: 500,
  },
};

export class SieveAppError extends Error {
  public readonly details: SieveErrorDetails;
  public readonly requestId?: string;

  constructor(code: ErrorCode, customMessage?: string, requestId?: string) {
    const details = ERROR_REGISTRY[code] || ERROR_REGISTRY.INTERNAL_ERROR;
    super(customMessage || details.userMessage);
    this.name = "SieveAppError";
    this.details = details;
    this.requestId = requestId;
  }
}
