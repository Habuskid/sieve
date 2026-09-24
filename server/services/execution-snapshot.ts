import type { ExecutionSnapshot, MarketAsset } from "../../core/domain/types";
import type { ValidatedMintMetadata } from "../solana/adapter";
import { messageHash } from "../security/transaction-binding";
import { SieveAppError } from "./errors";

export function executionSnapshot(input: { asset: MarketAsset; metadata: ValidatedMintMetadata; wallet: string; checkId: string; clientIntentVersion: string; side: "BUY" | "SELL"; inputMint: string; outputMint: string; inputRaw: bigint; minimumNetOutputRaw: bigint; transactionBase64: string; lastValidBlockHeight?: string; signingExpiresAt: string }): ExecutionSnapshot {
  const retrievedAt = input.asset.referenceRetrievedAt ?? input.asset.observedAt;
  const now = Date.now();
  if (!Number.isFinite(Date.parse(retrievedAt)) || now - Date.parse(retrievedAt) > 60_000 || Date.parse(retrievedAt) > now + 1000) throw new SieveAppError("TRANSACTION_EXPIRED");
  const tokenValidatedAt = Number.isFinite(input.metadata?.validatedAt)
    ? new Date(input.metadata.validatedAt).toISOString()
    : new Date(now).toISOString();
  return { semantics: "SNAPSHOT_BOUND_V1", snapshotAt: new Date(now).toISOString(), referenceRetrievedAt: retrievedAt, referenceSourceUpdatedAt: input.asset.referenceSourceUpdatedAt ?? null, referencePriceUsd: input.asset.referencePriceUsd, tokenStateValidatedAt: tokenValidatedAt, tokenChainTimestamp: input.metadata.chainTimestamp ?? null, activeMultiplier: input.metadata.scaledUiAmount?.activeMultiplier ?? "1", wallet: input.wallet, checkId: input.checkId, clientIntentVersion: input.clientIntentVersion, side: input.side, inputMint: input.inputMint, outputMint: input.outputMint, inputRaw: input.inputRaw.toString(), minimumNetOutputRaw: input.minimumNetOutputRaw.toString(), transactionMessageHash: messageHash(input.transactionBase64), lastValidBlockHeight: input.lastValidBlockHeight ?? null, signingExpiresAt: input.signingExpiresAt };
}
