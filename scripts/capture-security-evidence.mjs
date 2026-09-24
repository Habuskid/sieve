// Read-only public evidence capture. Never signs, simulates, submits or executes.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Keypair, PublicKey } from "@solana/web3.js";
import { inflateSync } from "node:zlib";
const dir = "docs/evidence/final-security";
await mkdir(dir, { recursive: true });
async function capture(name, url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  const body = await response.text();
  await writeFile(`${dir}/${name}`, body);
  console.log(JSON.stringify({ name, status: response.status, bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") }));
  return body;
}
const usdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const mint = "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF";
// Public fixture identity, never funded and never signed by this script.
const taker = Keypair.fromSeed(Uint8Array.from({ length: 32 }, (_, i) => i + 1)).publicKey.toBase58();
const jobs = [
  ["prestocks.json", "https://prestocks.com/api/prestocks"],
  ["prestocks-home.html", "https://prestocks.com"],
  ["jupiter-idl.ts", "https://raw.githubusercontent.com/jup-ag/instruction-parser/main/src/idl/jupiter.ts"],
  ["token-processor.rs", "https://raw.githubusercontent.com/solana-program/token-2022/main/program/src/processor.rs"],
  ["confidential-mod.rs", "https://raw.githubusercontent.com/solana-program/token-2022/main/interface/src/extension/confidential_transfer/mod.rs"],
];
if (process.argv.includes("--direct")) {
  const query = new URLSearchParams({ inputMint: usdc, outputMint: mint, amount: "1000000", taker, slippageBps: "50", dexes: "Meteora DLMM", maxAccounts: "32", onlyDirectRoutes: "true" });
  await capture("jupiter-dlmm-direct.json", `https://api.jup.ag/swap/v2/build?${query}`);
  await capture("dlmm-idl.json", "https://raw.githubusercontent.com/MeteoraAg/dlmm-sdk/main/idls/dlmm.json");
  process.exit(0);
}
if (process.argv.includes("--fixtures")) {
  const fixtureDir = "tests/fixtures/security";
  await mkdir(fixtureDir, { recursive: true });
  for (const name of ["jupiter-dlmm-direct.json", "route-accounts.json", "all-mints.json", "prestocks.json"]) {
    await writeFile(`${fixtureDir}/${name}`, await readFile(`${dir}/${name}`));
  }
  const idl = JSON.parse(await readFile(`${dir}/jupiter-onchain-idl.json`, "utf8"));
  const swap = idl.types.find(t => t.name === "Swap").type.variants;
  await writeFile(`${fixtureDir}/route-v2-definition.json`, JSON.stringify({ source: "Mainnet program-owned Anchor IDL C88XWfp26heEmDkmfSzeXP7Fd7GQJ2j9dDTUsyiZbUTa", sha256: "cf5b1abb503ba25caf3423a89e29c7aa127c44867fabe6a22e143c554d813b7d", instruction: idl.instructions.find(i => i.name === "route_v2"), types: idl.types.filter(t => ["RoutePlanStepV2", "RemainingAccountsInfo", "RemainingAccountsSlice"].includes(t.name)), swapVariant: { index: 75, ...swap[75] } }, null, 2));
  const assets = JSON.parse(await readFile(`${dir}/prestocks.json`, "utf8"));
  const provenance = [];
  for (const asset of assets) {
    const page = await readFile(`${dir}/prestocks-${asset.symbol.toLowerCase()}.html`, "utf8");
    if (!page.includes(`https://solscan.io/token/${asset.contract_address}`) || !page.includes(`splMint\\\":\\\"${asset.contract_address}`)) throw new Error(`Product-page identity unverified: ${asset.symbol}`);
    provenance.push({ symbol: asset.symbol, mint: asset.contract_address, page: `https://prestocks.com/${asset.symbol.toLowerCase()}`, sha256: createHash("sha256").update(page).digest("hex"), evidence: `Official product-page Solscan token link and embedded company.splMint both identify ${asset.contract_address}` });
  }
  await writeFile(`${fixtureDir}/asset-provenance.json`, JSON.stringify(provenance, null, 2));
  process.exit(0);
}
if (process.argv.includes("--route-accounts")) {
  const build = JSON.parse(await readFile(`${dir}/jupiter-dlmm-direct.json`, "utf8"));
  const addresses = [...new Set(build.swapInstruction.accounts.map(a => a.pubkey).concat(Object.keys(build.addressesByLookupTableAddress ?? {})))];
  const response = JSON.parse(await capture("route-accounts-rpc.json", "https://api.mainnet-beta.solana.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getMultipleAccounts", params: [addresses, { encoding: "base64", commitment: "finalized" }] }) }));
  await writeFile(`${dir}/route-accounts.json`, JSON.stringify({ slot: response.result.context.slot, accounts: Object.fromEntries(addresses.map((a, i) => [a, response.result.value[i]])) }, null, 2));
  process.exit(0);
}
if (process.argv.includes("--assets")) {
  const assets = JSON.parse(await readFile(`${dir}/prestocks.json`, "utf8"));
  for (const asset of assets) {
    const slug = asset.symbol.toLowerCase();
    await capture(`prestocks-${slug}.html`, `https://prestocks.com/${slug}`);
  }
  await capture("all-mints.json", "https://api.mainnet-beta.solana.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getMultipleAccounts", params: [assets.map(a => a.contract_address), { encoding: "base64", commitment: "finalized" }] }) });
  process.exit(0);
}
if (process.argv.includes("--onchain-idl")) {
  const program = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
  const [base] = PublicKey.findProgramAddressSync([], program);
  const address = await PublicKey.createWithSeed(base, "anchor:idl", program);
  const text = await capture("jupiter-onchain-idl-account.json", "https://api.mainnet-beta.solana.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [address.toBase58(), { encoding: "base64", commitment: "finalized" }] }) });
  const account = JSON.parse(text).result.value;
  if (account.owner !== program.toBase58()) throw new Error("IDL owner mismatch");
  const bytes = Buffer.from(account.data[0], "base64");
  const length = bytes.readUInt32LE(40);
  const idl = inflateSync(bytes.subarray(44, 44 + length));
  await writeFile(`${dir}/jupiter-onchain-idl.json`, idl);
  console.log({ address: address.toBase58(), authority: new PublicKey(bytes.subarray(8, 40)).toBase58(), sha256: createHash("sha256").update(idl).digest("hex") });
  process.exit(0);
}
if (process.argv.includes("--route-versions")) {
  for (const instructionVersion of ["V1", "V2"]) {
    const query = new URLSearchParams({ inputMint: usdc, outputMint: mint, amount: "1000000", taker, slippageBps: "50", instructionVersion, dexes: "Meteora DLMM" });
    await capture(`jupiter-dlmm-${instructionVersion}.json`, `https://api.jup.ag/swap/v2/build?${query}`);
  }
  process.exit(0);
}
if (process.argv.includes("--definitions")) {
  for (const [name, url] of [
    ["aggregator-v6.json", "https://raw.githubusercontent.com/jup-ag/jupiter-amm-implementation/main/idls/jupiter_aggregator_v6.json"],
    ["aggregator.json", "https://raw.githubusercontent.com/jup-ag/jupiter-amm-implementation/main/jupiter/idls/jupiter_aggregator.json"],
    ["dex-interfaces.json", "https://raw.githubusercontent.com/jup-ag/jupiter-amm-implementation/main/idls/jupiter_dex_interfaces.json"],
    ["prestocks-openai.html", "https://prestocks.com/openai"],
    ["prestocks-anduril.html", "https://prestocks.com/anduril"],
    ["confidential-fee-mod.rs", "https://raw.githubusercontent.com/solana-program/token-2022/main/interface/src/extension/confidential_transfer_fee/mod.rs"],
  ]) await capture(name, url);
  process.exit(0);
}
for (const [name, url] of jobs) await capture(name, url).catch((e) => console.log(name, e.name));
for (const endpoint of ["order", "build"]) {
  const query = new URLSearchParams({ inputMint: usdc, outputMint: mint, amount: "1000000", taker, slippageBps: "50", instructionVersion: "V2" });
  await capture(`jupiter-${endpoint}.json`, `https://api.jup.ag/swap/v2/${endpoint}?${query}`).catch((e) => console.log(endpoint, e.name));
}
await capture("openai-mint.json", "https://api.mainnet-beta.solana.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [mint, { encoding: "base64", commitment: "finalized" }] }) });
