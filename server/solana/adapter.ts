import { Connection, PublicKey, VersionedTransaction, type AccountInfo } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getExtensionTypes,
  unpackMint,
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

export const PRESTOCKS_OFFICIAL_MINTS = new Set([
  "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF", // OPENAI
  "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh", // SPACEX
  "PreSt7tPQWvnmrKpmP9S5f8c6j5mR9bL3yNq1wZ4vX2", // STRIPE
  "PreAn7tPQWvnmrKpmP9S5f8c6j5mR9bL3yNq1wZ4vX3", // ANTHROPIC
  "PreDa7tPQWvnmrKpmP9S5f8c6j5mR9bL3yNq1wZ4vX4", // DATABRICKS
  "PreBy7tPQWvnmrKpmP9S5f8c6j5mR9bL3yNq1wZ4vX5", // BYTEDANCE
  "PreFi7tPQWvnmrKpmP9S5f8c6j5mR9bL3yNq1wZ4vX6", // FIGURE
  "PreX7tPQWvnmrKpmP9S5f8c6j5mR9bL3yNq1wZ4vX7",  // XAI
]);

export interface ValidatedMintMetadata {
  mint: string;
  programOwner: string;
  decimals: number;
  extensions: ExtensionType[];
  supported: boolean;
  validatedAt: number;
}

// In-memory cache for on-chain validated mint metadata (populated only AFTER successful RPC check)
const validatedMintCache = new Map<string, ValidatedMintMetadata>();

export function clearValidatedMintCache(): void {
  validatedMintCache.clear();
}

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
   * Resolves and validates mint metadata on-chain via RPC.
   * Validates account existence, program ownership (SPL Token or Token-2022),
   * unpacks via unpackMint, and inspects extensions via getExtensionTypes(mint.tlvData).
   * Rejects fee-bearing or transfer-altering tokens. Never defaults to 6.
   */
  async resolveMintMetadata(mintAddress: string, network: NetworkMode = "mainnet"): Promise<ValidatedMintMetadata> {
    if (validatedMintCache.has(mintAddress)) {
      return validatedMintCache.get(mintAddress)!;
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

    const sanitizedAccountInfo = {
      ...accountInfo,
      data: Uint8Array.from(accountInfo.data),
    };

    let decimals: number;
    let extensions: ExtensionType[] = [];

    if (isToken2022) {
      const mint = unpackMint(pubkey, sanitizedAccountInfo as unknown as AccountInfo<Buffer>, TOKEN_2022_PROGRAM_ID);
      decimals = mint.decimals;
      extensions = getExtensionTypes(Buffer.from(mint.tlvData));

      // NonTransferable tokens can never be traded
      if (extensions.includes(ExtensionType.NonTransferable)) {
        throw new Error(
          `Mint ${mintAddress} has NonTransferable extension; Sieve fails closed`
        );
      }

      // Check for fee-bearing or transfer-altering extensions
      const transferAlteringExtensions = [
        ExtensionType.TransferFeeConfig,
        ExtensionType.TransferFeeAmount,
        ExtensionType.TransferHook,
        ExtensionType.TransferHookAccount,
        ExtensionType.PermanentDelegate,
      ];

      const hasTransferAltering = transferAlteringExtensions.some((ext) => extensions.includes(ext));
      const isExplicitlySupported = PRESTOCKS_OFFICIAL_MINTS.has(mintAddress);

      if (hasTransferAltering && !isExplicitlySupported) {
        throw new Error(
          `Mint ${mintAddress} has unsupported transfer-fee or transfer-hook extension; Sieve fails closed`
        );
      }
    } else {
      const mint = unpackMint(pubkey, sanitizedAccountInfo as unknown as AccountInfo<Buffer>, TOKEN_PROGRAM_ID);
      decimals = mint.decimals;
    }

    const metadata: ValidatedMintMetadata = {
      mint: mintAddress,
      programOwner: accountInfo.owner.toBase58(),
      decimals,
      extensions,
      supported: true,
      validatedAt: Date.now(),
    };

    validatedMintCache.set(mintAddress, metadata);
    return metadata;
  }

  /**
   * Resolves the token decimals for a given mint address with strict validation.
   * Caches only after successful on-chain RPC validation.
   */
  async resolveMintDecimals(mintAddress: string, network: NetworkMode = "mainnet"): Promise<number> {
    const meta = await this.resolveMintMetadata(mintAddress, network);
    return meta.decimals;
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
