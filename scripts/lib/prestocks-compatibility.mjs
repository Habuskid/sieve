import { ExtensionType } from "@solana/spl-token";

export async function auditPreStocksMarkets(rawMarkets, adapter) {
  const results = [];
  for (const item of rawMarkets) {
    const symbol = item.symbol || "UNKNOWN";
    const name = item.name || "Unknown Asset";
    const mint = item.contract_address;
    if (!mint) {
      results.push({ symbol, name, mint: "N/A", decimals: "N/A", program: "N/A", extensions: "None", feeBps: "0", multiplier: "1", status: "BLOCKED_SAFE", reason: "Missing contract_address in API payload" });
      continue;
    }
    try {
      const meta = await adapter.resolveMintMetadata(mint, "mainnet", { bypassCache: true });
      const extensions = meta.extensions.map((type) => ExtensionType[type] || `Type_${type}`).join(", ") || "None";
      const program = meta.programOwner === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" ? "Token-2022" : meta.programOwner === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" ? "SPL-Token" : meta.programOwner;
      results.push({ symbol, name, mint, decimals: meta.decimals, program, extensions, feeBps: `${meta.transferFeeBasisPoints} bps`, multiplier: meta.scaledUiAmount?.activeMultiplier ?? "1", status: "PASS_SUPPORTED", reason: `Production policy passed (fee: ${meta.transferFeeBasisPoints} bps, mult: ${meta.scaledUiAmount?.activeMultiplier ?? "1"})` });
    } catch (error) {
      results.push({ symbol, name, mint, decimals: "N/A", program: "N/A", extensions: "N/A", feeBps: "N/A", multiplier: "1", status: "BLOCKED_SAFE", reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}
