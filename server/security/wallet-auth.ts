import { createHmac, randomBytes, timingSafeEqual, createPublicKey, verify } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { SieveAppError } from "../services/errors";

const SESSION = "sieve_session";
export const CHALLENGE = "sieve_challenge";
type Proof = { wallet: string; expires: number; nonce: string; kind: "session" | "challenge"; origin: string };
function config() {
  const secret = process.env.WALLET_SESSION_SECRET;
  const origin = process.env.SIEVE_APP_ORIGIN;
  if (!secret || secret.length < 32 || !origin || new URL(origin).origin !== origin ||
      (process.env.NODE_ENV === "production" && !origin.startsWith("https://"))) throw new SieveAppError("DATA_UNAVAILABLE");
  return { secret, origin };
}
function encode(proof: Proof): string {
  const data = Buffer.from(JSON.stringify(proof)).toString("base64url");
  return `${data}.${createHmac("sha256", config().secret).update(data).digest("base64url")}`;
}
function cookieValue(request: Request, name: string): string | undefined {
  return request.headers.get("cookie")?.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${name}=`))?.slice(name.length + 1);
}
function decode(request: Request, name: string, kind: Proof["kind"]): Proof | null {
  const token = cookieValue(request, name);
  if (!token || token.length > 2048) return null;
  try {
    const { secret, origin } = config();
    const [data, mac, extra] = token.split(".");
    if (extra || !mac) return null;
    const expected = createHmac("sha256", secret).update(data).digest();
    const actual = Buffer.from(mac, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) return null;
    const proof = JSON.parse(Buffer.from(data, "base64url").toString()) as Proof;
    return proof.kind === kind && proof.origin === origin && proof.expires > Date.now() ? proof : null;
  } catch { return null; }
}
export function sessionWallet(request: Request): string | null { return decode(request, SESSION, "session")?.wallet ?? null; }
export function requireWallet(request: Request, wallet: string): void {
  if (sessionWallet(request) !== wallet) throw new SieveAppError("WALLET_NOT_CONNECTED");
}
export function requireOrigin(request: Request): void {
  if (request.headers.get("origin") !== config().origin) throw new SieveAppError("VALIDATION_ERROR");
}
export function authCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config().origin.startsWith("https:") ? "; Secure" : ""}`;
}
function message(proof: Proof): string {
  return `Sieve wallet authentication\nOrigin: ${proof.origin}\nWallet: ${proof.wallet}\nNetwork: solana-mainnet\nNonce: ${proof.nonce}\nExpires: ${new Date(proof.expires).toISOString()}\nThis signature authenticates your Sieve session. It does not authorize a transaction.`;
}
export function createChallenge(wallet: string) {
  const proof: Proof = { wallet, origin: config().origin, nonce: randomBytes(32).toString("hex"), expires: Date.now() + 300_000, kind: "challenge" };
  return { message: message(proof), cookie: authCookie(CHALLENGE, encode(proof), 300) };
}
export function finishChallenge(request: Request, wallet: string, signature: string): string {
  const proof = decode(request, CHALLENGE, "challenge");
  if (!proof || proof.wallet !== wallet) throw new SieveAppError("WALLET_NOT_CONNECTED");
  const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), new PublicKey(wallet).toBuffer()]), format: "der", type: "spki" });
  const bytes = Buffer.from(signature, "base64");
  if (bytes.length !== 64 || !verify(null, Buffer.from(message(proof)), key, bytes)) throw new SieveAppError("WALLET_NOT_CONNECTED");
  return authCookie(SESSION, encode({ ...proof, kind: "session", nonce: randomBytes(32).toString("hex"), expires: Date.now() + 900_000 }), 900);
}
