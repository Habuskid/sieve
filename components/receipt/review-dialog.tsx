"use client";

import React from "react";
import type { CheckResponseDto } from "@/server/services/check-service";
import type { NetworkMode } from "@/core/domain/types";
import { ShieldCheck, ArrowRight, X } from "lucide-react";

export interface BuildSummaryDto {
  fundingAsset: string;
  fundingAmount: string;
  targetSymbol: string;
  expectedTargetAmount: string;
  referencePriceUsd: string;
  currentBuyPriceUsd: string;
  premiumPct: string;
  maxPremiumPct: string;
  maxBuyPriceUsd?: string;
  minimumAcceptableOutput?: string;
  premiumBps?: number;
  feeInfo?: {
    signatureFeeLamports?: number | null;
    prioritizationFeeLamports?: number | null;
    rentFeeLamports?: number | null;
  };
}

interface ReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  network: NetworkMode;
  check: CheckResponseDto;
  buildSummary?: BuildSummaryDto | null;
  isBuilding?: boolean;
  onPrepareTransaction: () => void;
  onConfirmInWallet?: () => void;
  onConfirmPractice?: () => void;
}

export function ReviewDialog({
  isOpen,
  onClose,
  network,
  check,
  buildSummary,
  isBuilding = false,
  onPrepareTransaction,
  onConfirmInWallet,
  onConfirmPractice,
}: ReviewDialogProps) {
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isMainnet = network === "mainnet";
  const hasFinalBuild = isMainnet && Boolean(buildSummary);

  // Fee calculation / display
  let feeDisplay = "Calculated when transaction is prepared";
  if (hasFinalBuild && buildSummary?.feeInfo) {
    const sigFee = buildSummary.feeInfo.signatureFeeLamports ?? 0;
    const prioFee = buildSummary.feeInfo.prioritizationFeeLamports ?? 0;
    const totalLamports = sigFee + prioFee;
    if (totalLamports > 0) {
      feeDisplay = `${(totalLamports / 1e9).toFixed(6)} SOL`;
    } else {
      feeDisplay = "Sponsored / 0 SOL";
    }
  } else if (hasFinalBuild) {
    feeDisplay = "Estimated by Solana network";
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-panel bg-surface p-6 shadow-xl border border-borderBase animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-borderBase">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sieveBlue-soft text-sieveBlue">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <h3 id="review-dialog-title" className="text-lg font-bold text-primaryText">
              {hasFinalBuild ? "Final transaction review" : "Review buy"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-secondaryText hover:text-primaryText hover:bg-surface-subtle transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close review dialog"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Practice Mode Notice */}
        {!isMainnet && (
          <div className="mt-4 p-3 rounded-card bg-sieveBlue-soft border border-blue-200 text-xs text-sieveBlue">
            <span className="font-semibold block mb-0.5">Practice Mode</span>
            <span>Simulated transaction. No wallet signature or funds are used.</span>
          </div>
        )}

        {/* Final Revalidation Notice for Mainnet */}
        {hasFinalBuild && (
          <div className="mt-4 p-3 rounded-card bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
            <span className="font-semibold block mb-0.5">Fresh Build Verified</span>
            <span>Authoritative reference price and route revalidated. Price is inside your limit.</span>
          </div>
        )}

        {/* Trade Summary Grid */}
        <div className="my-6 space-y-4">
          <div className="flex items-center justify-between p-3.5 rounded-card bg-surface-subtle border border-borderBase">
            <div>
              <span className="text-xs text-secondaryText block">Asset</span>
              <span className="text-base font-bold text-primaryText">
                {check.asset.name} ({check.asset.symbol})
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-secondaryText block">
                {hasFinalBuild ? "Final Expected Output" : "Expected Output"}
              </span>
              <span className="text-base font-bold font-mono text-primaryText tabular-nums">
                {hasFinalBuild && buildSummary
                  ? `${buildSummary.expectedTargetAmount} ${buildSummary.targetSymbol}`
                  : `${check.expected.targetAmount} ${check.asset.symbol}`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-card border border-borderBase bg-surface">
              <span className="text-secondaryText block mb-0.5">Reference price</span>
              <span className="font-mono font-bold text-primaryText text-sm tabular-nums">
                ${hasFinalBuild && buildSummary ? buildSummary.referencePriceUsd : check.price.referenceUsd}
              </span>
            </div>

            <div className="p-3 rounded-card border border-borderBase bg-surface">
              <span className="text-secondaryText block mb-0.5">Current buy price</span>
              <span className="font-mono font-bold text-sieveGreen text-sm tabular-nums">
                ${hasFinalBuild && buildSummary ? buildSummary.currentBuyPriceUsd : check.price.currentBuyUsd}
              </span>
            </div>

            <div className="p-3 rounded-card border border-borderBase bg-surface">
              <span className="text-secondaryText block mb-0.5">Your price limit</span>
              <span className="font-mono font-bold text-primaryText text-sm tabular-nums">
                ${hasFinalBuild && buildSummary?.maxBuyPriceUsd ? buildSummary.maxBuyPriceUsd : check.price.maxBuyUsd}
              </span>
            </div>

            <div className="p-3 rounded-card border border-borderBase bg-surface">
              <span className="text-secondaryText block mb-0.5">
                {hasFinalBuild ? "Minimum Protected Output" : "Difference"}
              </span>
              <span className="font-mono font-bold text-sieveGreen text-sm tabular-nums">
                {hasFinalBuild && buildSummary?.minimumAcceptableOutput
                  ? `${buildSummary.minimumAcceptableOutput} ${buildSummary.targetSymbol}`
                  : `+${check.price.premiumPct}%`}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-card bg-sieveGreen-soft/50 border border-emerald-200 text-xs text-secondaryText">
            <div className="flex items-center justify-between mb-1">
              <span>You pay</span>
              <span className="font-mono font-bold text-primaryText tabular-nums">
                {hasFinalBuild && buildSummary
                  ? `${buildSummary.fundingAmount} ${buildSummary.fundingAsset}`
                  : `${check.funding.amount} ${check.funding.asset}`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Network fee</span>
              <span className="font-mono text-mutedText">{feeDisplay}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-borderBase">
          <button
            type="button"
            onClick={onClose}
            disabled={isBuilding}
            className="rounded-btn border border-borderBase px-4 py-2.5 text-sm font-medium text-secondaryText hover:bg-surface-subtle hover:text-primaryText transition-colors min-h-[44px]"
          >
            Cancel
          </button>

          {!isMainnet ? (
            /* Practice Mode Action */
            <button
              type="button"
              onClick={onConfirmPractice}
              disabled={isBuilding}
              className="flex items-center gap-2 rounded-btn bg-sieveBlue px-5 py-2.5 text-sm font-semibold text-white hover:bg-sieveBlue-hover transition-colors shadow-xs min-h-[44px] disabled:opacity-50"
            >
              {isBuilding ? (
                <span>Executing practice trade...</span>
              ) : (
                <>
                  <span>Confirm practice trade</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          ) : !hasFinalBuild ? (
            /* Mainnet Step 1: Prepare & Revalidate */
            <button
              type="button"
              onClick={onPrepareTransaction}
              disabled={isBuilding}
              className="flex items-center gap-2 rounded-btn bg-sieveBlue px-5 py-2.5 text-sm font-semibold text-white hover:bg-sieveBlue-hover transition-colors shadow-xs min-h-[44px] disabled:opacity-50"
            >
              {isBuilding ? (
                <span>Preparing transaction...</span>
              ) : (
                <>
                  <span>Prepare transaction</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          ) : (
            /* Mainnet Step 2: Explicit Confirmation in Wallet */
            <button
              type="button"
              onClick={onConfirmInWallet}
              disabled={isBuilding}
              className="flex items-center gap-2 rounded-btn bg-sieveGreen px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors shadow-xs min-h-[44px] disabled:opacity-50"
            >
              <span>Confirm in wallet</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
