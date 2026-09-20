#!/usr/bin/env node
/**
 * Diagnostic Read-Only PreStocks Compatibility Check
 *
 * Fetches official PreStocks API (https://prestocks.com/api/prestocks),
 * resolves fresh on-chain metadata for every mint via Solana Mainnet RPC,
 * and reports PASS_SUPPORTED or BLOCKED_SAFE with detailed rationale.
 *
 * Sieve Security Guarantee:
 * Never signs, broadcasts, or spends funds. 100% read-only diagnostic.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  unpackMint,
  getExtensionTypes,
  ExtensionType,
  getTransferHook,
  getTransferFeeConfig,
} from "@solana/spl-token";

const PRESTOCKS_API_URL = "https://prestocks.com/api/prestocks";
const MAINNET_RPC_URL =
  process.env.SOLANA_MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com";

const BLOCKED_EXTENSIONS = new Map([
  [ExtensionType.NonTransferable, "NonTransferable tokens cannot be traded"],
  [ExtensionType.ScaledUiAmountConfig, "ScaledUiAmountConfig alters amount/UI multiplier"],
  [ExtensionType.InterestBearingConfig, "InterestBearingConfig mutates token balances continuously"],
  [ExtensionType.DefaultAccountState, "DefaultAccountState can freeze accounts by default"],
  [ExtensionType.PausableConfig, "PausableConfig allows authorities to freeze transfers arbitrarily"],
  [ExtensionType.PermanentDelegate, "PermanentDelegate allows third party to transfer/burn tokens"],
  [ExtensionType.ConfidentialTransferMint, "ConfidentialTransferMint obscures transfer amounts"],
  [ExtensionType.ConfidentialTransferFeeConfig, "ConfidentialTransferFeeConfig obscures fees"],
  [ExtensionType.PermissionedBurn, "PermissionedBurn alters burn authority semantics"],
]);

const ALLOWED_EXTENSIONS = new Set([
  ExtensionType.TransferFeeConfig,
  ExtensionType.MetadataPointer,
  ExtensionType.TokenMetadata,
  ExtensionType.GroupPointer,
  ExtensionType.TokenGroup,
  ExtensionType.GroupMemberPointer,
  ExtensionType.TokenGroupMember,
  ExtensionType.MintCloseAuthority,
]);

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

  console.log(`Found ${rawMarkets.length} markets on PreStocks. Resolving on-chain metadata...\n`);

  const connection = new Connection(MAINNET_RPC_URL, "confirmed");
  let currentEpoch = 0n;
  try {
    const epochInfo = await connection.getEpochInfo();
    currentEpoch = BigInt(epochInfo.epoch);
  } catch (err) {
    console.warn(`Warning: Could not fetch current epoch (${err.message}). Defaulting to 0.`);
  }

  const results = [];

  for (const item of rawMarkets) {
    const symbol = item.symbol || "UNKNOWN";
    const name = item.name || "Unknown Asset";
    const mintStr = item.contract_address;

    if (!mintStr) {
      results.push({
        symbol,
        name,
        mint: "N/A",
        decimals: "N/A",
        program: "N/A",
        extensions: "None",
        feeBps: "0",
        status: "BLOCKED_SAFE",
        reason: "Missing contract_address in API payload",
      });
      continue;
    }

    let pubkey;
    try {
      pubkey = new PublicKey(mintStr);
    } catch {
      results.push({
        symbol,
        name,
        mint: mintStr,
        decimals: "N/A",
        program: "N/A",
        extensions: "None",
        feeBps: "0",
        status: "BLOCKED_SAFE",
        reason: "Invalid Solana public key format",
      });
      continue;
    }

    try {
      const accountInfo = await connection.getAccountInfo(pubkey);
      if (!accountInfo) {
        results.push({
          symbol,
          name,
          mint: mintStr,
          decimals: "N/A",
          program: "N/A",
          extensions: "None",
          feeBps: "0",
          status: "BLOCKED_SAFE",
          reason: "Mint account does not exist on Mainnet",
        });
        continue;
      }

      const isToken = accountInfo.owner.equals(TOKEN_PROGRAM_ID);
      const isToken2022 = accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID);

      if (!isToken && !isToken2022) {
        results.push({
          symbol,
          name,
          mint: mintStr,
          decimals: "N/A",
          program: accountInfo.owner.toBase58(),
          extensions: "None",
          feeBps: "0",
          status: "BLOCKED_SAFE",
          reason: `Owned by unknown program: ${accountInfo.owner.toBase58()}`,
        });
        continue;
      }

      if (accountInfo.data.length < 82) {
        results.push({
          symbol,
          name,
          mint: mintStr,
          decimals: "N/A",
          program: isToken ? "SPL-Token" : "Token-2022",
          extensions: "None",
          feeBps: "0",
          status: "BLOCKED_SAFE",
          reason: `Account data too short (${accountInfo.data.length} bytes)`,
        });
        continue;
      }

      const sanitizedAccountInfo = {
        ...accountInfo,
        data: Uint8Array.from(accountInfo.data),
      };

      if (isToken) {
        const mintData = unpackMint(pubkey, sanitizedAccountInfo, TOKEN_PROGRAM_ID);
        results.push({
          symbol,
          name,
          mint: mintStr,
          decimals: mintData.decimals,
          program: "SPL-Token",
          extensions: "None",
          feeBps: "0",
          status: "PASS_SUPPORTED",
          reason: "Standard SPL Token mint without extensions",
        });
        continue;
      }

      // Token-2022 inspection
      const mintData = unpackMint(pubkey, sanitizedAccountInfo, TOKEN_2022_PROGRAM_ID);
      if (mintData.tlvData && typeof mintData.tlvData.readUInt16LE !== "function") {
        const view = new DataView(
          mintData.tlvData.buffer,
          mintData.tlvData.byteOffset,
          mintData.tlvData.byteLength
        );
        mintData.tlvData.readUInt16LE = (offset) => view.getUint16(offset, true);
      }
      const extensionTypes = getExtensionTypes(Buffer.from(mintData.tlvData));
      const extNames = extensionTypes.map((t) => ExtensionType[t] || `Type_${t}`);

      // Check blocked extensions
      let blockedReason = null;
      for (const ext of extensionTypes) {
        if (BLOCKED_EXTENSIONS.has(ext)) {
          blockedReason = BLOCKED_EXTENSIONS.get(ext);
          break;
        }
        if (ext === ExtensionType.TransferHook || ext === ExtensionType.TransferHookAccount) {
          const hook = getTransferHook(mintData);
          if (
            hook &&
            hook.programId &&
            !hook.programId.equals(PublicKey.default) &&
            hook.programId.toBase58() !== "11111111111111111111111111111111"
          ) {
            blockedReason = `Custom TransferHook program: ${hook.programId.toBase58()}`;
            break;
          }
        }
        if (!ALLOWED_EXTENSIONS.has(ext) && ext !== ExtensionType.TransferHook && ext !== ExtensionType.TransferHookAccount) {
          blockedReason = `Unclassified Token-2022 extension (type ${ext})`;
          break;
        }
      }

      if (blockedReason) {
        results.push({
          symbol,
          name,
          mint: mintStr,
          decimals: mintData.decimals,
          program: "Token-2022",
          extensions: extNames.join(", ") || "None",
          feeBps: "0",
          status: "BLOCKED_SAFE",
          reason: blockedReason,
        });
        continue;
      }

      // Check transfer fee config
      let feeBps = 0;
      if (extensionTypes.includes(ExtensionType.TransferFeeConfig)) {
        const feeConfig = getTransferFeeConfig(mintData);
        if (feeConfig) {
          if (currentEpoch >= feeConfig.newerTransferFee.epoch) {
            feeBps = feeConfig.newerTransferFee.transferFeeBasisPoints;
          } else {
            feeBps = feeConfig.olderTransferFee.transferFeeBasisPoints;
          }
        }
      }

      results.push({
        symbol,
        name,
        mint: mintStr,
        decimals: mintData.decimals,
        program: "Token-2022",
        extensions: extNames.join(", ") || "None",
        feeBps: `${feeBps} bps`,
        status: "PASS_SUPPORTED",
        reason: feeBps > 0 ? `Token-2022 with verified ${feeBps} bps transfer fee` : "Token-2022 with allowed extensions",
      });
    } catch (err) {
      // console.error(err.stack);
      results.push({
        symbol,
        name,
        mint: mintStr,
        decimals: "N/A",
        program: "N/A",
        extensions: "N/A",
        feeBps: "N/A",
        status: "BLOCKED_SAFE",
        reason: `RPC verification failed: ${err.message}`,
        stack: err.stack,
      });
    }
  }

  // Print results table
  console.log("| Symbol | Name | Mint | Dec | Program | Extensions | Fee | Status | Reason |");
  console.log("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |");
  for (const r of results) {
    const shortMint = r.mint.length > 12 ? `${r.mint.slice(0, 4)}...${r.mint.slice(-4)}` : r.mint;
    console.log(
      `| ${r.symbol} | ${r.name} | \`${shortMint}\` | ${r.decimals} | ${r.program} | ${r.extensions} | ${r.feeBps} | **${r.status}** | ${r.reason} |`
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

import { fileURLToPath } from "node:url";
import path from "node:path";

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  checkPreStocksCompatibility().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

export { checkPreStocksCompatibility };
