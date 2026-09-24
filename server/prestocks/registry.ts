// Reviewed independently of /api/prestocks against official product-page
// company.splMint + Solscan links, and finalized Mainnet program ownership.
// Evidence: tests/fixtures/security/asset-provenance.json and all-mints.json.
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const MAINNET_PRESTOCKS = [
  { id: "anduril", symbol: "ANDURIL", mint: "PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB" },
  { id: "anthropic", symbol: "ANTHROPIC", mint: "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw" },
  { id: "figureai", symbol: "FIGUREAI", mint: "PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd" },
  { id: "kalshi", symbol: "KALSHI", mint: "PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua" },
  { id: "neuralink", symbol: "NEURALINK", mint: "PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S" },
  { id: "openai", symbol: "OPENAI", mint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF" },
  { id: "polymarket", symbol: "POLYMARKET", mint: "Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP" },
  { id: "spacex", symbol: "SPACEX", mint: "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh" },
].map(asset => ({ ...asset, tokenProgram: TOKEN_2022, network: "mainnet" as const, provenance: `https://prestocks.com/${asset.id}` }));
export function canonicalPreStock(mint: string) { return MAINNET_PRESTOCKS.find(asset => asset.mint === mint); }
export function requireCanonicalPreStock(mint: string, symbol: string) {
  const asset = canonicalPreStock(mint);
  if (!asset || asset.symbol !== symbol) throw new Error("PreStocks identity does not match reviewed Mainnet registry");
  return asset;
}
