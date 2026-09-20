import { describe, it, expect } from "vitest";
import { calculateNetOutput, calculateGrossRequired } from "../../server/solana/adapter";

describe("Token-2022 Transfer Fee Math (calculateNetOutput & calculateGrossRequired)", () => {
  it("0 bps: returns identical gross amount without deduction", () => {
    expect(calculateNetOutput(1_000_000n, 0, 0n)).toBe(1_000_000n);
    expect(calculateNetOutput(1_000_000n, 0, 10_000n)).toBe(1_000_000n);
    expect(calculateGrossRequired(1_000_000n, 0, 0n)).toBe(1_000_000n);
  });

  it("percentage fee below maximum: deducts exact percentage fee", () => {
    // 100 bps = 1.00%. Gross = 1,000,000. Fee = 10,000. Max fee = 50,000.
    // Fee (10,000) < Max fee (50,000) -> Net = 990,000
    const gross = 1_000_000n;
    const feeBps = 100;
    const maxFee = 50_000n;
    const net = calculateNetOutput(gross, feeBps, maxFee);
    expect(net).toBe(990_000n);
  });

  it("percentage fee exactly at maximum: deducts exact maximum fee", () => {
    // 100 bps = 1.00%. Gross = 1,000,000. Fee = 10,000. Max fee = 10,000.
    const gross = 1_000_000n;
    const feeBps = 100;
    const maxFee = 10_000n;
    const net = calculateNetOutput(gross, feeBps, maxFee);
    expect(net).toBe(990_000n);
  });

  it("percentage fee above maximum: caps fee at maximumFee", () => {
    // 100 bps = 1.00%. Gross = 2,000,000. Raw fee = 20,000. Max fee = 10,000.
    // Capped fee = 10,000 -> Net = 1,990,000
    const gross = 2_000_000n;
    const feeBps = 100;
    const maxFee = 10_000n;
    const net = calculateNetOutput(gross, feeBps, maxFee);
    expect(net).toBe(1_990_000n);
  });

  it("ceil rounding by one raw unit: rounds fee up to avoid under-withholding", () => {
    // Gross = 1n, feeBps = 1 (0.01%).
    // (1 * 1 + 9999) / 10000 = 10000 / 10000 = 1n.
    // Fee = 1n, Net = 0n.
    expect(calculateNetOutput(1n, 1, 0n)).toBe(0n);

    // Gross = 10,001n, feeBps = 100 (1%).
    // (10,001 * 100 + 9999) / 10000 = (1,000,100 + 9999) / 10000 = 1,010,099 / 10000 = 101n.
    // 1% of 10001 = 100.01 -> ceil rounds up to 101.
    // Net = 10,001 - 101 = 9,900n.
    expect(calculateNetOutput(10_001n, 100, 0n)).toBe(9_900n);
  });

  it("very small output: handles 0 and negative inputs safely", () => {
    expect(calculateNetOutput(0n, 100, 0n)).toBe(0n);
    expect(calculateNetOutput(-5n, 100, 0n)).toBe(-5n);
    expect(calculateGrossRequired(0n, 100, 0n)).toBe(0n);
  });

  it("exact Sieve minimum after fee: gross produces exactly the required minimum net output", () => {
    const minNet = 952_380n; // minimum target tokens needed
    const feeBps = 200; // 2.00%
    const maxFee = 50_000n;

    const grossRequired = calculateGrossRequired(minNet, feeBps, maxFee);
    const actualNet = calculateNetOutput(grossRequired, feeBps, maxFee);

    // Actual net must be >= minNet
    expect(actualNet).toBeGreaterThanOrEqual(minNet);
    // And exactly satisfies the boundary
    expect(actualNet).toBe(minNet);
  });

  it("one raw unit below Sieve minimum after fee: fails boundary check", () => {
    const minNet = 952_380n;
    const feeBps = 200;
    const maxFee = 50_000n;

    const grossRequired = calculateGrossRequired(minNet, feeBps, maxFee);
    const insufficientGross = grossRequired - 1n;
    const actualNet = calculateNetOutput(insufficientGross, feeBps, maxFee);

    // One unit below gross produces less than required net
    expect(actualNet).toBeLessThan(minNet);
  });

  it("build invariant: net(otherAmountThreshold) >= minimumAcceptableOutputRaw for fee-bearing mint", () => {
    const feeBps = 150; // 1.5% transfer fee
    const maxFee = 25_000n;
    const minimumAcceptableOutputRaw = 1_000_000n;

    // Suppose Jupiter slippage threshold (gross) is derived from route
    const grossThreshold = calculateGrossRequired(minimumAcceptableOutputRaw, feeBps, maxFee);
    const netThreshold = calculateNetOutput(grossThreshold, feeBps, maxFee);

    // Invariant: net(otherAmountThreshold) must be >= minimumAcceptableOutputRaw
    expect(netThreshold).toBeGreaterThanOrEqual(minimumAcceptableOutputRaw);

    // If gross threshold is even 1 unit too low, invariant is violated
    const looseGrossThreshold = grossThreshold - 1n;
    const looseNetThreshold = calculateNetOutput(looseGrossThreshold, feeBps, maxFee);
    expect(looseNetThreshold).toBeLessThan(minimumAcceptableOutputRaw);
  });
});
