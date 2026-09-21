export type WalletStateBlocker =
  | { blocked: true; reason: string }
  | { blocked: false };

const WALLET_STATE_BLOCKERS: ReadonlyArray<{
  pattern: RegExp;
  reason: string;
}> = [
  {
    pattern: /missing associated token account/i,
    reason: "Missing associated token account",
  },
  {
    pattern: /insufficient (?:token )?(?:funds|balance)/i,
    reason: "Insufficient wallet token balance",
  },
  {
    pattern: /(?:insufficient|not enough) (?:sol|lamports?)/i,
    reason: "Insufficient SOL for transaction or account requirements",
  },
];

/**
 * Classifies only wallet-state failures returned while asking Jupiter to
 * assemble an unsigned order. Authentication, routing, schema, provider, and
 * invariant failures intentionally return blocked=false and must be rethrown.
 */
export function classifyUnsignedOrderWalletBlocker(error: unknown): WalletStateBlocker {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = WALLET_STATE_BLOCKERS.find(({ pattern }) => pattern.test(message));

  return match ? { blocked: true, reason: match.reason } : { blocked: false };
}
