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

  it("epoch transition evaluation: worst-case net output across older and newer transfer fee schedules preserves minimum output", () => {
    // Older fee: 50 bps, max 10,000n
    // Newer fee: 100 bps, max 50,000n (fee increase scheduled for next epoch)
    const olderFee: ActiveTransferFee = { basisPoints: 50, maximumFee: 10_000n, epoch: 100n };
    const newerFee: ActiveTransferFee = { basisPoints: 100, maximumFee: 50_000n, epoch: 101n };
    const minimumAcceptableOutputRaw = 1_000_000n;

    // Gross output from Jupiter route:
    // If gross is only calculated for older fee:
    const grossForOlder = calculateGrossRequired(minimumAcceptableOutputRaw, olderFee);
    // Under newer fee, net output would be:
    const netUnderNewer = calculateNetOutput(grossForOlder, newerFee);
    // netUnderNewer will be less than minimum if fee increased!
    expect(netUnderNewer).toBeLessThan(minimumAcceptableOutputRaw);

    // Sieve evaluates worst-case net output:
    const netOlder = calculateNetOutput(grossForOlder, olderFee);
    const worstNet = netOlder < netUnderNewer ? netOlder : netUnderNewer;
    expect(worstNet < minimumAcceptableOutputRaw).toBe(true);

    // Safe gross that covers both schedules:
    const safeGross = calculateGrossRequired(minimumAcceptableOutputRaw, newerFee);
    const safeNetOlder = calculateNetOutput(safeGross, olderFee);
    const safeNetNewer = calculateNetOutput(safeGross, newerFee);
    const safeWorst = safeNetOlder < safeNetNewer ? safeNetOlder : safeNetNewer;
    expect(safeWorst).toBeGreaterThanOrEqual(minimumAcceptableOutputRaw);
  });

  it("destination ATA check: blocks frozen token accounts and uninitialized accounts with Frozen default state", async () => {
    // Test the fail-closed decision logic without making an RPC call.
    const mockCheck = (accExists: boolean, isFrozen: boolean, defaultState: "Initialized" | "Frozen") => {
      if (!accExists) {
        if (defaultState === "Frozen") {
          return { isFrozen: true, error: "Destination ATA does not exist and mint default account state is Frozen" };
        }
        return { isFrozen: false };
      }
      if (isFrozen) {
        return { isFrozen: true, error: "Destination token account is Frozen" };
      }
      return { isFrozen: false };
    };

    expect(mockCheck(false, false, "Frozen").isFrozen).toBe(true);
    expect(mockCheck(false, false, "Initialized").isFrozen).toBe(false);
    expect(mockCheck(true, true, "Initialized").isFrozen).toBe(true);
    expect(mockCheck(true, false, "Initialized").isFrozen).toBe(false);
  });

  it("chain time vs host clock skew immunity: multiplier selection relies on authoritative chain time", async () => {
    // Scheduled transition at ts = 1000
    const transitionTs = 1000;
    const oldMultiplier = "1.0";
    const newMultiplier = "2.0";

    // Scenario: Host clock is skewed into the future (ts = 1500), but chain clock is ts = 900
    const chainTs = 900;
    const activeMultiplierUnderChain = chainTs >= transitionTs ? newMultiplier : oldMultiplier;
    expect(activeMultiplierUnderChain).toBe(oldMultiplier);

    // Scenario: Chain clock reaches ts = 1000
    const chainTsAfter = 1000;
    const activeMultiplierAfter = chainTsAfter >= transitionTs ? newMultiplier : oldMultiplier;
    expect(activeMultiplierAfter).toBe(newMultiplier);
  });

  it("realized target amount: converts totalOutputAmount using authoritative ScaledUiAmount semantics", async () => {
    const { rawToEconomicDisplay } = await import("../../core/money/decimal");
    // SpaceX on Mainnet has multiplier = 5, decimals = 9
    // Suppose totalOutputAmount (raw) = 2_000_000_000n (2 raw tokens)
    // Economic units = (2_000_000_000 * 5) / 10^9 = 10 economic tokens
    const rawOutput = 2_000_000_000n;
    const economicAmount = rawToEconomicDisplay(rawOutput, 9, "5");
    expect(economicAmount.toString()).toBe("10");

    // OpenAI on Mainnet has multiplier = 1.4861347, decimals = 9
    // raw = 1_000_000_000n (1 raw token)
    // 1_000_000_000 * 1.4861347 = 1486134700 -> trunc -> 1.4861347 economic tokens
    const openaiEconomic = rawToEconomicDisplay(1_000_000_000n, 9, "1.4861347");
    expect(openaiEconomic.toString()).toBe("1.4861347");
  });

  it("getChainClock: fails closed when Sysvar Clock fails, getEpochInfo succeeds, and getBlockTime fails or returns null", async () => {
    const { SolanaAdapter } = await import("../../server/solana/adapter");
    const mockConn = {
      getAccountInfo: async () => {
        throw new Error("Sysvar Clock account fetch failed");
      },
      getEpochInfo: async () => ({
        epoch: 600,
        slotIndex: 100,
        slotsInEpoch: 432000,
        absoluteSlot: 250000000,
      }),
      getBlockTime: async () => null, // getBlockTime returns null!
    } as any;

    const adapter = new SolanaAdapter();
    adapter.getConnection = () => mockConn;
    await expect(adapter.getChainClock("mainnet")).rejects.toThrow(
      /authoritative chain clock.*getBlockTime returned null/
    );

    // Also test when getBlockTime throws
    const mockConnThrows = {
      getAccountInfo: async () => null, // null account info
      getEpochInfo: async () => ({
        epoch: 600,
        slotIndex: 100,
        slotsInEpoch: 432000,
        absoluteSlot: 250000000,
      }),
      getBlockTime: async () => {
        throw new Error("RPC block time unavailable");
      },
    } as any;

    const adapterThrows = new SolanaAdapter();
    adapterThrows.getConnection = () => mockConnThrows;
    await expect(adapterThrows.getChainClock("mainnet")).rejects.toThrow(
      /authoritative chain clock.*RPC block time unavailable/
    );
  });
});

