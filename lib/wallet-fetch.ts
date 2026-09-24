type SignMessage = ((message: Uint8Array) => Promise<Uint8Array>) | undefined;
// No keys or signed transactions enter storage. Authentication proof is a short
// domain-bound message; session credentials remain in an HttpOnly cookie.
export async function walletFetch(url: string, init: RequestInit, wallet: string, signMessage: SignMessage): Promise<Response> {
  const session = await fetch("/api/auth/session", { cache: "no-store" }).then((r) => r.json());
  if (session.wallet !== wallet) {
    if (!signMessage) throw new Error("Wallet must support message signing to authenticate Sieve requests.");
    const challenge = await fetch("/api/auth/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet }) });
    if (!challenge.ok) throw new Error("Wallet authentication unavailable.");
    const { message } = await challenge.json();
    const prefix = `Sieve wallet authentication\nOrigin: ${window.location.origin}\nWallet: ${wallet}\nNetwork: solana-mainnet\nNonce: `;
    if (typeof message !== "string" || message.length > 1024 || !message.startsWith(prefix)) throw new Error("Invalid wallet authentication challenge.");
    const signed = await signMessage(new TextEncoder().encode(message));
    const response = await fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet, signature: Buffer.from(signed).toString("base64") }) });
    if (!response.ok) throw new Error("Wallet authentication failed.");
  }
  return fetch(url, init);
}
