"use client";

import React from "react";
import type { TradeReceipt } from "@/core/domain/types";
import { ExternalLink, ArrowLeft } from "lucide-react";

interface TradeReceiptViewProps {
  receipt: TradeReceipt;
  onDone: () => void;
}

export function TradeReceiptView({ receipt, onDone }: TradeReceiptViewProps) {
  const isConfirmed = receipt.status === "CONFIRMED";
  const hasRealSignature = Boolean(
    receipt.signature && !receipt.signature.startsWith("sim-")
  );
  const solscanUrl =
    hasRealSignature && receipt.signature
      ? `https://solscan.io/tx/${receipt.signature}`
      : null;

  const boughtDisplay = receipt.realizedTargetAmount
    ? `${receipt.realizedTargetAmount} ${receipt.targetSymbol}`
    : "Unavailable";

  return (
    <div className="rounded-panel bg-surface border border-borderBase p-6 sm:p-8 shadow-xs max-w-xl mx-auto animate-in fade-in zoom-in-95">
      {/* Header */}
      <div className="pb-4 border-b border-borderBase mb-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-secondaryText">
            MAINNET EXECUTION
          </span>
          <span
            className={`text-xs font-mono font-bold px-2 py-0.5 rounded-[4px] border ${
              isConfirmed
                ? "bg-sieveGreen-soft border-emerald-300 text-sieveGreen"
                : "bg-sieveRed-soft border-rose-300 text-sieveRed"
            }`}
          >
            {isConfirmed ? "CONFIRMED" : "FAILED"}
          </span>
        </div>
        <h2 className="text-xl font-bold text-primaryText mt-1">
          {isConfirmed ? "Trade complete" : "Trade wasn't completed"}
        </h2>
        <p className="text-xs text-secondaryText mt-0.5">
          {isConfirmed
            ? `Your buy of ${receipt.targetSymbol} was confirmed on Solana.`
            : receipt.failureCode
            ? `Transaction failed (${receipt.failureCode}). The trade did not complete. A network fee may still have been charged.`
            : "The trade did not complete. A network fee may still have been charged."}
        </p>
      </div>

      {/* Confirmation Rows */}
      <div className="divide-y divide-borderBase border-b border-borderBase text-xs mb-6">
        {/* Asset */}
        <div className="py-2.5 flex items-center justify-between">
          <span className="text-secondaryText">Asset</span>
          <span className="font-bold text-primaryText font-mono">
            {receipt.targetSymbol}
          </span>
        </div>

        {/* Actual Paid */}
        <div className="py-2.5 flex items-center justify-between">
          <span className="text-secondaryText">Actual Paid</span>
          <div className="text-right">
            <span className="font-mono font-bold text-primaryText tabular-nums block">
              {receipt.actualFundingAmount
                ? `${receipt.actualFundingAmount} ${receipt.fundingAsset}`
                : `${receipt.fundingAmount} ${receipt.fundingAsset}`}
            </span>
            {receipt.actualFundingAmount &&
              receipt.requestedFundingAmount &&
              receipt.actualFundingAmount !== receipt.requestedFundingAmount && (
                <span className="text-mutedText text-[10px] block">
                  Requested: {receipt.requestedFundingAmount} {receipt.fundingAsset}
                </span>
              )}
          </div>
        </div>

        {/* Actual Received */}
        <div className="py-2.5 flex items-center justify-between">
          <span className="text-secondaryText">Actual Received</span>
          <span className="font-mono font-bold text-sieveGreen tabular-nums">
            {boughtDisplay}
          </span>
        </div>

        {/* Reference Price */}
        <div className="py-2.5 flex items-center justify-between">
          <span className="text-secondaryText">Reference Price</span>
          <span className="font-mono text-primaryText tabular-nums">
            ${receipt.referencePriceUsd}
          </span>
        </div>

        {/* Executed Price */}
        <div className="py-2.5 flex items-center justify-between">
          <span className="text-secondaryText">Executed Buy Price</span>
          <span className="font-mono font-bold text-sieveGreen tabular-nums">
            ${receipt.checkedBuyPriceUsd}
          </span>
        </div>

        {/* Premium */}
        <div className="py-2.5 flex items-center justify-between">
          <span className="text-secondaryText">Premium over Reference</span>
          <span className="font-mono font-medium text-sieveGreen tabular-nums">
            +{(receipt.premiumBps / 100).toFixed(2)}%
          </span>
        </div>

        {/* Transaction Signature */}
        <div className="py-2.5 flex items-center justify-between">
          <span className="text-secondaryText">
            Transaction
          </span>
          {hasRealSignature && solscanUrl && receipt.signature ? (
            <a
              href={solscanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-sieveBlue hover:underline tabular-nums"
            >
              <span>
                {receipt.signature.slice(0, 8)}...{receipt.signature.slice(-8)}
              </span>
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          ) : (
            <span className="font-mono text-secondaryText">
              Transaction reconciliation unavailable
            </span>
          )}
        </div>

        {/* Timestamp */}
        <div className="py-2.5 flex items-center justify-between">
          <span className="text-secondaryText">Execution Time</span>
          <span className="font-mono text-secondaryText tabular-nums">
            {receipt.confirmedAt ? new Date(receipt.confirmedAt).toLocaleString() : "—"}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className={`flex items-center ${hasRealSignature && solscanUrl ? "justify-between" : "justify-end"} gap-3`}>
        {hasRealSignature && solscanUrl && (
          <a
            href={solscanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-btn border border-borderBase px-3.5 py-2 text-xs font-semibold text-secondaryText hover:text-primaryText hover:bg-surface-subtle transition-colors min-h-[40px]"
          >
            <span>View on Solscan</span>
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}

        <button
          type="button"
          onClick={onDone}
          className="sieve-control-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Done</span>
        </button>
      </div>
    </div>
  );
}
