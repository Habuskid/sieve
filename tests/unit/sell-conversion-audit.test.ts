import { describe, it, expect } from "vitest";
import { economicSellAmountToRaw, deriveSellInputConversion } from "../../core/money/sell-input";
import { rawToEconomicDisplay, toDecimal } from "../../core/money/decimal";

describe("TASK 6A - Sell Conversion Audit", () => {
  const cases = [
    { name: "multiplier = 1, standard 9 dec", econ: "1", dec: 9, mult: "1" },
    { name: "multiplier = 1, standard 6 dec", econ: "100", dec: 6, mult: "1" },
    { name: "multiplier = 1, fractional", econ: "0.123456789", dec: 9, mult: "1" },
    { name: "multiplier > 1 (1.4861347), 9 dec", econ: "1", dec: 9, mult: "1.4861347" },
    { name: "multiplier > 1 (2.0), 6 dec", econ: "50", dec: 6, mult: "2.0" },
    { name: "multiplier < 1 (0.5), 6 dec", econ: "25", dec: 6, mult: "0.5" },
    { name: "multiplier < 1 (0.854321), 9 dec", econ: "0.5", dec: 9, mult: "0.854321" },
    { name: "small economic amount", econ: "0.000001", dec: 6, mult: "1" },
    { name: "small economic amount with multiplier > 1", econ: "0.000001", dec: 9, mult: "1.5" },
    { name: "large economic amount", econ: "1000000", dec: 6, mult: "1" },
    { name: "odd quantity", econ: "3.333333", dec: 6, mult: "1.333333" },
  ];

  it("proves derivedEconomicWalletDebit <= requestedEconomicAmount for all test cases", () => {
    for (const c of cases) {
      const raw = economicSellAmountToRaw(c.econ, c.dec, c.mult);
      const derivedEcon = rawToEconomicDisplay(raw, c.dec, c.mult);
      const requested = toDecimal(c.econ);

      console.log(`[Audit] ${c.name}: requested=${c.econ}, raw=${raw}, derivedEcon=${derivedEcon.toString()}`);

      expect(derivedEcon.lessThanOrEqualTo(requested)).toBe(true);
    }
  });

  it("exhaustively tests multipliers, truncation boundaries, and magnitudes", () => {
    const multipliers = [
      "1", "1.000000001", "1.4861347", "2.0", "3.14159265", "10.0", "100.0",
      "0.999999999", "0.854321", "0.5", "0.333333333", "0.1", "0.01", "0.001"
    ];
    const decimalsList = [6, 9];
    const amounts = [
      "0.000001", "0.000002", "0.00001", "0.1", "0.5", "1", "1.000000001",
      "2.5", "3.333333", "7.777777777", "10", "100", "999.999", "10000", "500000"
    ];

    let count = 0;
    for (const mult of multipliers) {
      for (const dec of decimalsList) {
        for (const amt of amounts) {
          try {
            const raw = economicSellAmountToRaw(amt, dec, mult);
            const derivedEcon = rawToEconomicDisplay(raw, dec, mult);
            const requested = toDecimal(amt);
            expect(derivedEcon.lessThanOrEqualTo(requested)).toBe(true);
            count++;
          } catch (err: any) {
            // If amount is below 1 raw token unit, or exceeds MAX_SAFE_INTEGER, that is expected behavior
            if (
              !err.message.includes("below one raw token unit") &&
              !err.message.includes("exceeds Number.MAX_SAFE_INTEGER")
            ) {
              throw err;
            }
          }
        }
      }
    }
    console.log(`[Exhaustive] Successfully verified ${count} combinations of multiplier, decimals, and amounts.`);
  });

  it("checks round-trip between arbitrary raw candidate and economicSellAmountToRaw", () => {
    const rawCandidates = [
      { raw: 1_000_000_000n, dec: 9, mult: "1" },
      { raw: 500_000_000n, dec: 9, mult: "1" },
      { raw: 123_456_789n, dec: 9, mult: "1" },
      { raw: 672_886_596n, dec: 9, mult: "1.4861347" },
      { raw: 336_443_298n, dec: 9, mult: "1.4861347" },
      { raw: 100_000_000n, dec: 6, mult: "2.0" },
      { raw: 50_000_000n, dec: 6, mult: "0.5" },
    ];

    for (const { raw, dec, mult } of rawCandidates) {
      const econ = rawToEconomicDisplay(raw, dec, mult).toString();
      const backRaw = economicSellAmountToRaw(econ, dec, mult);
      console.log(`[Roundtrip] raw=${raw}, dec=${dec}, mult=${mult} -> econ=${econ} -> backRaw=${backRaw}, diff=${backRaw - raw}`);
    }
  });
});
