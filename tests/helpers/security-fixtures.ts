import { Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { createPrivateKey, sign } from "node:crypto";
import { base58, messageHash } from "../../server/security/transaction-binding";
import { createChallenge, finishChallenge } from "../../server/security/wallet-auth";
export const testKey = Keypair.fromSeed(Uint8Array.from({ length: 32 }, (_, i) => i + 1));
export const testWallet = testKey.publicKey.toBase58();
export function signBytes(message: Uint8Array): Uint8Array {
  const key = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(testKey.secretKey.slice(0, 32))]), type: "pkcs8", format: "der" });
  return sign(null, message, key);
}
export function testTransaction(wallet = testWallet, lamports = 1, destination = PublicKey.default.toBase58()) {
  const transaction = new VersionedTransaction(new TransactionMessage({ payerKey: new PublicKey(wallet), recentBlockhash: PublicKey.default.toBase58(), instructions: [SystemProgram.transfer({ fromPubkey: new PublicKey(wallet), toPubkey: new PublicKey(destination), lamports })] }).compileToV0Message());
  const unsigned = Buffer.from(transaction.serialize()).toString("base64");
  if (wallet === testWallet) transaction.signatures[0] = signBytes(transaction.message.serialize());
  const signed = Buffer.from(transaction.serialize()).toString("base64");
  return { unsigned, signed, hash: messageHash(unsigned), signature: base58(transaction.signatures[0]), transaction };
}
export function authenticatedHeaders() {
  process.env.SIEVE_APP_ORIGIN = "http://localhost:3000";
  process.env.WALLET_SESSION_SECRET = "test-only-secret-32-characters-long-never-production";
  const challenge = createChallenge(testWallet);
  const request = new Request("http://localhost:3000/api/auth/session", { headers: { cookie: challenge.cookie.split(";")[0] } });
  const session = finishChallenge(request, testWallet, Buffer.from(signBytes(Buffer.from(challenge.message))).toString("base64"));
  return { "Content-Type": "application/json", origin: "http://localhost:3000", cookie: session.split(";")[0] };
}
