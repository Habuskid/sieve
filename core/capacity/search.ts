import type {
  BoundaryCapacityCandidate,
  BoundaryCapacityResult,
  SearchBoundaryCapacityInput,
} from "../domain/capacity-types";

export const DEFAULT_MAX_PROBES = 10;
export const MAX_ALLOWED_PROBES = 10;

/**
 * Pure, deterministic search algorithm for Boundary Capacity.
 *
 * Probes candidate amounts against an injected evaluator within a strict probe budget (hard ceiling <= 10).
 *
 * Guarantees and Rules:
 * 1. Probes full requestedAmountRaw first. If it passes, returns FULLY_WITHIN_BOUNDARY immediately (1 probe).
 * 2. If full amount fails, performs geometric reduction (integer halving) to locate a passing candidate.
 * 3. Once a passing candidate is found, refines the bracket between highest observed pass and lowest observed fail above it using integer midpoints.
 *    Midpoint refinement is a candidate discovery heuristic only; correctness does NOT depend on monotonicity.
 * 4. The algorithm guarantees returning the highest ACTUALLY OBSERVED passing candidate within the search budget.
 *    It does NOT claim to find a global maximum or infer unsampled amounts.
 * 5. Every candidate considered verified must have actually been evaluated (no interpolation).
 * 6. Evaluator output is validated: candidate.amountRaw MUST strictly match the probed amountRaw. Mismatches fail closed.
 * 7. Search budget cannot be overridden above 10. Any maxProbes > 10, <= 0, or non-integer is rejected.
 * 8. Uses strict bigint integer arithmetic (no floating-point money amounts).
 */
export async function searchBoundaryCapacity(
  input: SearchBoundaryCapacityInput
): Promise<BoundaryCapacityResult> {
  const {
    side,
    requestedAmountRaw,
    requestedAmountDisplay,
    evaluator,
    maxProbes = DEFAULT_MAX_PROBES,
  } = input;

  if (requestedAmountRaw <= 0n) {
    throw new Error("Requested raw amount must be a positive integer");
  }
  if (
    typeof maxProbes !== "number" ||
    !Number.isInteger(maxProbes) ||
    maxProbes <= 0 ||
    maxProbes > MAX_ALLOWED_PROBES
  ) {
    throw new Error(
      `Max probes must be an integer between 1 and ${MAX_ALLOWED_PROBES}`
    );
  }

  const observedMap = new Map<bigint, BoundaryCapacityCandidate>();
  let probeCount = 0;

  async function probe(amount: bigint): Promise<BoundaryCapacityCandidate> {
    if (probeCount >= maxProbes) {
      throw new Error("Probe budget exceeded");
    }
    if (observedMap.has(amount)) {
      return observedMap.get(amount)!;
    }
    probeCount++;
    const candidate = await evaluator(amount);
    if (!candidate || typeof candidate !== "object") {
      throw new Error(`Evaluator returned invalid candidate for amount ${amount}`);
    }
    if (candidate.amountRaw !== amount) {
      throw new Error(
        `Evaluator returned candidate amountRaw ${candidate.amountRaw} which does not match probed amount ${amount}`
      );
    }
    observedMap.set(amount, candidate);
    return candidate;
  }

  // 1. Full amount probe first
  const requestedCandidate = await probe(requestedAmountRaw);

  if (requestedCandidate.withinBoundary) {
    return {
      side,
      requestedAmountRaw,
      requestedAmountDisplay,
      requestedCandidate,
      verifiedCapacityCandidate: requestedCandidate,
      observedCandidates: [requestedCandidate],
      probeCount,
      status: "FULLY_WITHIN_BOUNDARY",
    };
  }

  // 2. Full amount failed; geometric reduction (integer halving) to find a passing region
  let nextAmount = requestedAmountRaw / 2n;
  while (nextAmount >= 1n && probeCount < maxProbes) {
    if (observedMap.has(nextAmount)) {
      break;
    }
    const c = await probe(nextAmount);
    if (c.withinBoundary) {
      break;
    }
    nextAmount = nextAmount / 2n;
  }

  // 3. Bracket refinement via integer midpoints
  while (probeCount < maxProbes) {
    const observedList = Array.from(observedMap.values());
    const passing = observedList.filter((c) => c.withinBoundary);
    if (passing.length === 0) {
      break;
    }

    const highestPass = passing.reduce((max, c) =>
      c.amountRaw > max.amountRaw ? c : max
    );

    const failingAbove = observedList.filter(
      (c) => !c.withinBoundary && c.amountRaw > highestPass.amountRaw
    );
    if (failingAbove.length === 0) {
      break;
    }

    const lowestFailAbove = failingAbove.reduce((min, c) =>
      c.amountRaw < min.amountRaw ? c : min
    );

    const mid =
      highestPass.amountRaw +
      (lowestFailAbove.amountRaw - highestPass.amountRaw) / 2n;

    if (
      mid <= highestPass.amountRaw ||
      mid >= lowestFailAbove.amountRaw ||
      observedMap.has(mid)
    ) {
      break;
    }

    await probe(mid);
  }

  // 4. Formulate verified capacity result
  const allObserved = Array.from(observedMap.values());
  const passingObserved = allObserved.filter((c) => c.withinBoundary);

  const highestPassingCandidate =
    passingObserved.length > 0
      ? passingObserved.reduce((max, c) =>
          c.amountRaw > max.amountRaw ? c : max
        )
      : null;

  return {
    side,
    requestedAmountRaw,
    requestedAmountDisplay,
    requestedCandidate,
    verifiedCapacityCandidate: highestPassingCandidate,
    observedCandidates: allObserved,
    probeCount,
    status:
      highestPassingCandidate !== null
        ? "PARTIALLY_WITHIN_BOUNDARY"
        : "NO_VERIFIED_CAPACITY",
  };
}
