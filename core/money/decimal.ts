import Decimal from "decimal.js";

// Configure Decimal for financial precision
Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -20,
  toExpPos: 40,
});

export { Decimal };

export function toDecimal(value: string | number | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  try {
    const d = new Decimal(value);
    if (!d.isFinite()) {
      throw new Error(`Invalid decimal value: ${value}`);
    }
    return d;
  } catch (err) {
    throw new Error(`Failed to parse decimal: ${value} (${err instanceof Error ? err.message : String(err)})`);
  }
}

/**
 * Converts a raw integer token amount (e.g. 1000000n) into human-readable Decimal using token decimals.
 */
export function rawToDisplay(raw: bigint | string, decimals: number): Decimal {
  const rawStr = typeof raw === "bigint" ? raw.toString() : raw;
  const rawDec = new Decimal(rawStr);
  const factor = new Decimal(10).pow(decimals);
  return rawDec.div(factor);
}

/**
 * Converts a human-readable Decimal token amount into raw bigint using token decimals.
 * Uses floor rounding by default for safety in output calculations.
 */
export function displayToRaw(
  display: Decimal | string | number,
  decimals: number,
  roundingMode: Decimal.Rounding = Decimal.ROUND_FLOOR
): bigint {
  const d = toDecimal(display);
  const factor = new Decimal(10).pow(decimals);
  const rawDec = d.mul(factor).toDecimalPlaces(0, roundingMode);
  return BigInt(rawDec.toFixed(0));
}

/**
 * Converts percentage string/number (e.g. "5" or "5.5" for 5.5%) into basis points integer (e.g. 550).
 */
export function pctToBps(pct: string | number | Decimal): number {
  const d = toDecimal(pct);
  return d.mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Converts basis points integer (e.g. 500) into percentage string (e.g. "5.00").
 */
export function bpsToPct(bps: number, decimals: number = 2): string {
  const d = new Decimal(bps).div(100);
  return d.toFixed(decimals);
}

/**
 * Validates that an input is a positive finite decimal.
 */
export function isPositiveFinite(value: string | number | Decimal): boolean {
  try {
    const d = toDecimal(value);
    return d.isFinite() && d.greaterThan(0);
  } catch {
    return false;
  }
}

/**
 * Formats a decimal as standard USD currency string without symbol (e.g. "1,234.56").
 */
export function formatUsd(value: Decimal | string | number, decimalPlaces: number = 2): string {
  const d = toDecimal(value);
  const parts = d.toFixed(decimalPlaces).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

/**
 * Formats a decimal as percentage string (e.g. "+5.25%" or "-2.10%").
 */
export function formatPct(value: Decimal | string | number, decimalPlaces: number = 2, showPlus: boolean = true): string {
  const d = toDecimal(value);
  const formatted = d.toFixed(decimalPlaces);
  if (showPlus && d.greaterThan(0)) {
    return `+${formatted}%`;
  }
  return `${formatted}%`;
}
