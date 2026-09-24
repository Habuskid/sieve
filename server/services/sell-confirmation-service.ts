import { verifySignedTransaction } from "../security/transaction-binding";
import { defaultSolanaAdapter, type SolanaAdapter } from "../solana/adapter";
import { v4 as uuidv4 } from "uuid";
import { deriveCurrentSellPrice, deriveDiscountPct, isExpired, pctToBps, rawToDisplay, rawToEconomicDisplay } from "../../core";
import type { SellBuildIntent, SellTradeReceipt } from "../../core";
import { getRepository } from "../database/db";
import type { ISellRepository } from "../database/repository";
import { defaultJupiterAdapter, type JupiterAdapter } from "../jupiter/adapter";
import { SieveAppError } from "./errors";

function reconcileExecutedInput(build: SellBuildIntent, totalInputAmount: string, inputAmountResult?: string): { rawInput: string; actualEconomicInput: string } {
  const totalInput = BigInt(totalInputAmount);
  const expectedWalletInput = BigInt(build.summary.rawWalletInput);
  if (totalInput !== expectedWalletInput) {
    throw new SieveAppError("CONFIRMATION_FAILED", "Executed Sell input does not match the exact-input amount authorized at build time");
  }

  if (inputAmountResult != null) {
    const routeInput = BigInt(inputAmountResult);
    const expectedBeforeJupiterInputFee = BigInt(build.summary.rawRouteInput);
    if (build.summary.jupiterFeeMint === build.summary.targetMint) {
      if (routeInput > expectedBeforeJupiterInputFee) throw new SieveAppError("CONFIRMATION_FAILED", "Executed route input exceeds the Token-2022 fee-adjusted input");
      const observedJupiterFee = expectedBeforeJupiterInputFee - routeInput;
      const quotedPlatformFee = BigInt(build.summary.jupiterPlatformFeeRaw ?? "0");
      if (observedJupiterFee < quotedPlatformFee) throw new SieveAppError("CONFIRMATION_FAILED", "Executed input-side Jupiter fee is inconsistent with the built order");
    } else if (routeInput !== expectedBeforeJupiterInputFee) {
      throw new SieveAppError("CONFIRMATION_FAILED", "Executed route input does not match the Token-2022 fee-adjusted build input");
    }
  }

  return {
    rawInput: totalInputAmount,
    actualEconomicInput: rawToEconomicDisplay(totalInput, build.summary.inputDecimals, build.summary.activeMultiplier).toString(),
  };
}

export class SellConfirmationService {
  constructor(private jupiter: JupiterAdapter = defaultJupiterAdapter, private repo: ISellRepository = getRepository(), private solana: SolanaAdapter = defaultSolanaAdapter) {}

  async confirm(input: { buildIntentId: string; signature?: string; signedTransaction?: string; wallet?: string }) {
    const build = await this.repo.getSellBuildIntent(input.buildIntentId);
    if (!build) throw new SieveAppError("TRANSACTION_EXPIRED");
    if (!input.wallet || input.wallet !== build.wallet) throw new SieveAppError("WALLET_MISMATCH");
    // Expiry prevents resubmission; chain reconciliation is still allowed.
    if (!input.signedTransaction) throw new SieveAppError("VALIDATION_ERROR", "Mainnet Sell confirmation requires signedTransaction");
    const expectedSignature = verifySignedTransaction({ ...input, signedTransaction: input.signedTransaction, wallet: build.wallet, transactionMessageHash: build.transactionMessageHash });
    input.signature = expectedSignature;
    if (input.signature) {
      const existing = await this.repo.getSellTradeReceiptBySignature(input.signature);
      if (existing) {
        if (existing.buildIntentId !== build.id) throw new SieveAppError("IDEMPOTENCY_VIOLATION");
        return { status: existing.status, receiptId: existing.id, signature: existing.signature, receipt: existing };
      }
    }

    let signature = input.signature ?? null;
    let realized: string | null = null;
    let actualEconomic: string | null = null;
    let rawInput: string | null = null;
    let failure: string | null = null;
    let confirmed = false;
    if (!build.requestId) throw new SieveAppError("DATABASE_INTEGRITY_ERROR", "Sell build missing Jupiter requestId");
      const result: import("../jupiter/schema").JupiterExecuteResponse = isExpired(build.expiresAt, Date.now()) ? { status: "Failed" } : await this.jupiter.executeTransaction({ signedTransaction: input.signedTransaction!, requestId: build.requestId, lastValidBlockHeight: build.lastValidBlockHeight }).catch(() => ({ status: "Failed" as const }));
      // Transport failure is not proof of chain failure; reconcile the bound signature.
      if (result.signature && result.signature !== expectedSignature) throw new SieveAppError("CONFIRMATION_FAILED", "Provider signature mismatch");
      const chain = await this.solana.verifyExecution(expectedSignature, build.transactionMessageHash!, build.wallet, build.summary.targetMint, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
      if (!chain.confirmed && !chain.failed) return { status: "PENDING", signature: expectedSignature };
      if (chain.confirmed && (chain.outputRaw == null || BigInt(chain.outputRaw) < build.minimumUsdcOutputRaw || chain.inputRaw !== build.summary.rawWalletInput)) throw new SieveAppError("CONFIRMATION_FAILED", "Chain amounts violate built intent");
      result.signature = expectedSignature;
      result.status = chain.confirmed ? "Success" : "Failed";
      result.error = chain.failed ? "Transaction failed on-chain" : undefined;
      result.totalInputAmount = chain.inputRaw ?? undefined;
      result.totalOutputAmount = chain.outputRaw ?? undefined;
      result.inputAmountResult = undefined;
      signature = result.signature ?? null;
      confirmed = result.status === "Success" && !!signature;
      if (result.totalOutputAmount != null) realized = rawToDisplay(BigInt(result.totalOutputAmount), 6).toString();
      if (result.inputAmountResult != null && result.totalInputAmount == null) throw new SieveAppError("CONFIRMATION_FAILED", "Jupiter returned route input without total wallet input");
      if (result.totalInputAmount != null) {
        const executed = reconcileExecutedInput(build, result.totalInputAmount, result.inputAmountResult);
        rawInput = executed.rawInput;
        actualEconomic = executed.actualEconomicInput;
      }
      failure = confirmed ? null : result.error ?? "Execution failed";

    const realizedDiscountBps = realized && actualEconomic ? pctToBps(deriveDiscountPct(deriveCurrentSellPrice(realized, actualEconomic), build.summary.referencePriceUsd)) : null;
    const receipt: SellTradeReceipt = { id: uuidv4(), side: "SELL", checkId: build.checkId, buildIntentId: build.id, wallet: build.wallet, network: "mainnet", signature, internalExecutionId: uuidv4(), status: confirmed ? "CONFIRMED" : "FAILED", targetSymbol: build.summary.targetSymbol, targetMint: build.summary.targetMint, requestedEconomicAmount: build.summary.requestedEconomicAmount, actualEconomicInput: actualEconomic, rawInput, expectedUsdcProceeds: build.summary.expectedUsdcProceeds, realizedUsdcProceeds: realized, referencePriceUsd: build.summary.referencePriceUsd, checkedSellPriceUsd: build.summary.currentSellPriceUsd, minimumSellPriceUsd: build.summary.minimumSellPriceUsd, maxDiscountBps: Math.round(Number(build.summary.maxDiscountPct) * 100), realizedDiscountBps, submittedAt: new Date().toISOString(), confirmedAt: confirmed ? new Date().toISOString() : null, failureCode: failure };
    const saved = await this.repo.saveSellTradeReceipt(receipt);
    return { status: saved.status, receiptId: saved.id, signature: saved.signature, receipt: saved };
  }
}

export const defaultSellConfirmationService = new SellConfirmationService();
