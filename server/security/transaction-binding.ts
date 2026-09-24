import { createHash, createPublicKey, verify } from "node:crypto";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { SieveAppError } from "../services/errors";

export function decodeTransaction(base64: string): VersionedTransaction {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > 1232 || bytes.toString("base64") !== base64) throw new SieveAppError("VALIDATION_ERROR");
  try { return VersionedTransaction.deserialize(bytes); } catch { throw new SieveAppError("VALIDATION_ERROR"); }
}
export function messageHash(base64: string): string {
  return createHash("sha256").update(decodeTransaction(base64).message.serialize()).digest("hex");
}
export function base58(bytes: Uint8Array): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = BigInt(`0x${Buffer.from(bytes).toString("hex") || "0"}`);
  let result = "";
  while (value) { result = alphabet[Number(value % 58n)] + result; value /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; result = "1" + result; }
  return result;
}
export function verifySignedTransaction(input: { signedTransaction: string; wallet: string; transactionMessageHash?: string; signature?: string }): string {
  const tx = decodeTransaction(input.signedTransaction);
  if (!input.transactionMessageHash || messageHash(input.signedTransaction) !== input.transactionMessageHash) throw new SieveAppError("VALIDATION_ERROR", "Signed transaction differs from built message");
  const signers = tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures);
  if (!signers.some((key) => key.equals(new PublicKey(input.wallet)))) throw new SieveAppError("WALLET_MISMATCH");
  const message = Buffer.from(tx.message.serialize());
  for (let i = 0; i < signers.length; i++) {
    const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), signers[i].toBuffer()]), format: "der", type: "spki" });
    if (!tx.signatures[i] || !verify(null, message, key, tx.signatures[i])) throw new SieveAppError("VALIDATION_ERROR", "Invalid transaction signature");
  }
  const signature = base58(tx.signatures[0]);
  if (input.signature && input.signature !== signature) throw new SieveAppError("VALIDATION_ERROR", "Signature differs from signed transaction");
  return signature;
}
