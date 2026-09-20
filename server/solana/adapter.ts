import { Connection, PublicKey, VersionedTransaction, type AccountInfo } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getExtensionTypes,
  unpackMint,
  getTransferFeeConfig,
  getTransferHook,
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

export interface ValidatedMintMetadata {
  mint: string;
  programOwner: string;
  decimals: number;
  extensions: ExtensionType[];
  supported: boolean;
  validatedAt: number;
  transferFeeBasisPoints: number;
  maximumFee: bigint;
}

/**
 * Calculates net tokens credited to a wallet after Token-2022 transfer fee withholding.
 * Follows SPL Token-2022 transfer fee math: fee = min(maximumFee, ceil(grossRaw * feeBps / 10000)).
 */
export function calculateNetOutput(grossRaw: bigint, feeBps: number = 0, maxFee: bigint = 0n): bigint {
  if (feeBps <= 0 || grossRaw <= 0n) return grossRaw;
  const rawFee = (grossRaw * BigInt(feeBps) + 9999n) / 10000n;
  const actualFee = maxFee > 0n && rawFee > maxFee ? maxFee : rawFee;
  return grossRaw > actualFee ? grossRaw - actualFee : 0n;
}

/**
 * Calculates gross output required from a swap route to guarantee at least minimumNet
 * tokens are credited to the wallet after Token-2022 transfer fee withholding.
 */
export function calculateGrossRequired(minimumNet: bigint, feeBps: number = 0, maxFee: bigint = 0n): bigint {
  if (feeBps <= 0 || minimumNet <= 0n) return minimumNet;
  const divisor = 10000n - BigInt(feeBps);
  if (divisor <= 0n) throw new Error("Transfer fee basis points cannot be 10000 or greater");
  let gross = (minimumNet * 10000n + divisor - 1n) / divisor;
  if (maxFee > 0n && (gross * BigInt(feeBps) + 9999n) / 10000n > maxFee) {
    gross = minimumNet + maxFee;
  }
  return gross;
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
   * Rejects fee-bearing or transfer-altering tokens unless exact fee impact is computed.
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
    let transferFeeBasisPoints = 0;
    let maximumFee = 0n;

    if (isToken2022) {
      const mint = unpackMint(pubkey, sanitizedAccountInfo as unknown as AccountInfo<Buffer>, TOKEN_2022_PROGRAM_ID);
      if (mint.tlvData && typeof (mint.tlvData as any).readUInt16LE !== "function") {
        const view = new DataView(
          mint.tlvData.buffer,
          mint.tlvData.byteOffset,
          mint.tlvData.byteLength
        );
        (mint.tlvData as any).readUInt16LE = (offset: number) => view.getUint16(offset, true);
      }
      decimals = mint.decimals;
      extensions = getExtensionTypes(Buffer.from(mint.tlvData));

      // NonTransferable tokens can never be traded
      if (extensions.includes(ExtensionType.NonTransferable)) {
        throw new Error(
          `Mint ${mintAddress} has NonTransferable extension; Sieve fails closed`
        );
      }

      // Inspect TransferHook: must be unset/default program. Custom hook programs fail closed.
      if (extensions.includes(ExtensionType.TransferHook) || extensions.includes(ExtensionType.TransferHookAccount)) {
        const hook = getTransferHook(mint);
        if (
          hook &&
          hook.programId &&
          !hook.programId.equals(PublicKey.default) &&
          hook.programId.toBase58() !== "11111111111111111111111111111111"
        ) {
          throw new Error(
            `Mint ${mintAddress} has custom TransferHook program (${hook.programId.toBase58()}) with non-deterministic output impact; Sieve fails closed`
          );
        }
      }

      // Inspect TransferFeeConfig: extract current epoch fee parameters
      if (extensions.includes(ExtensionType.TransferFeeConfig)) {
        const feeConfig = getTransferFeeConfig(mint);
        if (feeConfig) {
          try {
            const epochInfo = await conn.getEpochInfo();
            const currentEpoch = BigInt(epochInfo.epoch);
            if (currentEpoch >= feeConfig.newerTransferFee.epoch) {
              transferFeeBasisPoints = feeConfig.newerTransferFee.transferFeeBasisPoints;
              maximumFee = feeConfig.newerTransferFee.maximumFee;
            } else {
              transferFeeBasisPoints = feeConfig.olderTransferFee.transferFeeBasisPoints;
              maximumFee = feeConfig.olderTransferFee.maximumFee;
            }
          } catch {
            // If RPC getEpochInfo fails, conservatively pick the higher fee bps
            const olderBps = feeConfig.olderTransferFee.transferFeeBasisPoints;
            const newerBps = feeConfig.newerTransferFee.transferFeeBasisPoints;
            transferFeeBasisPoints = Math.max(olderBps, newerBps);
            maximumFee = feeConfig.newerTransferFee.maximumFee;
          }
        }
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
      transferFeeBasisPoints,
      maximumFee,
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
