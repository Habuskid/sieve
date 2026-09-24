// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AddressLookupTableAccount, ComputeBudgetProgram, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction, type AccountInfo } from "@solana/web3.js";
import { createApproveInstruction, createSetAuthorityInstruction, createTransferInstruction, AuthorityType, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import captured from "../fixtures/security/jupiter-dlmm-direct.json";
import capturedState from "../fixtures/security/route-accounts.json";
import definition from "../fixtures/security/route-v2-definition.json";
import { assertOrdinaryCredits, decodeDirectDlmmRoute, verifySwapTransaction, type SemanticRpc, type SwapIntent } from "../../server/security/swap-semantics";

function fixture() {
  const states = new Map<string, AccountInfo<Buffer> | null>(Object.entries(capturedState.accounts).map(([key, value]) => [key, value ? { ...value, owner: new PublicKey(value.owner), data: Buffer.from(value.data[0] as string, "base64") } : null]));
  const instruction = (i: typeof captured.swapInstruction) => new TransactionInstruction({ programId: new PublicKey(i.programId), data: Buffer.from(i.data, "base64"), keys: i.accounts.map(a => ({ ...a, pubkey: new PublicKey(a.pubkey) })) });
  const instructions = [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ...captured.computeBudgetInstructions.map(instruction), ...captured.setupInstructions.map(instruction), instruction(captured.swapInstruction)];
  const wallet = captured.swapInstruction.accounts[0].pubkey;
  const tables = Object.keys(captured.addressesByLookupTableAddress).map(key => new AddressLookupTableAccount({ key: new PublicKey(key), state: AddressLookupTableAccount.deserialize(states.get(key)!.data) }));
  const rpc = { getAccountInfo: async (key: PublicKey) => states.get(key.toBase58()) ?? null, getMultipleAccountsInfo: async (keys: PublicKey[]) => keys.map(key => states.get(key.toBase58()) ?? null), getFeeForMessage: async () => ({ context: { slot: capturedState.slot }, value: 5000 }), getMinimumBalanceForRentExemption: async () => 2500000 } as unknown as SemanticRpc;
  const intent: SwapIntent = { wallet, inputMint: captured.inputMint, outputMint: captured.outputMint, inputRaw: BigInt(captured.inAmount), minimumNetOutputRaw: 1n, side: "BUY" };
  const encode = () => Buffer.from(new VersionedTransaction(new TransactionMessage({ payerKey: new PublicKey(wallet), recentBlockhash: PublicKey.default.toBase58(), instructions }).compileToV0Message(tables)).serialize()).toString("base64");
  return { instructions, swap: instructions.at(-1)!, states, rpc, intent, encode, tables };
}
describe("semantic verification using captured Mainnet route_v2 / DLMM swap2", () => {
  it("matches the program-owned IDL discriminator and supported enum variant", () => {
    expect(definition.instruction.discriminator).toEqual([...Buffer.from(captured.swapInstruction.data, "base64").subarray(0, 8)]);
    expect(definition.swapVariant.index).toBe(75);
    expect(definition.swapVariant.name).toBe("MeteoraDlmmSwapV2");
    expect(decodeDirectDlmmRoute(Buffer.from(captured.swapInstruction.data, "base64")).inputRaw).toBe(BigInt(captured.inAmount));
  });
  it("accepts the real direct route, resolves ALTs, and derives the encoded conservative net minimum", async () => {
    const f = fixture();
    const verified = await verifySwapTransaction(f.encode(), f.intent, f.rpc);
    expect(verified.destinationTokenAccount).toBe(captured.swapInstruction.accounts[2].pubkey);
    expect(verified.minimumNetOutputRaw).toBeGreaterThan(1n);
    await expect(verifySwapTransaction(f.encode(), { ...f.intent, minimumNetOutputRaw: verified.minimumNetOutputRaw }, f.rpc)).resolves.toBeDefined();
    await expect(verifySwapTransaction(f.encode(), { ...f.intent, minimumNetOutputRaw: verified.minimumNetOutputRaw + 1n }, f.rpc)).rejects.toThrow(/output constraint/);
  });
  it.each(["before", "after"])("rejects wallet SOL transfer %s the swap", async position => {
    const f = fixture();
    const ix = SystemProgram.transfer({ fromPubkey: new PublicKey(f.intent.wallet), toPubkey: PublicKey.default, lamports: 1 });
    if (position === "before") f.instructions.unshift(ix); else f.instructions.push(ix);
    await expect(verifySwapTransaction(f.encode(), f.intent, f.rpc)).rejects.toThrow();
  });
  it.each(["transfer", "approve", "setAuthority", "confidential"])("rejects extra %s token instruction", async kind => {
    const f = fixture(), source = f.swap.keys[1].pubkey, wallet = new PublicKey(f.intent.wallet);
    const ix = kind === "transfer" ? createTransferInstruction(source, PublicKey.default, wallet, 1) : kind === "approve" ? createApproveInstruction(source, PublicKey.default, wallet, 1) : kind === "setAuthority" ? createSetAuthorityInstruction(source, wallet, AuthorityType.AccountOwner, PublicKey.default) : new TransactionInstruction({ programId: TOKEN_PROGRAM_ID, keys: [], data: Buffer.from([27, 7]) });
    f.instructions.unshift(ix);
    await expect(verifySwapTransaction(f.encode(), f.intent, f.rpc)).rejects.toThrow();
  });
  it.each(["input amount", "weak minimum", "mint", "destination", "source", "signer", "direction", "CPI destination", "CPI program", "platform fee", "positive slippage", "unknown variant", "hooks", "trailing data", "extra swap", "priority fee", "foreign bin"])("rejects %s mutation", async kind => {
    const f = fixture();
    if (kind === "input amount") f.swap.data.writeBigUInt64LE(f.intent.inputRaw + 1n, 8);
    if (kind === "weak minimum") f.swap.data.writeUInt16LE(10000, 24);
    if (kind === "mint") f.swap.keys[3].pubkey = f.swap.keys[4].pubkey;
    if (kind === "destination") f.swap.keys[2].pubkey = f.swap.keys[1].pubkey;
    if (kind === "source") f.swap.keys[1].pubkey = f.swap.keys[2].pubkey;
    if (kind === "signer") f.swap.keys[13].isSigner = true;
    if (kind === "direction") f.intent.side = "SELL";
    if (kind === "CPI destination") f.swap.keys[16].pubkey = f.swap.keys[13].pubkey;
    if (kind === "CPI program") f.swap.keys[10].pubkey = SystemProgram.programId;
    if (kind === "platform fee") f.swap.data.writeUInt16LE(1, 26);
    if (kind === "positive slippage") f.swap.data.writeUInt16LE(1, 28);
    if (kind === "unknown variant") f.swap.data[34] = 116;
    if (kind === "hooks") f.swap.data.writeUInt32LE(1, 35);
    if (kind === "trailing data") f.swap.data = Buffer.concat([f.swap.data, Buffer.from([0])]);
    if (kind === "extra swap") f.instructions.push(f.swap);
    if (kind === "priority fee") f.instructions[1] = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000000000 });
    if (kind === "foreign bin") f.swap.keys[27].pubkey = f.swap.keys[13].pubkey;
    await expect(verifySwapTransaction(f.encode(), f.intent, f.rpc)).rejects.toThrow();
  });
  it("rejects lookup-table ownership substitution", async () => {
    const f = fixture();
    expect(f.tables.length).toBeGreaterThan(0);
    for (const table of f.tables) f.states.get(table.key.toBase58())!.owner = SystemProgram.programId;
    await expect(verifySwapTransaction(f.encode(), f.intent, f.rpc)).rejects.toThrow(/lookup-table owner/);
  });
  it("rejects wrong existing ATA owner", async () => {
    const f = fixture();
    f.states.set(f.swap.keys[2].pubkey.toBase58(), f.states.get(f.swap.keys[13].pubkey.toBase58())!);
    await expect(verifySwapTransaction(f.encode(), f.intent, f.rpc)).rejects.toThrow();
  });
  it("requires ordinary credits for confidential-configured destination accounts", () => {
    const tlv = Buffer.alloc(299); tlv.writeUInt16LE(5); tlv.writeUInt16LE(295, 2);
    expect(() => assertOrdinaryCredits(tlv)).toThrow(/credits/);
    tlv[4 + 262] = 1;
    expect(() => assertOrdinaryCredits(tlv)).not.toThrow();
  });
});
