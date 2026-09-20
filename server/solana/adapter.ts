import { Connection, PublicKey, VersionedTransaction, type AccountInfo } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getExtensionTypes,
  unpackMint,
  getTransferFeeConfig,
  getTransferHook,
  getScaledUiAmountConfig,
  getPausableConfig,
  getDefaultAccountState,
  AccountState,
} from "@solana/spl-token";
import { Decimal } from "../../core/money/decimal";
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

export interface ActiveTransferFee {
  basisPoints: number;
  maximumFee: bigint;
  epoch?: bigint;
}

export interface ActiveScaledUiAmount {
  multiplier: string;
  newMultiplier: string | null;
  newMultiplierEffectiveTimestamp: number | null;
  activeMultiplier: string;
}

export interface IssuerControls {
  permanentDelegate: boolean;
  pausable: boolean;
  isPaused: boolean;
  defaultAccountState: "Initialized" | "Frozen" | "Uninitialized";
}

export type ExtensionImpactCategory =
  | "PRICE_AFFECTING"
  | "SETTLEMENT_AFFECTING"
  | "CUSTODY_RISK"
  | "INFORMATIONAL"
  | "UNSUPPORTED";

export interface ValidatedMintMetadata {
  mint: string;
  programOwner: string;
  decimals: number;
  extensions: ExtensionType[];
  supported: boolean;
  validatedAt: number;
  transferFee: ActiveTransferFee | null;
  scaledUiAmount: ActiveScaledUiAmount | null;
  issuerControls: IssuerControls;
  transferHook: { programId: string; authority: string } | null;
  blockers: string[];
  warnings: string[];
  transferFeeBasisPoints: number;
  maximumFee: bigint;
}

/**
 * Calculates net tokens credited to a wallet after Token-2022 transfer fee withholding:
 * fee = min(maximumFee, ceil(grossRaw * feeBps / 10000)).
 * When maximumFee = 0, the fee is zero.
 */
export function calculateNetOutput(
  grossRaw: bigint,
  feeConfig: ActiveTransferFee | null
): bigint {
  if (grossRaw <= 0n || !feeConfig) return grossRaw;
  const { basisPoints, maximumFee } = feeConfig;
  if (basisPoints <= 0 || maximumFee === 0n) return grossRaw;
  const rawFee = (grossRaw * BigInt(basisPoints) + 9999n) / 10000n;
  const actualFee = rawFee > maximumFee ? maximumFee : rawFee;
  return grossRaw > actualFee ? grossRaw - actualFee : 0n;
}

/**
 * Calculates gross output required from a swap route to guarantee at least minimumNet
 * tokens are credited to the wallet after Token-2022 transfer fee withholding.
 * When maximumFee = 0, no fee is withheld so gross required = minimumNet.
 */
export function calculateGrossRequired(
  minimumNet: bigint,
  feeConfig: ActiveTransferFee | null
): bigint {
  if (minimumNet <= 0n || !feeConfig) return minimumNet;
  const { basisPoints, maximumFee } = feeConfig;
  if (basisPoints <= 0 || maximumFee === 0n) return minimumNet;
  const divisor = 10000n - BigInt(basisPoints);
  if (divisor <= 0n) throw new Error("Transfer fee basis points cannot be 10000 or greater");
  let gross = (minimumNet * 10000n + divisor - 1n) / divisor;
  if ((gross * BigInt(basisPoints) + 9999n) / 10000n > maximumFee) {
    gross = minimumNet + maximumFee;
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
   * unpacks via unpackMint, and inspects extensions.
   * Supports bypassCache option to force fresh on-chain read (mandatory at build time).
   */
  async resolveMintMetadata(
    mintAddress: string,
    network: NetworkMode = "mainnet",
    options?: { bypassCache?: boolean }
  ): Promise<ValidatedMintMetadata> {
    if (!options?.bypassCache && validatedMintCache.has(mintAddress)) {
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
    let transferFee: ActiveTransferFee | null = null;
    let scaledUiAmount: ActiveScaledUiAmount | null = null;
    let transferHook: { programId: string; authority: string } | null = null;
    const issuerControls: IssuerControls = {
      permanentDelegate: false,
      pausable: false,
      isPaused: false,
      defaultAccountState: "Initialized",
    };
    const blockers: string[] = [];
    const warnings: string[] = [];

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

      // 1. Process TransferFeeConfig (PRICE_AFFECTING)
      if (extensions.includes(ExtensionType.TransferFeeConfig)) {
        const feeConfig = getTransferFeeConfig(mint);
        if (feeConfig) {
          let epochInfo: { epoch: number };
          try {
            epochInfo = await conn.getEpochInfo();
          } catch (err) {
            throw new Error(
              `Failed to retrieve current Solana epoch for TransferFeeConfig verification on ${mintAddress}: ${err instanceof Error ? err.message : String(err)}`
            );
          }

          const currentEpoch = BigInt(epochInfo.epoch);
          if (currentEpoch >= feeConfig.newerTransferFee.epoch) {
            transferFee = {
              basisPoints: feeConfig.newerTransferFee.transferFeeBasisPoints,
              maximumFee: feeConfig.newerTransferFee.maximumFee,
              epoch: feeConfig.newerTransferFee.epoch,
            };
          } else {
            transferFee = {
              basisPoints: feeConfig.olderTransferFee.transferFeeBasisPoints,
              maximumFee: feeConfig.olderTransferFee.maximumFee,
              epoch: feeConfig.olderTransferFee.epoch,
            };
          }
        }
      }

      // 2. Process ScaledUiAmountConfig (PRICE_AFFECTING)
      if (extensions.includes(ExtensionType.ScaledUiAmountConfig)) {
        try {
          const scaled = getScaledUiAmountConfig(mint);
          if (scaled) {
            const multiplierDec = new Decimal(scaled.multiplier ?? 1);
            const newMultiplierDec = scaled.newMultiplier != null ? new Decimal(scaled.newMultiplier) : null;
            const effTs = Number(scaled.newMultiplierEffectiveTimestamp || 0);
            const nowSec = Math.floor(Date.now() / 1000);
            let activeMultiplier = multiplierDec;
            if (effTs > 0 && nowSec >= effTs && newMultiplierDec != null) {
              activeMultiplier = newMultiplierDec;
            }
            scaledUiAmount = {
              multiplier: multiplierDec.toString(),
              newMultiplier: newMultiplierDec?.toString() ?? null,
              newMultiplierEffectiveTimestamp: effTs > 0 ? effTs : null,
              activeMultiplier: activeMultiplier.toString(),
            };
          }
        } catch (err) {
          blockers.push(`Failed to read ScaledUiAmountConfig: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // 3. Process PausableConfig (SETTLEMENT_AFFECTING)
      if (extensions.includes(ExtensionType.PausableConfig)) {
        issuerControls.pausable = true;
        try {
          const pausable = getPausableConfig(mint);
          if (pausable?.paused) {
            issuerControls.isPaused = true;
            blockers.push("Mint is currently paused by issuer; transfers are disabled");
          } else {
            warnings.push("Issuer retains pause authority for this token.");
          }
        } catch (err) {
          blockers.push(`Failed to verify PausableConfig state: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // 4. Process DefaultAccountState (SETTLEMENT_AFFECTING)
      if (extensions.includes(ExtensionType.DefaultAccountState)) {
        try {
          const defState = getDefaultAccountState(mint);
          if (defState?.state === AccountState.Frozen) {
            issuerControls.defaultAccountState = "Frozen";
            blockers.push("Default account state is Frozen; newly created token accounts cannot receive transfers");
          } else if (defState?.state === AccountState.Initialized) {
            issuerControls.defaultAccountState = "Initialized";
          }
        } catch (err) {
          blockers.push(`Failed to verify DefaultAccountState: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // 5. Process PermanentDelegate (CUSTODY_RISK - Disclosure, not pricing blocker)
      if (extensions.includes(ExtensionType.PermanentDelegate)) {
        issuerControls.permanentDelegate = true;
        warnings.push("Issuer retains transfer/burn authority for this token.");
      }

      // 6. Process TransferHook (SETTLEMENT_AFFECTING)
      if (extensions.includes(ExtensionType.TransferHook) || extensions.includes(ExtensionType.TransferHookAccount)) {
        try {
          const hook = getTransferHook(mint);
          if (hook) {
            transferHook = {
              programId: hook.programId.toBase58(),
              authority: hook.authority.toBase58(),
            };
            if (
              !hook.programId.equals(PublicKey.default) &&
              hook.programId.toBase58() !== "11111111111111111111111111111111"
            ) {
              blockers.push(`Mint has custom TransferHook program (${hook.programId.toBase58()}) with unproven economic impact`);
            }
          }
        } catch (err) {
          blockers.push(`Failed to verify TransferHook: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // 7. Check for unsupported or blocked extensions
      for (const ext of extensions) {
        const extNum = ext as number;
        if (ext === ExtensionType.NonTransferable || ext === ExtensionType.NonTransferableAccount) {
          blockers.push("NonTransferable tokens cannot be traded; Sieve fails closed");
        } else if (ext === ExtensionType.InterestBearingConfig) {
          blockers.push("InterestBearingConfig continuously alters token balances; Sieve fails closed");
        } else if (ext === ExtensionType.PermissionedBurn) {
          blockers.push("PermissionedBurn alters burn authority; Sieve fails closed");
        } else if (
          // Known allowed / handled extensions
          ext !== ExtensionType.TransferFeeConfig &&
          ext !== ExtensionType.ScaledUiAmountConfig &&
          ext !== ExtensionType.PausableConfig &&
          ext !== ExtensionType.DefaultAccountState &&
          ext !== ExtensionType.PermanentDelegate &&
          ext !== ExtensionType.TransferHook &&
          ext !== ExtensionType.TransferHookAccount &&
          ext !== ExtensionType.MetadataPointer &&
          ext !== ExtensionType.TokenMetadata &&
          ext !== ExtensionType.GroupPointer &&
          ext !== ExtensionType.TokenGroup &&
          ext !== ExtensionType.GroupMemberPointer &&
          ext !== ExtensionType.TokenGroupMember &&
          ext !== ExtensionType.MintCloseAuthority &&
          ext !== ExtensionType.ConfidentialTransferMint &&
          ext !== ExtensionType.ConfidentialTransferAccount &&
          ext !== ExtensionType.TransferFeeAmount &&
          extNum !== 16 && // ConfidentialTransferFeeConfig
          extNum !== 17 // ConfidentialTransferFeeAmount
        ) {
          blockers.push(`Mint has unclassified or unsupported Token-2022 extension (type ${ext}); Sieve fails closed`);
        }
      }
    } else {
      const mint = unpackMint(pubkey, sanitizedAccountInfo as unknown as AccountInfo<Buffer>, TOKEN_PROGRAM_ID);
      decimals = mint.decimals;
    }

    const supported = blockers.length === 0;

    const metadata: ValidatedMintMetadata = {
      mint: mintAddress,
      programOwner: accountInfo.owner.toBase58(),
      decimals,
      extensions,
      supported,
      validatedAt: Date.now(),
      transferFee,
      scaledUiAmount,
      issuerControls,
      transferHook,
      blockers,
      warnings,
      transferFeeBasisPoints: transferFee ? transferFee.basisPoints : 0,
      maximumFee: transferFee ? transferFee.maximumFee : 0n,
    };

    if (!supported) {
      throw new Error(`Mint ${mintAddress} is blocked: ${blockers.join("; ")}`);
    }

    validatedMintCache.set(mintAddress, metadata);
    return metadata;
  }

  /**
   * Resolves the token decimals for a given mint address with strict validation.
   * Caches only after successful on-chain RPC validation.
   */
  async resolveMintDecimals(
    mintAddress: string,
    network: NetworkMode = "mainnet",
    options?: { bypassCache?: boolean }
  ): Promise<number> {
    const meta = await this.resolveMintMetadata(mintAddress, network, options);
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
