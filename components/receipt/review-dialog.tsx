"use client";

import React from "react";
import type { CheckResponseDto } from "@/server/services/check-service";
import type { NetworkMode } from "@/core/domain/types";
import { X, ArrowRight } from "lucide-react";

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
  activeMultiplier?: string;
  issuerControls?: {
    permanentDelegate: boolean;
    pausable: boolean;
    isPaused: boolean;
    defaultAccountState: string;
  };
  feeInfo?: {
    signatureFeeLamports?: number | null;
    signatureFeePayer?: string | null;
    prioritizationFeeLamports?: number | null;
    prioritizationFeePayer?: string | null;
    rentFeeLamports?: number | null;
    rentFeePayer?: string | null;
    gasless?: boolean | null;
  };
}

interface ReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  network: NetworkMode;
  check: CheckResponseDto;
  wallet?: string | null;
  buildSummary?: BuildSummaryDto | null;
  expiresAt?: string | null;
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
  wallet,
  buildSummary,
  expiresAt,
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

  const isMainnet = network === "mainnet";
  const hasFinalBuild = isMainnet && Boolean(buildSummary);

  // Build expiry countdown
  const [secondsRemaining, setSecondsRemaining] = React.useState<number | null>(null);
  const isExpired = hasFinalBuild && secondsRemaining !== null && secondsRemaining <= 0;

  React.useEffect(() => {
    if (!hasFinalBuild || !expiresAt) {
      setSecondsRemaining(null);
      return;
    }
    const targetTime = new Date(expiresAt).getTime();
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [hasFinalBuild, expiresAt]);

  if (!isOpen) return null;

  // Fee calculation / display
  let feeDisplay = "Calculated when transaction is prepared";
  if (hasFinalBuild && buildSummary?.feeInfo) {
    const {
      signatureFeeLamports,
      signatureFeePayer,
      prioritizationFeeLamports,
      prioritizationFeePayer,
      rentFeeLamports,
      rentFeePayer,
      gasless,
    } = buildSummary.feeInfo;

    if (gasless === true) {
      feeDisplay = "Sponsored by Jupiter (0 SOL)";
    } else {
      const walletAddress = wallet || (check as { wallet?: string }).wallet;
      let userLamports = 0;
      let hasSufficientPayerInfo = false;

      const isTakerPayer = (payer?: string | null) => {
        if (!payer) return false;
        if (payer === "taker" || payer === "user") return true;
        if (walletAddress && payer === walletAddress) return true;
        return false;
      };

      if (signatureFeePayer || prioritizationFeePayer || rentFeePayer) {
        hasSufficientPayerInfo = true;
        if (isTakerPayer(signatureFeePayer) && signatureFeeLamports != null) {
          userLamports += signatureFeeLamports;
        }
        if (isTakerPayer(prioritizationFeePayer) && prioritizationFeeLamports != null) {
          userLamports += prioritizationFeeLamports;
        }
        if (isTakerPayer(rentFeePayer) && rentFeeLamports != null) {
          userLamports += rentFeeLamports;
        }
      }

      if (hasSufficientPayerInfo && userLamports > 0) {
        feeDisplay = `~${(userLamports / 1e9).toFixed(6)} SOL`;
      } else if (hasSufficientPayerInfo && userLamports === 0 && gasless) {
        feeDisplay = "Sponsored (0 SOL)";
      } else {
        feeDisplay = "Fee details available in wallet";
      }
    }
  } else if (hasFinalBuild) {
    feeDisplay = "Fee details available in wallet";
  }

  const walletDisplay = wallet
    ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}`
    : "Not connected";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        data-testid="review-dialog-panel"
        className="w-full max-w-2xl rounded-panel bg-surface p-6 shadow-xl border border-borderBase animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto"
      >
        {/* Compact Header */}
        <div className="flex items-center justify-between pb-3 border-b border-borderBase">
          <div>
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-secondaryText block">
              ORDER TICKET
            </span>
            <h3 id="review-dialog-title" className="text-base font-bold text-primaryText">
              {hasFinalBuild ? "Final transaction review" : "Review buy"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[4px] p-1 text-secondaryText hover:text-primaryText hover:bg-surface-subtle transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
            aria-label="Close review dialog"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Practice Mode Environment Strip */}
        {!isMainnet && (
          <div className="mt-3 py-1.5 px-3 rounded-[4px] bg-sieveBlue-soft border border-blue-200 text-xs text-sieveBlue font-mono flex items-center justify-between">
            <span className="font-semibold">PRACTICE MODE</span>
            <span>Simulated execution. Zero funds/signatures used.</span>
          </div>
        )}

        {/* Fresh-build verification strip / Expiry for Mainnet */}
        {hasFinalBuild && (
          isExpired ? (
            <div className="mt-3 py-1.5 px-3 rounded-[4px] bg-sieveRed-soft border border-rose-300 text-xs text-sieveRed font-mono flex items-center justify-between">
              <span className="font-semibold">BUILD EXPIRED</span>
              <span>Please prepare the transaction again for fresh pricing.</span>
            </div>
          ) : (
            <div className="mt-3 py-1.5 px-3 rounded-[4px] bg-sieveGreen-soft border border-emerald-300 text-xs text-sieveGreen font-mono flex items-center justify-between">
              <span className="font-semibold">FRESH BUILD VERIFIED — ROUTE REVALIDATED</span>
              {secondsRemaining !== null && (
                <span className="tabular-nums font-bold">
                  Expires in {secondsRemaining}s
                </span>
              )}
            </div>
          )
        )}

        {/* Token-2022 Issuer Controls Disclosures */}
        {(() => {
          const issuerControls = buildSummary?.issuerControls ?? check?.issuerControls;
          const hasPermanentDelegate = issuerControls?.permanentDelegate === true;
          const hasPausable = issuerControls?.pausable === true;
          if (!hasPermanentDelegate && !hasPausable) return null;
          return (
            <div
              data-testid="issuer-controls-disclosure"
              className="mt-3 p-3 rounded-[4px] bg-sieveAmber-soft border border-amber-300 text-xs text-amber-950 space-y-1 font-mono"
            >
              <span className="font-bold block text-[11px] uppercase tracking-wider text-amber-900">
                TOKEN EXTENSION NOTICE
              </span>
              {hasPermanentDelegate && (
                <div className="flex items-start gap-1.5" data-testid="disclosure-permanent-delegate">
                  <span className="shrink-0">•</span>
                  <span>Issuer retains transfer/burn authority for this token.</span>
                </div>
              )}
              {hasPausable && (
                <div className="flex items-start gap-1.5" data-testid="disclosure-pausable">
                  <span className="shrink-0">•</span>
                  <span>Issuer retains pause authority for this token.</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Dense Order Ticket Rows */}
        <div className="my-4 divide-y divide-borderBase border-y border-borderBase text-xs">
          {/* Asset */}
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-secondaryText">Asset</span>
            <span className="font-bold text-primaryText">
              {check.asset.name} ({check.asset.symbol})
            </span>
          </div>

          {/* Spend */}
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-secondaryText">Spend (You pay)</span>
            <span className="font-mono font-bold text-primaryText tabular-nums">
              {hasFinalBuild && buildSummary
                ? `${buildSummary.fundingAmount} ${buildSummary.fundingAsset}`
                : `${check.funding.amount} ${check.funding.asset}`}
            </span>
          </div>

          {/* Expected Output */}
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-secondaryText">
              {hasFinalBuild ? "Final Expected Output" : "Expected Output"}
            </span>
            <span className="font-mono font-bold text-primaryText tabular-nums">
              {hasFinalBuild && buildSummary
                ? `${buildSummary.expectedTargetAmount} ${buildSummary.targetSymbol}`
                : `${check.expected.targetAmount} ${check.asset.symbol}`}
            </span>
          </div>

          {/* Minimum Protected Output */}
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-secondaryText">Minimum Protected Output</span>
            <span className="font-mono font-bold text-sieveGreen tabular-nums">
              {hasFinalBuild && buildSummary?.minimumAcceptableOutput
                ? `${buildSummary.minimumAcceptableOutput} ${buildSummary.targetSymbol}`
                : "Enforced at build"}
            </span>
          </div>

          {/* Reference Price */}
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-secondaryText">Reference Price</span>
            <span className="font-mono font-medium text-primaryText tabular-nums">
              ${hasFinalBuild && buildSummary ? buildSummary.referencePriceUsd : check.price.referenceUsd}
            </span>
          </div>

          {/* Maximum Buy Price */}
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-secondaryText">Maximum Buy Price</span>
            <span className="font-mono font-bold text-primaryText tabular-nums">
              ${hasFinalBuild && buildSummary?.maxBuyPriceUsd ? buildSummary.maxBuyPriceUsd : check.price.maxBuyUsd}
            </span>
          </div>

          {/* Final Buy Price */}
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-secondaryText">Final Buy Price</span>
            <span className="font-mono font-bold text-sieveGreen tabular-nums">
              ${hasFinalBuild && buildSummary ? buildSummary.currentBuyPriceUsd : check.price.currentBuyUsd}
            </span>
          </div>

          {/* Premium */}
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-secondaryText">Premium over Reference</span>
            <span className="font-mono font-medium text-sieveGreen tabular-nums">
              +{hasFinalBuild && buildSummary ? buildSummary.premiumPct : check.price.premiumPct}%
            </span>
          </div>

          {/* Network Fee */}
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-secondaryText">Network Fee</span>
            <span className="font-mono text-mutedText tabular-nums">{feeDisplay}</span>
          </div>

          {/* Network & Wallet */}
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-secondaryText">Environment / Wallet</span>
            <span className="font-mono text-primaryText tabular-nums">
              {isMainnet ? "MAINNET" : "PRACTICE"} • {walletDisplay}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isBuilding}
            className="rounded-btn border border-borderBase px-4 py-2 text-xs font-semibold text-secondaryText hover:bg-surface-subtle hover:text-primaryText transition-colors min-h-[40px]"
          >
            Cancel
          </button>

          {!isMainnet ? (
            /* Practice Mode Action */
            <button
              type="button"
              onClick={onConfirmPractice}
              disabled={isBuilding}
              className="inline-flex items-center gap-2 rounded-btn bg-primaryText px-5 py-2 text-xs font-semibold text-white hover:bg-primaryText/90 transition-colors shadow-xs min-h-[40px] disabled:opacity-50"
            >
              {isBuilding ? (
                <span>Executing practice trade...</span>
              ) : (
                <>
                  <span>Confirm practice trade</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </>
              )}
            </button>
          ) : !hasFinalBuild ? (
            /* Mainnet Step 1: Prepare & Revalidate */
            <button
              type="button"
              onClick={onPrepareTransaction}
              disabled={isBuilding}
              className="inline-flex items-center gap-2 rounded-btn bg-primaryText px-5 py-2 text-xs font-semibold text-white hover:bg-primaryText/90 transition-colors shadow-xs min-h-[40px] disabled:opacity-50"
            >
              {isBuilding ? (
                <span>Preparing transaction...</span>
              ) : (
                <>
                  <span>Prepare transaction</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </>
              )}
            </button>
          ) : isExpired ? (
            /* Mainnet Step 2: Expired state -> Prompt to prepare again */
            <button
              type="button"
              onClick={onPrepareTransaction}
              disabled={isBuilding}
              className="inline-flex items-center gap-2 rounded-btn bg-primaryText px-5 py-2 text-xs font-semibold text-white hover:bg-primaryText/90 transition-colors shadow-xs min-h-[40px] disabled:opacity-50"
            >
              {isBuilding ? <span>Preparing transaction...</span> : <span>Prepare again</span>}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : (
            /* Mainnet Step 2: Explicit Confirmation in Wallet */
            <button
              type="button"
              onClick={onConfirmInWallet}
              disabled={isBuilding || isExpired}
              className="inline-flex items-center gap-2 rounded-btn bg-sieveGreen px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-xs min-h-[40px] disabled:opacity-50"
            >
              <span>Confirm in wallet</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
