import { describe, it, expect } from "vitest";
import {
  calculateNetOutput,
  calculateGrossRequired,
  type ActiveTransferFee,
} from "../../server/solana/adapter";

describe("Token-2022 Transfer Fee Math (calculateNetOutput & calculateGrossRequired)", () => {
  it("transfer fee config absent (null): net equals gross, gross required equals net", () => {
    expect(calculateNetOutput(1_000_000n, null)).toBe(1_000_000n);
    expect(calculateGrossRequired(1_000_000n, null)).toBe(1_000_000n);
  });

  it("transfer fee basisPoints > 0 and maximumFee = 0: net equals gross (zero fee withheld)", () => {
    const feeConfig: ActiveTransferFee = { basisPoints: 100, maximumFee: 0n };
    expect(calculateNetOutput(1_000_000n, feeConfig)).toBe(1_000_000n);
    expect(calculateGrossRequired(1_000_000n, feeConfig)).toBe(1_000_000n);
  });

  it("transfer fee with zero basisPoints and nonzero cap: net equals gross (zero fee withheld)", () => {
    const feeConfig: ActiveTransferFee = { basisPoints: 0, maximumFee: 10_000n };
    expect(calculateNetOutput(1_000_000n, feeConfig)).toBe(1_000_000n);
    expect(calculateGrossRequired(1_000_000n, feeConfig)).toBe(1_000_000n);
  });

  it("transfer fee below cap: deducts exact percentage fee", () => {
    // 100 bps = 1.00%. Gross = 1,000,000. Fee = 10,000. Max fee = 50,000.
    // Fee (10,000) < Max fee (50,000) -> Net = 990,000
    const feeConfig: ActiveTransferFee = { basisPoints: 100, maximumFee: 50_000n };
    const gross = 1_000_000n;
    const net = calculateNetOutput(gross, feeConfig);
    expect(net).toBe(990_000n);
    expect(calculateGrossRequired(net, feeConfig)).toBe(gross);
  });

  it("transfer fee exactly at cap: deducts exact maximum fee", () => {
    // 100 bps = 1.00%. Gross = 1,000,000. Fee = 10,000. Max fee = 10,000.
    const feeConfig: ActiveTransferFee = { basisPoints: 100, maximumFee: 10_000n };
    const gross = 1_000_000n;
    const net = calculateNetOutput(gross, feeConfig);
    expect(net).toBe(990_000n);
    expect(calculateGrossRequired(net, feeConfig)).toBe(gross);
  });

  it("transfer fee above cap: caps fee at maximumFee", () => {
    // 100 bps = 1.00%. Gross = 2,000,000. Raw fee = 20,000. Max fee = 10,000.
    // Capped fee = 10,000 -> Net = 1,990,000
    const feeConfig: ActiveTransferFee = { basisPoints: 100, maximumFee: 10_000n };
    const gross = 2_000_000n;
    const net = calculateNetOutput(gross, feeConfig);
    expect(net).toBe(1_990_000n);
    expect(calculateGrossRequired(net, feeConfig)).toBe(gross);
  });

  it("ceil rounding by one raw unit: rounds fee up to avoid under-withholding", () => {
    // Gross = 10,001n, feeBps = 100 (1%), maxFee = 50,000n.
    // 1% of 10001 = 100.01 -> ceil rounds up to 101.
    // Net = 10,001 - 101 = 9,900n.
    const feeConfig: ActiveTransferFee = { basisPoints: 100, maximumFee: 50_000n };
    expect(calculateNetOutput(10_001n, feeConfig)).toBe(9_900n);
  });

  it("very small output: handles 0 and negative inputs safely", () => {
    const feeConfig: ActiveTransferFee = { basisPoints: 100, maximumFee: 50_000n };
    expect(calculateNetOutput(0n, feeConfig)).toBe(0n);
    expect(calculateNetOutput(-5n, feeConfig)).toBe(-5n);
    expect(calculateGrossRequired(0n, feeConfig)).toBe(0n);
  });

  it("exact Sieve minimum after fee: gross produces exactly the required minimum net output", () => {
    const minNet = 952_380n; // minimum target tokens needed
    const feeConfig: ActiveTransferFee = { basisPoints: 200, maximumFee: 50_000n }; // 2.00%

    const grossRequired = calculateGrossRequired(minNet, feeConfig);
    const actualNet = calculateNetOutput(grossRequired, feeConfig);

    // Actual net must be >= minNet
    expect(actualNet).toBeGreaterThanOrEqual(minNet);
    // And exactly satisfies the boundary
    expect(actualNet).toBe(minNet);
  });

  it("one raw unit below Sieve minimum after fee: fails boundary check", () => {
    const minNet = 952_380n;
    const feeConfig: ActiveTransferFee = { basisPoints: 200, maximumFee: 50_000n };

    const grossRequired = calculateGrossRequired(minNet, feeConfig);
    const insufficientGross = grossRequired - 1n;
    const actualNet = calculateNetOutput(insufficientGross, feeConfig);

    // One unit below gross produces less than required net
    expect(actualNet).toBeLessThan(minNet);
  });

  it("build invariant: net(otherAmountThreshold) >= minimumAcceptableOutputRaw for fee-bearing mint", () => {
    const feeConfig: ActiveTransferFee = { basisPoints: 150, maximumFee: 25_000n }; // 1.5% transfer fee
    const minimumAcceptableOutputRaw = 1_000_000n;

    // Suppose Jupiter slippage threshold (gross) is derived from route
    const grossThreshold = calculateGrossRequired(minimumAcceptableOutputRaw, feeConfig);
    const netThreshold = calculateNetOutput(grossThreshold, feeConfig);

    // Invariant: net(otherAmountThreshold) must be >= minimumAcceptableOutputRaw
    expect(netThreshold).toBeGreaterThanOrEqual(minimumAcceptableOutputRaw);

    // If gross threshold is even 1 unit too low, invariant is violated
    const looseGrossThreshold = grossThreshold - 1n;
    const looseNetThreshold = calculateNetOutput(looseGrossThreshold, feeConfig);
    expect(looseNetThreshold).toBeLessThan(minimumAcceptableOutputRaw);
  });
});
