import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getExtensionTypes,
} from "@solana/spl-token";
import type { NetworkMode, FundingAsset } from "../../core/domain/types";

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

  /**
   * Minimum SOL reserve required for rent-exemption and gas fees (0.005 SOL = 5,000,000 lamports).
   */
  public static readonly FEE_RESERVE_LAMPORTS = 5_000_000n;

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
   * Resolves the token decimals for a given mint address with strict validation.
   * Validates account existence, program owner (SPL Token or Token-2022), and rejects fee extensions.
   * Never returns a silent fallback on failure.
   */
  async resolveMintDecimals(mintAddress: string, network: NetworkMode = "mainnet"): Promise<number> {
    if (mintDecimalsCache.has(mintAddress)) {
      return mintDecimalsCache.get(mintAddress)!;
    }

    const pubkey = new PublicKey(mintAddress);
    const conn = this.getConnection(network);
    const accountInfo = await conn.getAccountInfo(pubkey);

    if (!accountInfo) {
      throw new Error(`Mint account ${mintAddress} does not exist on ${network}`);
    }

    const isToken = accountInfo.owner.equals(TOKEN_PROGRAM_ID);
    const isToken2022 = accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID);

    if (!isToken && !isToken2022) {
      throw new Error(
        `Mint ${mintAddress} is not owned by SPL Token or Token-2022 (owner: ${accountInfo.owner.toBase58()})`
      );
    }

    if (accountInfo.data.length < 82) {
      throw new Error(
        `Account ${mintAddress} data is too short for an SPL mint (${accountInfo.data.length} bytes, expected >= 82)`
      );
    }

    if (isToken2022) {
      const extensions = getExtensionTypes(accountInfo.data);
      if (
        extensions.includes(ExtensionType.TransferFeeConfig) ||
        extensions.includes(ExtensionType.TransferFeeAmount)
      ) {
        throw new Error(
          `Mint ${mintAddress} has unsupported transfer fee extensions; Sieve only supports fee-free tokens`
        );
      }
    }

    // Decimals is at byte offset 44 (1 byte)
    const decimals = accountInfo.data[44];
    mintDecimalsCache.set(mintAddress, decimals);
    return decimals;
  }

  /**
   * Verifies that the wallet has sufficient balance for the trade and required gas.
   */
  async checkBalance(
    walletAddress: string,
    fundingAsset: FundingAsset,
    requiredAmountRaw: bigint,
    network: NetworkMode = "mainnet"
  ): Promise<{ hasSufficient: boolean; error?: string }> {
    if (network === "testnet") {
      // Practice / Testnet mode: simulated balance is always sufficient
      return { hasSufficient: true };
    }

    try {
      const walletPubkey = new PublicKey(walletAddress);
      const conn = this.getConnection("mainnet");

      const solBalance = BigInt(await conn.getBalance(walletPubkey));

      if (fundingAsset === "SOL") {
        const totalSolNeeded = requiredAmountRaw + SolanaAdapter.FEE_RESERVE_LAMPORTS;
        if (solBalance < totalSolNeeded) {
          return {
            hasSufficient: false,
            error: `Insufficient SOL balance: available ${(Number(solBalance) / 1e9).toFixed(4)} SOL, required ${(Number(totalSolNeeded) / 1e9).toFixed(4)} SOL (including gas reserve)`,
          };
        }
        return { hasSufficient: true };
      } else {
        // USDC funding
        if (solBalance < SolanaAdapter.FEE_RESERVE_LAMPORTS) {
          return {
            hasSufficient: false,
            error: `Insufficient SOL for transaction fees: available ${(Number(solBalance) / 1e9).toFixed(4)} SOL, required at least ${(Number(SolanaAdapter.FEE_RESERVE_LAMPORTS) / 1e9).toFixed(4)} SOL for network fees`,
          };
        }

        const usdcMintPubkey = new PublicKey(CANONICAL_MINTS.mainnet.USDC);
        const tokenAccounts = await conn.getParsedTokenAccountsByOwner(walletPubkey, {
          mint: usdcMintPubkey,
        });

        let totalUsdcRaw = 0n;
        for (const ta of tokenAccounts.value) {
          const amountStr = ta.account.data.parsed.info.tokenAmount.amount;
          totalUsdcRaw += BigInt(amountStr);
        }

        if (totalUsdcRaw < requiredAmountRaw) {
          return {
            hasSufficient: false,
            error: `Insufficient USDC balance: available ${(Number(totalUsdcRaw) / 1e6).toFixed(2)} USDC, required ${(Number(requiredAmountRaw) / 1e6).toFixed(2)} USDC`,
          };
        }

        return { hasSufficient: true };
      }
    } catch (err) {
      return {
        hasSufficient: false,
        error: `Failed to verify wallet balance: ${err instanceof Error ? err.message : String(err)}`,
      };
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
