import { describe, expect, it } from "vitest";
import { classifyUnsignedOrderWalletBlocker } from "../helpers/live-wallet-blockers";

describe("live unsigned-order wallet blocker classification", () => {
  it.each([
    ["Missing associated token account", "Missing associated token account"],
    ["Jupiter failed to assemble transaction: Insufficient funds", "Insufficient wallet token balance"],
    [
      "not enough SOL for rent and transaction fees",
      "Insufficient SOL for transaction or account requirements",
    ],
    ["insufficient lamports for account requirements", "Insufficient SOL for transaction or account requirements"],
  ])("classifies an explicit wallet-state blocker: %s", (message, reason) => {
    expect(classifyUnsignedOrderWalletBlocker(new Error(message))).toEqual({ blocked: true, reason });
  });

  it.each([
    "Jupiter authentication failure (401)",
    "Jupiter /order build error (400): malformed request",
    "Jupiter /order build schema mismatch",
    "NO_ROUTE: No routes found",
    "Jupiter /order build error (500): internal server error",
    "invalid mint",
    "minimum-output invariant mismatch",
  ])("fails closed for a non-wallet Jupiter error: %s", (message) => {
    expect(classifyUnsignedOrderWalletBlocker(new Error(message))).toEqual({ blocked: false });
  });
});
