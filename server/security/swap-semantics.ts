import { AddressLookupTableAccount, AddressLookupTableProgram, ComputeBudgetProgram, PublicKey, SystemProgram, TransactionMessage, type AccountInfo, type Connection } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ExtensionType, getAccountLen, getAssociatedTokenAddressSync, getTransferFeeConfig, unpackAccount, unpackMint } from "@solana/spl-token";
import { decodeTransaction } from "./transaction-binding";
import { SieveAppError } from "../services/errors";

export const JUPITER_PROGRAM = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
export const DLMM_PROGRAM = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";
const MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const ROUTE_V2 = Buffer.from([187, 100, 250, 204, 49, 196, 175, 20]);
const LB_PAIR = Buffer.from([33, 11, 49, 98, 181, 101, 177, 13]);
const BIN_ARRAY = Buffer.from([92, 142, 92, 220, 5, 148, 70, 181]);
const BITMAP = Buffer.from([80, 111, 124, 113, 55, 237, 18, 5]);
const ORACLE = Buffer.from([139, 194, 131, 179, 140, 179, 229, 244]);
const MAX_PRIORITY_LAMPORTS = 100_000n;
export type SwapIntent = { wallet: string; inputMint: string; outputMint: string; inputRaw: bigint; minimumNetOutputRaw: bigint; side: "BUY" | "SELL" };
export type SemanticRpc = Pick<Connection, "getAccountInfo" | "getMultipleAccountsInfo" | "getFeeForMessage" | "getMinimumBalanceForRentExemption">;
function requireSafe(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new SieveAppError("ROUTE_RISK", `Transaction verification: ${reason}`);
}
const keyAt = (data: Buffer, offset: number) => new PublicKey(data.subarray(offset, offset + 32)).toBase58();
const eventAuthority = (program: string) => PublicKey.findProgramAddressSync([Buffer.from("__event_authority")], new PublicKey(program))[0].toBase58();

/** Explicitly supports only route_v2 / one MeteoraDlmmSwapV2 leg, no hooks.
 * Layout provenance: program-owned Jupiter IDL cf5b1abb..., Meteora SDK IDL
 * 045c0f4a... (captured fixtures/provenance). Unknown versions fail closed.
 */
export function decodeDirectDlmmRoute(data: Buffer) {
  requireSafe(data.length === 43 && data.subarray(0, 8).equals(ROUTE_V2), "unsupported swap instruction/version");
  requireSafe(data.readUInt16LE(26) === 0 && data.readUInt16LE(28) === 0, "platform/positive-slippage fees forbidden");
  requireSafe(data.readUInt32LE(30) === 1 && data[34] === 75, "requires one MeteoraDlmmSwapV2 leg");
  requireSafe(data.readUInt32LE(35) === 0, "remaining-account hooks forbidden");
  requireSafe(data.readUInt16LE(39) === 10000 && data[41] === 0 && data[42] === 1, "invalid route allocation/direction");
  const slippageBps = data.readUInt16LE(24);
  requireSafe(slippageBps <= 10000, "invalid slippage");
  const quotedOutput = data.readBigUInt64LE(16);
  // Lower bound under integer rounding: floor is conservative even where the
  // router uses quotedOutput - floor(quotedOutput * slippage / 10000).
  return { inputRaw: data.readBigUInt64LE(8), minimumGrossOutputRaw: quotedOutput * BigInt(10000 - slippageBps) / 10000n };
}

/** Rejects malformed TLVs; confidential mint presence is NOT confidential execution. */
export function extensionData(tlv: Buffer, type: number): Buffer | null {
  let found: Buffer | null = null;
  const seen = new Set<number>();
  for (let offset = 0; offset < tlv.length;) {
    if (tlv.subarray(offset).every((b) => b === 0)) break;
    requireSafe(offset + 4 <= tlv.length, "truncated extension header");
    const kind = tlv.readUInt16LE(offset), size = tlv.readUInt16LE(offset + 2);
    requireSafe(kind !== 0 && !seen.has(kind) && offset + 4 + size <= tlv.length, "invalid/duplicate extension");
    seen.add(kind);
    if (kind === type) found = tlv.subarray(offset + 4, offset + 4 + size);
    offset += 4 + size;
  }
  return found;
}
export function assertOrdinaryCredits(tlv: Buffer) {
  const confidential = extensionData(tlv, 5);
  // ConfidentialTransferAccount: approved(1), ElGamal(32), three ciphertexts
  // (3*64), decryptable(36), confidential flag(1), ordinary-credit flag(1),
  // four u64 counters(32) = 295 bytes. Official Token-2022 interface layout.
  if (confidential) requireSafe(confidential.length === 295 && confidential[262] === 1, "ordinary token credits disabled or malformed");
}
export function validateConfidentialMintForOrdinaryTransfers(tlv: Buffer) {
  const mint = extensionData(tlv, 4), config = extensionData(tlv, 16), fee = extensionData(tlv, 1);
  if (mint) requireSafe(mint.length === 65 && mint[32] <= 1, "invalid confidential mint config");
  if (config) requireSafe(config.length === 129 && config[64] <= 1 && mint && fee, "invalid confidential fee config/combination");
  if (mint && fee) requireSafe(config, "missing confidential fee config");
}

export async function resolveTransaction(base64: string, rpc: SemanticRpc) {
  const tx = decodeTransaction(base64);
  requireSafe(tx.version === 0, "only version 0 messages supported");
  const tables: AddressLookupTableAccount[] = [];
  for (const lookup of tx.message.addressTableLookups) {
    const account = await rpc.getAccountInfo(lookup.accountKey, "confirmed");
    requireSafe(account, "missing lookup table");
    requireSafe(account.owner.equals(AddressLookupTableProgram.programId), "lookup-table owner");
    const state = AddressLookupTableAccount.deserialize(account.data);
    requireSafe(state.deactivationSlot === 18446744073709551615n, "deactivated lookup table");
    tables.push(new AddressLookupTableAccount({ key: lookup.accountKey, state }));
  }
  const resolved = TransactionMessage.decompile(tx.message, { addressLookupTableAccounts: tables });
  const keys = tx.message.getAccountKeys({ addressLookupTableAccounts: tables });
  const addresses = Array.from({ length: keys.length }, (_, i) => keys.get(i)!.toBase58());
  requireSafe(new Set(addresses).size === addresses.length, "duplicate resolved keys");
  return { tx, resolved, addresses };
}

export async function verifySwapTransaction(base64: string, intent: SwapIntent, rpc: SemanticRpc) {
  requireSafe(intent.inputRaw > 0n && intent.minimumNetOutputRaw > 0n, "positive intent amounts required");
  requireSafe(intent.inputMint !== intent.outputMint && (intent.side === "BUY" ? intent.inputMint === USDC : intent.outputMint === USDC), "only USDC BUY/SELL is verified");
  const { tx, resolved, addresses } = await resolveTransaction(base64, rpc);
  requireSafe(tx.message.header.numRequiredSignatures === 1 && resolved.payerKey.toBase58() === intent.wallet, "unexpected signer/payer");
  const accounts = await rpc.getMultipleAccountsInfo(addresses.map((a) => new PublicKey(a)), "confirmed");
  const state = new Map(addresses.map((a, i) => [a, accounts[i]]));
  const info = (address: string): AccountInfo<Buffer> => { const a = state.get(address); requireSafe(a, `missing account ${address}`); return a; };
  const mint = (address: string) => {
    const a = info(address);
    requireSafe(a.owner.equals(TOKEN_PROGRAM_ID) || a.owner.equals(TOKEN_2022_PROGRAM_ID), "mint program");
    const m = unpackMint(new PublicKey(address), a, a.owner);
    requireSafe(m.isInitialized, "uninitialized mint");
    return { mint: m, program: a.owner };
  };
  const input = mint(intent.inputMint), output = mint(intent.outputMint);
  const wallet = new PublicKey(intent.wallet);
  const source = getAssociatedTokenAddressSync(new PublicKey(intent.inputMint), wallet, false, input.program).toBase58();
  const destination = getAssociatedTokenAddressSync(new PublicKey(intent.outputMint), wallet, false, output.program).toBase58();
  for (const [address, expectedMint, program] of [[source, intent.inputMint, input.program], [destination, intent.outputMint, output.program]] as const) {
    const a = state.get(address);
    if (!a) continue; // Missing canonical ATA can only fail or be created below.
    const token = unpackAccount(new PublicKey(address), a, program);
    requireSafe(token.owner.equals(wallet) && token.mint.toBase58() === expectedMint && token.isInitialized && !token.isFrozen && !token.delegate && (!token.closeAuthority || token.closeAuthority.equals(wallet)), "wallet token-account state");
    assertOrdinaryCredits(token.tlvData);
  }
  let swapCount = 0, limit: number | null = null, price: bigint | null = null, creation = false;
  let minimumGrossOutputRaw = 0n;
  for (let index = 0; index < resolved.instructions.length; index++) {
    const ix = resolved.instructions[index];
    const program = ix.programId.toBase58();
    const keys = ix.keys.map((a) => a.pubkey.toBase58());
    if (program === ComputeBudgetProgram.programId.toBase58()) {
      requireSafe(swapCount === 0 && keys.length === 0, "compute instruction placement/accounts");
      if (ix.data[0] === 2) { requireSafe(limit === null && ix.data.length === 5, "duplicate/invalid compute limit"); limit = ix.data.readUInt32LE(1); }
      else if (ix.data[0] === 3) { requireSafe(price === null && ix.data.length === 9, "duplicate/invalid compute price"); price = ix.data.readBigUInt64LE(1); }
      else requireSafe(false, "unknown compute instruction");
    } else if (program === ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()) {
      requireSafe(!creation && swapCount === 0 && ix.data.equals(Buffer.from([1])), "only one idempotent destination ATA creation allowed");
      requireSafe(keys.join() === [intent.wallet, destination, intent.wallet, intent.outputMint, SystemProgram.programId.toBase58(), output.program.toBase58()].join(), "ATA destination/payer/mint mismatch");
      creation = true;
    } else if (program === JUPITER_PROGRAM) {
      requireSafe(++swapCount === 1 && index === resolved.instructions.length - 1, "extra instruction before/after swap");
      const decoded = decodeDirectDlmmRoute(ix.data);
      requireSafe(decoded.inputRaw === intent.inputRaw, "input amount mismatch");
      minimumGrossOutputRaw = decoded.minimumGrossOutputRaw;
      const expected = [intent.wallet, source, destination, intent.inputMint, intent.outputMint, input.program.toBase58(), output.program.toBase58(), JUPITER_PROGRAM, eventAuthority(JUPITER_PROGRAM), JUPITER_PROGRAM];
      requireSafe(keys.slice(0, 10).join() === expected.join(), "swap wallet/accounts/mints mismatch");
      requireSafe(keys.length >= 29 && keys.length <= 33 && keys[10] === DLMM_PROGRAM && keys.at(-1) === JUPITER_PROGRAM, "unsupported DLMM account layout");
      requireSafe(info(JUPITER_PROGRAM).executable && info(DLMM_PROGRAM).executable, "non-executable router");
      const pool = info(keys[11]);
      requireSafe(pool.owner.toBase58() === DLMM_PROGRAM && pool.data.subarray(0, 8).equals(LB_PAIR) && pool.data.length >= 584, "invalid DLMM pool");
      // Offsets from the official bytemuck LbPair IDL: discriminator + two
      // 32-byte parameter structs + 16-byte scalar fields, then mint/vault keys.
      const x = keyAt(pool.data, 88), y = keyAt(pool.data, 120);
      requireSafe(new Set([x, y]).size === 2 && [x, y].includes(intent.inputMint) && [x, y].includes(intent.outputMint), "pool mint mismatch");
      const xp = x === intent.inputMint ? input.program : output.program;
      const yp = y === intent.inputMint ? input.program : output.program;
      const tail = [keyAt(pool.data, 152), keyAt(pool.data, 184), source, destination, x, y, keyAt(pool.data, 552), DLMM_PROGRAM, intent.wallet, xp.toBase58(), yp.toBase58(), MEMO, eventAuthority(DLMM_PROGRAM), DLMM_PROGRAM];
      requireSafe(keys.slice(13, 27).join() === tail.join(), "DLMM source/destination/reserve/authority mismatch");
      if (keys[12] !== DLMM_PROGRAM) {
        const bitmap = info(keys[12]);
        requireSafe(bitmap.owner.toBase58() === DLMM_PROGRAM && bitmap.data.subarray(0, 8).equals(BITMAP) && keyAt(bitmap.data, 8) === keys[11], "bitmap does not belong to pool");
      }
      requireSafe(info(keys[19]).owner.toBase58() === DLMM_PROGRAM && info(keys[19]).data.subarray(0, 8).equals(ORACLE), "invalid pool oracle");
      for (const address of keys.slice(27, -1)) {
        const bin = info(address);
        requireSafe(bin.owner.toBase58() === DLMM_PROGRAM && bin.data.subarray(0, 8).equals(BIN_ARRAY) && keyAt(bin.data, 24) === keys[11], "foreign/unknown remaining account");
      }
      for (const [address, tokenMint, tokenProgram] of [[keys[13], x, xp], [keys[14], y, yp]] as const) {
        const token = unpackAccount(new PublicKey(address), info(address), tokenProgram);
        requireSafe(token.mint.toBase58() === tokenMint && token.owner.toBase58() === keys[11] && !token.isFrozen, "reserve state mismatch");
        assertOrdinaryCredits(token.tlvData);
      }
      // No System/ATA program or arbitrary token accounts are passed into the
      // swap CPI. Only the inspected route and fixed DLMM swap2 may use authority.
      requireSafe(!keys.includes(SystemProgram.programId.toBase58()) && !keys.includes(ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()), "SOL debit capability in swap");
    } else requireSafe(false, "unexpected instruction (including token transfers/authority/confidential instructions)");
  }
  requireSafe(swapCount === 1 && limit !== null && limit > 0 && limit <= 1_400_000 && price !== null, "missing swap or compute bounds");
  const priority = (BigInt(limit) * price + 999999n) / 1000000n;
  requireSafe(priority <= MAX_PRIORITY_LAMPORTS, "priority fee exceeds 100000 lamports");
  let minimumNetOutputRaw = minimumGrossOutputRaw;
  const transferFee = getTransferFeeConfig(output.mint);
  if (transferFee) for (const schedule of [transferFee.olderTransferFee, transferFee.newerTransferFee]) {
    const fee = (minimumGrossOutputRaw * BigInt(schedule.transferFeeBasisPoints) + 9999n) / 10000n;
    const net = minimumGrossOutputRaw - (fee < schedule.maximumFee ? fee : schedule.maximumFee);
    if (net < minimumNetOutputRaw) minimumNetOutputRaw = net;
  }
  requireSafe(minimumNetOutputRaw >= intent.minimumNetOutputRaw, "encoded output constraint below Sieve boundary");
  const fee = (await rpc.getFeeForMessage(tx.message, "confirmed")).value;
  requireSafe(fee !== null && Number.isSafeInteger(fee) && fee >= 5000 && BigInt(fee) <= MAX_PRIORITY_LAMPORTS + 5000n, "network fee unavailable/excessive");
  // Mirror Token-2022's required_init_account_extensions, then ATA's immutable
  // owner. Confidential mint configs do not auto-configure confidential accounts.
  // spl-token 0.4.x getAccountLenForMint has a different/incomplete mapping.
  const required = [ExtensionType.ImmutableOwner];
  if (extensionData(output.mint.tlvData, 1)) required.push(ExtensionType.TransferFeeAmount);
  if (extensionData(output.mint.tlvData, 14)) required.push(ExtensionType.TransferHookAccount);
  if (extensionData(output.mint.tlvData, 26)) required.push(ExtensionType.PausableAccount);
  const accountLength = output.program.equals(TOKEN_2022_PROGRAM_ID) ? getAccountLen(required) : 165;
  const rent = creation && !state.get(destination) ? await rpc.getMinimumBalanceForRentExemption(accountLength, "confirmed") : 0;
  requireSafe(Number.isSafeInteger(rent) && rent >= 0 && rent <= 10_000_000, "rent bound unavailable/excessive");
  return { sourceTokenAccount: source, destinationTokenAccount: destination, minimumGrossOutputRaw, minimumNetOutputRaw, networkFeeLamports: fee, maximumRentLamports: rent, verifier: "JUPITER_ROUTE_V2_DIRECT_DLMM_SWAP2_V1" as const };
}
