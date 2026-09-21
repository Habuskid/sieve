import { describe, it, expect } from "vitest";
import {
  searchBoundaryCapacity,
  DEFAULT_MAX_PROBES,
  type BoundaryCapacityCandidate,
  type CandidateEvaluator,
} from "../../core";

describe("Boundary Capacity Pure Domain & Search (Task 4)", () => {
  // Helper to create a simple mock evaluator based on a threshold or lookup map
  function createThresholdEvaluator(passThreshold: bigint): {
    evaluator: CandidateEvaluator;
    calls: bigint[];
  } {
    const calls: bigint[] = [];
    const evaluator: CandidateEvaluator = async (amountRaw: bigint) => {
      calls.push(amountRaw);
      return {
        amountRaw,
        amountDisplay: amountRaw.toString(),
        effectiveExecutionPrice: "100.00",
        withinBoundary: amountRaw <= passThreshold,
      };
    };
    return { evaluator, calls };
  }

  function createMapEvaluator(responses: Record<string, boolean>): {
    evaluator: CandidateEvaluator;
    calls: bigint[];
  } {
    const calls: bigint[] = [];
    const evaluator: CandidateEvaluator = async (amountRaw: bigint) => {
      calls.push(amountRaw);
      const withinBoundary = responses[amountRaw.toString()] ?? false;
      return {
        amountRaw,
        amountDisplay: amountRaw.toString(),
        effectiveExecutionPrice: "100.00",
        withinBoundary,
      };
    };
    return { evaluator, calls };
  }

  // 1. FULL AMOUNT PASS
  it("1. full amount passes immediately with 1 probe", async () => {
    const { evaluator, calls } = createThresholdEvaluator(1000n);
    const result = await searchBoundaryCapacity({
      side: "BUY",
      requestedAmountRaw: 1000n,
      requestedAmountDisplay: "1000",
      evaluator,
    });

    expect(result.status).toBe("FULLY_WITHIN_BOUNDARY");
    expect(result.probeCount).toBe(1);
    expect(calls).toEqual([1000n]);
    expect(result.verifiedCapacityCandidate).not.toBeNull();
    expect(result.verifiedCapacityCandidate?.amountRaw).toBe(1000n);
    expect(result.verifiedCapacityCandidate?.withinBoundary).toBe(true);
    expect(result.observedCandidates).toHaveLength(1);
  });

  // 2. FULL FAIL / SMALLER PASS
  it("2. full amount fails and smaller passing candidate is refined", async () => {
    const { evaluator, calls } = createThresholdEvaluator(500n);
    const result = await searchBoundaryCapacity({
      side: "BUY",
      requestedAmountRaw: 1000n,
      requestedAmountDisplay: "1000",
      evaluator,
    });

    expect(result.status).toBe("PARTIALLY_WITHIN_BOUNDARY");
    expect(result.verifiedCapacityCandidate).not.toBeNull();
    expect(result.verifiedCapacityCandidate?.amountRaw).toBeLessThanOrEqual(1000n);
    expect(result.verifiedCapacityCandidate?.amountRaw).toBe(500n);
    expect(result.verifiedCapacityCandidate?.withinBoundary).toBe(true);
    expect(calls).toContain(result.verifiedCapacityCandidate?.amountRaw);
  });

  // 3. NOTHING PASSES
  it("3. returns NO_VERIFIED_CAPACITY when no candidate passes", async () => {
    const { evaluator, calls } = createThresholdEvaluator(0n); // nothing <= 0n will pass for positive amounts
    const result = await searchBoundaryCapacity({
      side: "BUY",
      requestedAmountRaw: 1000n,
      evaluator,
    });

    expect(result.status).toBe("NO_VERIFIED_CAPACITY");
    expect(result.verifiedCapacityCandidate).toBeNull();
    expect(result.observedCandidates.every((c) => !c.withinBoundary)).toBe(true);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.length).toBeLessThanOrEqual(DEFAULT_MAX_PROBES);
  });

  // 4. PROBE BUDGET
  it("4. evaluator invocation count never exceeds max probe budget (10)", async () => {
    // Threshold set to trigger extensive midpoint exploration
    const { evaluator, calls } = createThresholdEvaluator(537n);
    const result = await searchBoundaryCapacity({
      side: "BUY",
      requestedAmountRaw: 10000n,
      evaluator,
      maxProbes: 10,
    });

    expect(result.probeCount).toBeLessThanOrEqual(10);
    expect(calls.length).toBeLessThanOrEqual(10);
  });

  // 5. NO DUPLICATE PROBES
  it("5. every probed raw amount is strictly unique", async () => {
    const { evaluator, calls } = createThresholdEvaluator(732n);
    await searchBoundaryCapacity({
      side: "SELL",
      requestedAmountRaw: 2048n,
      evaluator,
    });

    const uniqueCalls = new Set(calls.map((c) => c.toString()));
    expect(uniqueCalls.size).toBe(calls.length);
  });

  // 6. NEVER ABOVE REQUEST
  it("6. every probed amount is less than or equal to requested amount", async () => {
    const requested = 1500n;
    const { evaluator, calls } = createThresholdEvaluator(800n);
    await searchBoundaryCapacity({
      side: "BUY",
      requestedAmountRaw: requested,
      evaluator,
    });

    for (const call of calls) {
      expect(call).toBeLessThanOrEqual(requested);
    }
  });

  // 7. NEVER ZERO
  it("7. every probed amount is at least 1 atomic unit (never zero or negative)", async () => {
    const { evaluator, calls } = createThresholdEvaluator(0n);
    await searchBoundaryCapacity({
      side: "SELL",
      requestedAmountRaw: 16n,
      evaluator,
    });

    for (const call of calls) {
      expect(call).toBeGreaterThanOrEqual(1n);
    }
  });

  // 8. OBSERVED ONLY
  it("8. verified capacity was actually evaluated and exists in call history", async () => {
    const { evaluator, calls } = createThresholdEvaluator(600n);
    const result = await searchBoundaryCapacity({
      side: "BUY",
      requestedAmountRaw: 1000n,
      evaluator,
    });

    expect(result.verifiedCapacityCandidate).not.toBeNull();
    const capacityRaw = result.verifiedCapacityCandidate!.amountRaw;
    expect(calls).toContain(capacityRaw);

    const matchInObserved = result.observedCandidates.find(
      (c) => c.amountRaw === capacityRaw
    );
    expect(matchInObserved).toBeDefined();
    expect(matchInObserved?.withinBoundary).toBe(true);
  });

  // 9. INTEGER MIDPOINT
  it("9. uses deterministic integer arithmetic for odd bigint bounds", async () => {
    // 1n and 4n -> midpoint 1n + (4n - 1n)/2n = 2n
    const { evaluator, calls } = createMapEvaluator({
      "5": false, // requested fails
      "2": true,  // 5/2 = 2 passes
      "3": false, // midpoint between 2 and 5: 2 + 3/2 = 3 fails
      "4": false, // midpoint between 2 and 3? (3-2)/2 = 0, stops
    });

    const result = await searchBoundaryCapacity({
      side: "BUY",
      requestedAmountRaw: 5n,
      evaluator,
    });

    expect(result.status).toBe("PARTIALLY_WITHIN_BOUNDARY");
    expect(result.verifiedCapacityCandidate?.amountRaw).toBe(2n);
    expect(calls).toEqual([5n, 2n, 3n]);
  });

  // 10. NON-MONOTONIC
  it("10a. handles non-monotonic sequence from prompt without throwing and selects highest observed PASS", async () => {
    // Prompt pattern:
    // 1000 FAIL
    // 500 PASS
    // 750 FAIL
    // 625 FAIL
    // 562 PASS
    // 593 FAIL
    // 577 PASS
    // 585 FAIL
    // 581 PASS
    // 583 FAIL (probe 10)
    const responses: Record<string, boolean> = {
      "1000": false,
      "500": true,
      "750": false,
      "625": false,
      "562": true,
      "593": false,
      "577": true,
      "585": false,
      "581": true,
      "583": false,
    };

    const { evaluator, calls } = createMapEvaluator(responses);
    const result = await searchBoundaryCapacity({
      side: "BUY",
      requestedAmountRaw: 1000n,
      evaluator,
    });

    expect(result.probeCount).toBe(10);
    expect(calls).toEqual([
      1000n,
      500n,
      750n,
      625n,
      562n,
      593n,
      577n,
      585n,
      581n,
      583n,
    ]);
    expect(result.status).toBe("PARTIALLY_WITHIN_BOUNDARY");
    // Highest observed passing candidate is 581n
    expect(result.verifiedCapacityCandidate?.amountRaw).toBe(581n);
    expect(result.verifiedCapacityCandidate?.withinBoundary).toBe(true);
  });

  it("10b. handles non-monotonic case where a larger candidate unexpectedly passes after a smaller fails", async () => {
    // 1000 FAIL -> 500 FAIL -> 250 PASS -> mid 375 FAIL -> mid 312 PASS -> mid 343 PASS
    const responses: Record<string, boolean> = {
      "1000": false,
      "500": false,
      "250": true,
      "375": false, // 375 fails
      "312": true,  // 312 passes
      "343": true,  // 343 passes (unexpectedly passes closer to 375)
    };

    const { evaluator } = createMapEvaluator(responses);
    const result = await searchBoundaryCapacity({
      side: "BUY",
      requestedAmountRaw: 1000n,
      evaluator,
    });

    expect(result.verifiedCapacityCandidate?.amountRaw).toBe(343n);
    expect(result.verifiedCapacityCandidate?.withinBoundary).toBe(true);
  });

  // 11. ONE-ATOMIC-UNIT REQUEST
  it("11. handles 1n request correctly for both PASS and FAIL", async () => {
    // Case A: 1n passes
    {
      const { evaluator, calls } = createThresholdEvaluator(1n);
      const res = await searchBoundaryCapacity({
        side: "BUY",
        requestedAmountRaw: 1n,
        evaluator,
      });
      expect(res.status).toBe("FULLY_WITHIN_BOUNDARY");
      expect(res.verifiedCapacityCandidate?.amountRaw).toBe(1n);
      expect(res.probeCount).toBe(1);
      expect(calls).toEqual([1n]);
    }

    // Case B: 1n fails
    {
      const { evaluator, calls } = createThresholdEvaluator(0n);
      const res = await searchBoundaryCapacity({
        side: "BUY",
        requestedAmountRaw: 1n,
        evaluator,
      });
      expect(res.status).toBe("NO_VERIFIED_CAPACITY");
      expect(res.verifiedCapacityCandidate).toBeNull();
      expect(res.probeCount).toBe(1);
      expect(calls).toEqual([1n]);
    }
  });

  // 12. VERY LARGE RAW VALUE
  it("12. handles values exceeding Number.MAX_SAFE_INTEGER without precision loss", async () => {
    // 10^25 is much larger than Number.MAX_SAFE_INTEGER (~9 * 10^15)
    const largeAmount = 10_000_000_000_000_000_000_000_000n;
    const threshold = 6_000_000_000_000_000_000_000_000n;

    const { evaluator, calls } = createThresholdEvaluator(threshold);
    const result = await searchBoundaryCapacity({
      side: "BUY",
      requestedAmountRaw: largeAmount,
      evaluator,
    });

    expect(result.status).toBe("PARTIALLY_WITHIN_BOUNDARY");
    expect(result.verifiedCapacityCandidate).not.toBeNull();
    expect(result.verifiedCapacityCandidate!.amountRaw).toBeLessThanOrEqual(threshold);
    expect(result.verifiedCapacityCandidate!.amountRaw).toBeGreaterThan(0n);

    // Verify all probed values remained pure bigints
    for (const call of calls) {
      expect(typeof call).toBe("bigint");
    }
  });

  // 13. INVALID INPUT
  it("13. rejects 0, negative amounts, and non-positive maxProbes", async () => {
    const dummyEvaluator: CandidateEvaluator = async (amt) => ({
      amountRaw: amt,
      withinBoundary: true,
    });

    await expect(
      searchBoundaryCapacity({
        side: "BUY",
        requestedAmountRaw: 0n,
        evaluator: dummyEvaluator,
      })
    ).rejects.toThrow(/Requested raw amount must be a positive integer/);

    await expect(
      searchBoundaryCapacity({
        side: "BUY",
        requestedAmountRaw: -100n,
        evaluator: dummyEvaluator,
      })
    ).rejects.toThrow(/Requested raw amount must be a positive integer/);

    await expect(
      searchBoundaryCapacity({
        side: "BUY",
        requestedAmountRaw: 100n,
        evaluator: dummyEvaluator,
        maxProbes: 0,
      })
    ).rejects.toThrow(/Max probes must be an integer between 1 and 10/);

    await expect(
      searchBoundaryCapacity({
        side: "BUY",
        requestedAmountRaw: 100n,
        evaluator: dummyEvaluator,
        maxProbes: -5,
      })
    ).rejects.toThrow(/Max probes must be an integer between 1 and 10/);

    await expect(
      searchBoundaryCapacity({
        side: "BUY",
        requestedAmountRaw: 100n,
        evaluator: dummyEvaluator,
        maxProbes: 11,
      })
    ).rejects.toThrow(/Max probes must be an integer between 1 and 10/);

    await expect(
      searchBoundaryCapacity({
        side: "BUY",
        requestedAmountRaw: 100n,
        evaluator: dummyEvaluator,
        maxProbes: 100,
      })
    ).rejects.toThrow(/Max probes must be an integer between 1 and 10/);

    await expect(
      searchBoundaryCapacity({
        side: "BUY",
        requestedAmountRaw: 100n,
        evaluator: dummyEvaluator,
        maxProbes: Number.MAX_SAFE_INTEGER,
      })
    ).rejects.toThrow(/Max probes must be an integer between 1 and 10/);

    await expect(
      searchBoundaryCapacity({
        side: "BUY",
        requestedAmountRaw: 100n,
        evaluator: dummyEvaluator,
        maxProbes: 5.5,
      })
    ).rejects.toThrow(/Max probes must be an integer between 1 and 10/);

    await expect(
      searchBoundaryCapacity({
        side: "BUY",
        requestedAmountRaw: 100n,
        evaluator: dummyEvaluator,
        maxProbes: Number.NaN,
      })
    ).rejects.toThrow(/Max probes must be an integer between 1 and 10/);

    await expect(
      searchBoundaryCapacity({
        side: "BUY",
        requestedAmountRaw: 100n,
        evaluator: dummyEvaluator,
        maxProbes: Infinity,
      })
    ).rejects.toThrow(/Max probes must be an integer between 1 and 10/);
  });

  // 14. DETERMINISTIC SEQUENCE
  it("14. produces identical probe sequence across multiple runs with identical inputs", async () => {
    const run1 = createThresholdEvaluator(620n);
    const result1 = await searchBoundaryCapacity({
      side: "BUY",
      requestedAmountRaw: 1000n,
      evaluator: run1.evaluator,
    });

    const run2 = createThresholdEvaluator(620n);
    const result2 = await searchBoundaryCapacity({
      side: "BUY",
      requestedAmountRaw: 1000n,
      evaluator: run2.evaluator,
    });

    expect(run1.calls).toEqual(run2.calls);
    expect(result1.probeCount).toBe(result2.probeCount);
    expect(result1.status).toBe(result2.status);
    expect(result1.verifiedCapacityCandidate?.amountRaw).toBe(
      result2.verifiedCapacityCandidate?.amountRaw
    );
  });

  // 15. PROBE IDENTITY INTEGRITY (TASK 4A)
  it("15. fails closed when evaluator returns a candidate with mismatched amountRaw", async () => {
    // Evaluator intentionally substitutes amountRaw: 600n when probed with 500n
    const rogueEvaluator: CandidateEvaluator = async (amt: bigint) => {
      if (amt === 500n) {
        return {
          amountRaw: 600n, // MISMATCH!
          withinBoundary: true,
        };
      }
      return {
        amountRaw: amt,
        withinBoundary: false,
      };
    };

    let searchFailed = false;
    try {
      await searchBoundaryCapacity({
        side: "BUY",
        requestedAmountRaw: 1000n,
        evaluator: rogueEvaluator,
      });
    } catch (err) {
      searchFailed = true;
      expect((err as Error).message).toMatch(
        /Evaluator returned candidate amountRaw 600 which does not match probed amount 500/
      );
    }

    expect(searchFailed).toBe(true);
  });
});

