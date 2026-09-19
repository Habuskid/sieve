import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import type { NetworkMode } from "../../core/domain/types";

export const CANONICAL_MINTS = {
  mainnet: {
    USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    USDC_DECIMALS: 6,
    WSOL: "So11111111111111111111111111111111111111112",
    SOL_DECIMALS: 9,
  },
  testnet: {
    USDC: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // Devnet USDC
    USDC_DECIMALS: 6,
    WSOL: "So11111111111111111111111111111111111111112",
    SOL_DECIMALS: 9,
  },
} as const;

// Cache resolved mint decimals in memory
const mintDecimalsCache = new Map<string, number>([
  [CANONICAL_MINTS.mainnet.USDC, 6],
  [CANONICAL_MINTS.mainnet.WSOL, 9],
  [CANONICAL_MINTS.testnet.USDC, 6],
  [CANONICAL_MINTS.testnet.WSOL, 9],
  // PreStocks known mints (all 6 decimals)
  ["PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB", 6], // ANDURIL
  ["Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw", 6], // ANTHROPIC
  ["PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd", 6], // FIGUREAI
  ["PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua", 6], // KALSHI
  ["PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S", 6], // NEURALINK
  ["PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF", 6], // OPENAI
  ["Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP", 6], // POLYMARKET
  ["PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh", 6], // SPACEX
]);

export class SolanaAdapter {
  private mainnetConnection: Connection;
  private devnetConnection: Connection;

  constructor(mainnetRpcUrl?: string, devnetRpcUrl?: string) {
    const mainnetUrl =
      mainnetRpcUrl ||
      process.env.SOLANA_MAINNET_RPC_URL ||
      "https://api.mainnet-beta.solana.com";
    const devnetUrl =
      devnetRpcUrl ||
      process.env.SOLANA_DEVNET_RPC_URL ||
      "https://api.devnet.solana.com";

    this.mainnetConnection = new Connection(mainnetUrl, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 30000,
    });
    this.devnetConnection = new Connection(devnetUrl, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 30000,
    });
  }

  getConnection(network: NetworkMode): Connection {
    return network === "mainnet" ? this.mainnetConnection : this.devnetConnection;
  }

  /**
   * Resolves the token decimals for a given mint address.
   */
  async resolveMintDecimals(mintAddress: string, network: NetworkMode = "mainnet"): Promise<number> {
    if (mintDecimalsCache.has(mintAddress)) {
      return mintDecimalsCache.get(mintAddress)!;
    }

    try {
      const pubkey = new PublicKey(mintAddress);
      const conn = this.getConnection(network);
      const accountInfo = await conn.getAccountInfo(pubkey);

      if (!accountInfo) {
        // Fallback default for SPL tokens if account info not yet loaded
        return 6;
      }

      // SPL Mint layout: decimals is at byte offset 44 (1 byte)
      if (accountInfo.data.length >= 45) {
        const decimals = accountInfo.data[44];
        mintDecimalsCache.set(mintAddress, decimals);
        return decimals;
      }

      return 6;
    } catch {
      return 6;
    }
  }

  /**
   * Simulates a base64-encoded VersionedTransaction.
   */
  async simulateTransaction(
    transactionBase64: string,
    network: NetworkMode = "mainnet"
  ): Promise<{ err: unknown; logs?: string[] }> {
    const conn = this.getConnection(network);
    const txBuffer = Buffer.from(transactionBase64, "base64");
    const tx = VersionedTransaction.deserialize(txBuffer);
    const result = await conn.simulateTransaction(tx);
    return {
      err: result.value.err,
      logs: result.value.logs ?? undefined,
    };
  }

  /**
   * Confirms a transaction signature on-chain.
   */
  async confirmSignature(
    signature: string,
    network: NetworkMode = "mainnet"
  ): Promise<{ confirmed: boolean; slot?: number; err?: unknown }> {
    const conn = this.getConnection(network);
    try {
      const status = await conn.getSignatureStatus(signature, {
        searchTransactionHistory: true,
      });

      if (!status || !status.value) {
        return { confirmed: false };
      }

      const val = status.value;
      const isConfirmed =
        val.confirmationStatus === "confirmed" || val.confirmationStatus === "finalized";

      return {
        confirmed: isConfirmed && !val.err,
        slot: val.slot,
        err: val.err,
      };
    } catch (err) {
      return { confirmed: false, err };
    }
  }

  /**
   * Submits a signed serialized transaction buffer directly to the Solana cluster via RPC.
   */
  async sendRawTransaction(
    signedTxBase64: string,
    network: NetworkMode = "mainnet"
  ): Promise<string> {
    const conn = this.getConnection(network);
    const txBuffer = Buffer.from(signedTxBase64, "base64");
    const signature = await conn.sendRawTransaction(txBuffer, {
      skipPreflight: false,
      maxRetries: 3,
    });
    return signature;
  }
}

export const defaultSolanaAdapter = new SolanaAdapter();
