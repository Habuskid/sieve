export type BoundaryCapacitySide = "BUY" | "SELL";

export type BoundaryCapacityStatus =
  | "FULLY_WITHIN_BOUNDARY"
  | "PARTIALLY_WITHIN_BOUNDARY"
  | "NO_VERIFIED_CAPACITY";

export interface BoundaryCapacityCandidate {
  amountRaw: bigint;
  amountDisplay?: string;
  effectiveExecutionPrice?: string | null;
  withinBoundary: boolean;
  metadata?: Record<string, unknown>;
}

export type CandidateEvaluator = (
  amountRaw: bigint
) => Promise<BoundaryCapacityCandidate>;

export interface SearchBoundaryCapacityInput {
  side: BoundaryCapacitySide;
  requestedAmountRaw: bigint;
  requestedAmountDisplay?: string;
  evaluator: CandidateEvaluator;
  maxProbes?: number;
}

export interface BoundaryCapacityResult {
  side: BoundaryCapacitySide;
  requestedAmountRaw: bigint;
  requestedAmountDisplay?: string;
  requestedCandidate: BoundaryCapacityCandidate;
  verifiedCapacityCandidate: BoundaryCapacityCandidate | null;
  observedCandidates: BoundaryCapacityCandidate[];
  probeCount: number;
  status: BoundaryCapacityStatus;
}
