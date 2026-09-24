import {
  Connection,
  PublicKey,
  VersionedTransaction,
  SYSVAR_CLOCK_PUBKEY,
  type AccountInfo,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getExtensionTypes,
  unpackMint,
  unpackAccount,
  getAssociatedTokenAddressSync,
  getTransferFeeConfig,
  getTransferHook,
  getScaledUiAmountConfig,
  getPausableConfig,
  getDefaultAccountState,
  AccountState,
} from "@solana/spl-token";
import { Decimal } from "../../core/money/decimal";
import { providerFetch } from "../security/provider-fetch";
import { createHash } from "node:crypto";
import { SieveAppError } from "../services/errors";
import { assertOrdinaryCredits, validateConfidentialMintForOrdinaryTransfers } from "../security/swap-semantics";
import { canonicalPreStock } from "../prestocks/registry";
import type { FundingAsset, MainnetNetwork } from "../../core/domain/types";

export const CANONICAL_MINTS = {
  mainnet: {
    USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
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

export interface SolanaChainClock {
  slot: bigint;
  epoch: bigint;
  unixTimestamp: number;
}

export interface ValidatedMintMetadata {
  mint: string;
  programOwner: string;
  decimals: number;
  extensions: ExtensionType[];
  supported: boolean;
  validatedAt: number;
  chainTimestamp?: number | null;
  epoch?: bigint | null;
  transferFee: ActiveTransferFee | null;
  olderTransferFee: ActiveTransferFee | null;
  newerTransferFee: ActiveTransferFee | null;
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
  private metadataCache = new Map<string, ValidatedMintMetadata>();

  /**
   * Minimum SOL reserve required for rent-exemption and gas fees (0.005 SOL = 5,000,000 lamports).
   */
  public static readonly FEE_RESERVE_LAMPORTS = 5_000_000n;

  constructor(mainnetRpcUrl?: string) {
    const mainnetUrl =
      mainnetRpcUrl ||
      process.env.SOLANA_MAINNET_RPC_URL ||
      "https://api.mainnet-beta.solana.com";
    this.mainnetConnection = new Connection(mainnetUrl, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 30000,
      disableRetryOnRateLimit: true,
      fetch: async (url, init) => {
        // Verify cluster on every logical RPC call. This detects configuration
        // errors, not a malicious RPC that forges genesis and account responses.
        const genesis = await providerFetch(mainnetUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getGenesisHash", params: [] }) });
        const result = await genesis.json();
        if (result.result !== "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d") throw new Error("RPC is not Solana Mainnet");
        return providerFetch(String(url), init as RequestInit);
      },
    });
  }

  getConnection(_network: MainnetNetwork = "mainnet"): Connection {
    return this.mainnetConnection;
  }

  /**
   * Reads authoritative Solana cluster time and epoch from Sysvar Clock.
   * Fails closed if the clock cannot be retrieved.
   */
  async getChainClock(_network: MainnetNetwork = "mainnet"): Promise<SolanaChainClock> {
    const conn = this.getConnection();
    try {
      const acc = await conn.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
      if (
        !acc ||
        acc.data.length !== 40 ||
        acc.owner.toBase58() !== "Sysvar1111111111111111111111111111111111111"
      ) {
        throw new Error("Sysvar Clock account missing, invalid owner, or data length !== 40");
      }
      const view = new DataView(acc.data.buffer, acc.data.byteOffset, acc.data.byteLength);
      const slot = view.getBigUint64(0, true);
      const epoch = view.getBigUint64(16, true);
      const unixTimestamp = Number(view.getBigInt64(32, true));
      return { slot, epoch, unixTimestamp };
    } catch (err) {
      // Fallback: try getEpochInfo + getBlockTime if direct Sysvar Clock account fetch fails
      try {
        const epochInfo = await conn.getEpochInfo();
        if (typeof conn.getBlockTime !== "function") {
          throw new Error("Solana connection does not support getBlockTime");
        }
        const blockTime = await conn.getBlockTime(epochInfo.absoluteSlot ?? 0);
        if (blockTime == null) {
          throw new Error(`getBlockTime returned null for slot ${epochInfo.absoluteSlot}`);
        }
        return {
          slot: BigInt(epochInfo.absoluteSlot ?? 0),
          epoch: BigInt(epochInfo.epoch),
          unixTimestamp: blockTime,
        };
      } catch (fallbackErr) {
        throw new Error(
          `Failed to retrieve current Solana epoch for TransferFeeConfig verification / authoritative chain clock: ${err instanceof Error ? err.message : String(err)}; fallback failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`
        );
      }
    }
  }


  /**
   * Checks the user's destination Associated Token Account (ATA) state before building a transaction:
   * - If ATA exists: verify it is not Frozen
   * - If ATA does not exist: verify mint DefaultAccountState is not Frozen
   */
  async checkDestinationAccount(
    walletAddress: string,
    mintAddress: string,
    programId: PublicKey = TOKEN_2022_PROGRAM_ID,
    defaultAccountState?: "Initialized" | "Frozen" | "Uninitialized",
    _network: MainnetNetwork = "mainnet"
  ): Promise<{ exists: boolean; isFrozen: boolean; address: string; error?: string }> {
    const walletPubkey = new PublicKey(walletAddress);
    const mintPubkey = new PublicKey(mintAddress);
    const ataPubkey = getAssociatedTokenAddressSync(
      mintPubkey,
      walletPubkey,
      false,
      programId
    );

    const conn = this.getConnection();
    const accInfo = await conn.getAccountInfo(ataPubkey);

    if (!accInfo) {
      if (defaultAccountState === "Frozen") {
        return {
          exists: false,
          isFrozen: true,
          address: ataPubkey.toBase58(),
          error: "Destination ATA does not exist and mint default account state is Frozen; newly created account cannot receive transfers",
        };
      }
      return {
        exists: false,
        isFrozen: false,
        address: ataPubkey.toBase58(),
      };
    }

    try {
      const account = unpackAccount(ataPubkey, accInfo, programId);
      assertOrdinaryCredits(account.tlvData);
      if (!account.isInitialized || !account.owner.equals(walletPubkey) || !account.mint.equals(mintPubkey)) {
        throw new Error("Destination token account ownership or mint mismatch");
      }
      if (account.isFrozen) {
        return {
          exists: true,
          isFrozen: true,
          address: ataPubkey.toBase58(),
          error: `Destination token account (${ataPubkey.toBase58()}) is Frozen; cannot receive transfers`,
        };
      }

      return {
        exists: true,
        isFrozen: false,
        address: ataPubkey.toBase58(),
      };
    } catch (err) {
      throw new Error(
        `Failed to inspect destination token account (${ataPubkey.toBase58()}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Resolves and validates mint metadata on-chain via RPC.
   * Validates account existence, program ownership (SPL Token or Token-2022),
   * unpacks via unpackMint, and inspects extensions.
   * Supports bypassCache option to force fresh on-chain read (mandatory at build time).
   */
  async resolveMintMetadata(
    mintAddress: string,
    network: MainnetNetwork = "mainnet",
    options?: { bypassCache?: boolean }
  ): Promise<ValidatedMintMetadata> {
    const cached = this.metadataCache.get(mintAddress);
    if (!options?.bypassCache && cached && Date.now() - cached.validatedAt < 5000) {
      return cached;
    }

    const pubkey = new PublicKey(mintAddress);
    const conn = this.getConnection();
    const accountInfo = await conn.getAccountInfo(pubkey);

    if (!accountInfo) {
      throw new Error(`Mint account ${mintAddress} does not exist on Solana Mainnet`);
    }

    const isToken = accountInfo.owner.equals(TOKEN_PROGRAM_ID);
    const isToken2022 = accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID);
    const registered = canonicalPreStock(mintAddress);
    if (registered && accountInfo.owner.toBase58() !== registered.tokenProgram) throw new SieveAppError("ROUTE_RISK", "Registry token-program mismatch");

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
    let olderTransferFee: ActiveTransferFee | null = null;
    let newerTransferFee: ActiveTransferFee | null = null;
    let scaledUiAmount: ActiveScaledUiAmount | null = null;
    let transferHook: { programId: string; authority: string } | null = null;
    let chainClock: SolanaChainClock | null = null;
    let resolvedChainTimestamp: number | null = null;
    let resolvedEpoch: bigint | null = null;
    const getOrFetchChainClock = async (): Promise<SolanaChainClock> => {
      if (!chainClock) {
        chainClock = await this.getChainClock(network);
        resolvedChainTimestamp = chainClock.unixTimestamp;
        resolvedEpoch = chainClock.epoch;
      }
      return chainClock;
    };

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
      if (!mint.isInitialized) throw new Error("Mint is uninitialized");
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
        if (!feeConfig) throw new Error("Missing TransferFeeConfig data");
        if (feeConfig) {
          const clock = await getOrFetchChainClock();
          const olderFee: ActiveTransferFee = {
            basisPoints: feeConfig.olderTransferFee.transferFeeBasisPoints,
            maximumFee: feeConfig.olderTransferFee.maximumFee,
            epoch: feeConfig.olderTransferFee.epoch,
          };
          const newerFee: ActiveTransferFee = {
            basisPoints: feeConfig.newerTransferFee.transferFeeBasisPoints,
            maximumFee: feeConfig.newerTransferFee.maximumFee,
            epoch: feeConfig.newerTransferFee.epoch,
          };
          olderTransferFee = olderFee;
          newerTransferFee = newerFee;

          if (clock.epoch >= feeConfig.newerTransferFee.epoch) {
            transferFee = newerFee;
          } else {
            transferFee = olderFee;
          }
        }
      }

      // 2. Process ScaledUiAmountConfig (PRICE_AFFECTING)
      if (extensions.includes(ExtensionType.ScaledUiAmountConfig)) {
        try {
          const scaled = getScaledUiAmountConfig(mint);
          if (!scaled) throw new Error("Missing ScaledUiAmountConfig data");
          if (scaled) {
            const multiplierDec = new Decimal(scaled.multiplier ?? 1);
            const newMultiplierDec = scaled.newMultiplier != null ? new Decimal(scaled.newMultiplier) : null;
            if (!multiplierDec.isFinite() || multiplierDec.lte(0) || (newMultiplierDec && (!newMultiplierDec.isFinite() || newMultiplierDec.lte(0)))) throw new Error("Invalid scaled multiplier");
            const effTs = Number(scaled.newMultiplierEffectiveTimestamp || 0);
            let activeMultiplier = multiplierDec;
            if (effTs > 0 && newMultiplierDec != null) {
              const clock = await getOrFetchChainClock();
              if (clock.unixTimestamp >= effTs) {
                activeMultiplier = newMultiplierDec;
              }
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
          if (!pausable) throw new Error("Missing PausableConfig data");
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
          if (!defState) throw new Error("Missing DefaultAccountState data");
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
          if (!hook) throw new Error("Missing TransferHook data");
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
      try { validateConfidentialMintForOrdinaryTransfers(mint.tlvData); }
      catch (error) { blockers.push(error instanceof Error ? error.message : "Invalid confidential mint configuration"); }
      for (const ext of extensions) {
        if (ext === ExtensionType.NonTransferable || ext === ExtensionType.NonTransferableAccount) {
          blockers.push("NonTransferable tokens cannot be traded; Sieve fails closed");
        } else if (ext === ExtensionType.InterestBearingConfig) {
          blockers.push("InterestBearingConfig continuously alters token balances; Sieve fails closed");
        } else if (ext === ExtensionType.PermissionedBurn) {
          blockers.push("PermissionedBurn alters burn authority; Sieve fails closed");
        } else if (
          // Known allowed / handled extensions
          ext !== ExtensionType.TransferFeeConfig &&
          ext !== ExtensionType.ConfidentialTransferMint &&
          (ext as number) !== 16 /* ConfidentialTransferFeeConfig */ &&
          ext !== ExtensionType.ScaledUiAmountConfig &&
          ext !== ExtensionType.PausableConfig &&
          ext !== ExtensionType.DefaultAccountState &&
          ext !== ExtensionType.PermanentDelegate &&
          ext !== ExtensionType.TransferHook &&
          ext !== ExtensionType.MetadataPointer &&
          ext !== ExtensionType.TokenMetadata &&
          ext !== ExtensionType.GroupPointer &&
          ext !== ExtensionType.TokenGroup &&
          ext !== ExtensionType.GroupMemberPointer &&
          ext !== ExtensionType.TokenGroupMember &&
          ext !== ExtensionType.MintCloseAuthority
        ) {
          blockers.push(`Mint has unclassified or unsupported Token-2022 extension (type ${ext}); Sieve fails closed`);
        }
      }
    } else {
      const mint = unpackMint(pubkey, sanitizedAccountInfo as unknown as AccountInfo<Buffer>, TOKEN_PROGRAM_ID);
      if (!mint.isInitialized) throw new Error("Mint is uninitialized");
      decimals = mint.decimals;
    }

    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) blockers.push("Unsupported mint decimals");
    const supported = blockers.length === 0;

    const metadata: ValidatedMintMetadata = {
      mint: mintAddress,
      programOwner: accountInfo.owner.toBase58(),
      decimals,
      extensions,
      supported,
      validatedAt: Date.now(),
      chainTimestamp: resolvedChainTimestamp,
      epoch: resolvedEpoch,
      transferFee,
      olderTransferFee,
      newerTransferFee,
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

    if (this.metadataCache.size >= 1000) this.metadataCache.clear();
    this.metadataCache.set(mintAddress, metadata);
    return metadata;
  }

  /**
   * Resolves the token decimals for a given mint address with strict validation.
   * Caches only after successful on-chain RPC validation.
   */
  async resolveMintDecimals(
    mintAddress: string,
    network: MainnetNetwork = "mainnet",
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
    _network: MainnetNetwork = "mainnet"
  ): Promise<{ hasSufficient: boolean; error?: string }> {
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

  /** Checks a wallet's raw balance for an arbitrary SPL/Token-2022 mint plus SOL fees. */
  async checkTokenBalance(walletAddress: string, mintAddress: string, requiredRaw: bigint, _network: MainnetNetwork = "mainnet"): Promise<{ hasSufficient: boolean; error?: string }> {
    try {
      const wallet = new PublicKey(walletAddress);
      const conn = this.getConnection();
      if (BigInt(await conn.getBalance(wallet)) < SolanaAdapter.FEE_RESERVE_LAMPORTS) return { hasSufficient:false, error:"Insufficient SOL for transaction fees" };
      const accounts = await conn.getParsedTokenAccountsByOwner(wallet, { mint: new PublicKey(mintAddress) });
      let total = 0n; for (const a of accounts.value) total += BigInt(a.account.data.parsed.info.tokenAmount.amount);
      return total >= requiredRaw ? { hasSufficient:true } : { hasSufficient:false, error:`Insufficient PreStock token balance: raw ${total}, required ${requiredRaw}` };
    } catch (err) { return { hasSufficient:false, error:`Failed to verify PreStock token balance: ${err instanceof Error ? err.message : String(err)}` }; }
  }

  /**
   * Simulates a base64-encoded VersionedTransaction.
   */
  async simulateTransaction(
    transactionBase64: string,
    _network: MainnetNetwork = "mainnet"
  ): Promise<{ err: unknown; logs?: string[] }> {
    const conn = this.getConnection();
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
    _network: MainnetNetwork = "mainnet"
  ): Promise<{ confirmed: boolean; slot?: number; err?: unknown }> {
    const conn = this.getConnection();
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

  async verifyExecution(signature: string, expectedHash: string, wallet: string, inputMint: string, outputMint: string): Promise<{ confirmed: boolean; failed: boolean; inputRaw: string | null; outputRaw: string | null }> {
    const transaction = await this.getConnection().getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!transaction?.meta) return { confirmed: false, failed: false, inputRaw: null, outputRaw: null };
    const hash = createHash("sha256").update(transaction.transaction.message.serialize()).digest("hex");
    if (hash !== expectedHash) throw new SieveAppError("CONFIRMATION_FAILED", "Chain transaction message mismatch");
    if (transaction.meta.err) return { confirmed: false, failed: true, inputRaw: null, outputRaw: null };
    const delta = (mint: string): bigint => {
      const sum = (balances: typeof transaction.meta.preTokenBalances) => (balances ?? []).filter((b) => b.owner === wallet && b.mint === mint).reduce((total, b) => total + BigInt(b.uiTokenAmount.amount), 0n);
      return sum(transaction.meta!.postTokenBalances) - sum(transaction.meta!.preTokenBalances);
    };
    const output = delta(outputMint);
    const input = -delta(inputMint);
    // Native SOL cost includes rent/fees; don't invent a trade-only debit from it.
    return { confirmed: true, failed: false, inputRaw: inputMint === CANONICAL_MINTS.mainnet.WSOL ? null : input.toString(), outputRaw: output.toString() };
  }

  /**
   * Submits a signed serialized transaction buffer directly to the Solana cluster via RPC.
   */
  async sendRawTransaction(
    signedTxBase64: string,
    _network: MainnetNetwork = "mainnet"
  ): Promise<string> {
    const conn = this.getConnection();
    const txBuffer = Buffer.from(signedTxBase64, "base64");
    const signature = await conn.sendRawTransaction(txBuffer, {
      skipPreflight: false,
      maxRetries: 3,
    });
    return signature;
  }
}

export const defaultSolanaAdapter = new SolanaAdapter();
