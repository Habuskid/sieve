#!/usr/bin/env node
/**
 * Diagnostic Read-Only PreStocks Compatibility Check
 *
 * Uses Sieve's production SolanaAdapter.resolveMintMetadata directly to verify
 * all live PreStocks assets against production Token-2022 policy.
 *
 * Sieve Security Guarantee:
 * Never signs, broadcasts, or spends funds. 100% read-only diagnostic.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { auditPreStocksMarkets } from "./lib/prestocks-compatibility.mjs";

let SolanaAdapter;
let defaultSolanaAdapter;

try {
  const adapterModule = await import("../server/solana/adapter.ts");
  SolanaAdapter = adapterModule.SolanaAdapter;
  defaultSolanaAdapter = adapterModule.defaultSolanaAdapter;
} catch (err) {
  if (err && err.code === "ERR_UNKNOWN_FILE_EXTENSION") {
    // Re-execute with tsx if executed directly under plain Node without TS loader
    const { spawnSync } = await import("node:child_process");
    const currentScript = fileURLToPath(import.meta.url);
    const result = spawnSync("pnpm", ["exec", "tsx", currentScript, ...process.argv.slice(2)], {
      stdio: "inherit",
      shell: true,
    });
    process.exit(result.status ?? 0);
  }
  throw err;
}

const PRESTOCKS_API_URL = "https://prestocks.com/api/prestocks";
const MAINNET_RPC_URL =
  process.env.SOLANA_MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com";

async function checkPreStocksCompatibility() {
  console.log("=== Sieve PreStocks Read-Only Compatibility Diagnostic ===");
  console.log(`Source API: ${PRESTOCKS_API_URL}`);
  console.log(`Solana RPC: ${MAINNET_RPC_URL}`);
  console.log(`Mode: 100% READ-ONLY (Zero signatures, Zero broadcasts, Zero fund movement)\n`);

  let rawMarkets;
  try {
    const res = await fetch(PRESTOCKS_API_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    rawMarkets = await res.json();
  } catch (err) {
    console.error(`Failed to fetch PreStocks markets: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(rawMarkets) || rawMarkets.length === 0) {
    console.error("PreStocks API returned empty or non-array data");
    process.exit(1);
  }

  console.log(`Found ${rawMarkets.length} markets on PreStocks. Resolving on-chain metadata via production policy...\n`);

  const adapter = defaultSolanaAdapter || new SolanaAdapter(MAINNET_RPC_URL);

  // Authoritative chain clock check (fail closed if unavailable)
  try {
    const chainClock = await adapter.getChainClock("mainnet");
    console.log(`Solana Cluster Chain Time: ${new Date(chainClock.unixTimestamp * 1000).toISOString()} (Slot: ${chainClock.slot}, Epoch: ${chainClock.epoch})\n`);
  } catch (clockErr) {
    console.error(`FATAL: Authoritative Solana chain time could not be determined: ${clockErr.message}`);
    process.exit(1);
  }

  const results = await auditPreStocksMarkets(rawMarkets, adapter);

  // Print results table with FULL mint addresses
  console.log("| Symbol | Name | Mint | Dec | Program | Extensions | Fee | Multiplier | Status | Reason |");
  console.log("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |");
  for (const r of results) {
    console.log(
      `| ${r.symbol} | ${r.name} | \`${r.mint}\` | ${r.decimals} | ${r.program} | ${r.extensions} | ${r.feeBps} | ${r.multiplier} | **${r.status}** | ${r.reason} |`
    );
  }

  const passCount = results.filter((r) => r.status === "PASS_SUPPORTED").length;
  const blockedCount = results.filter((r) => r.status === "BLOCKED_SAFE").length;

  console.log("\n=== Compatibility Summary ===");
  console.log(`Total Markets Checked : ${results.length}`);
  console.log(`PASS_SUPPORTED        : ${passCount}`);
  console.log(`BLOCKED_SAFE          : ${blockedCount}`);
  console.log("=============================\n");

  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  checkPreStocksCompatibility().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

export { checkPreStocksCompatibility };
