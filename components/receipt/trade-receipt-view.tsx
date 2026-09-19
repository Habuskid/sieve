"use client";

import React from "react";
import type { TradeReceipt } from "@/core/domain/types";
import { CheckCircle2, XCircle, ExternalLink, ArrowLeft } from "lucide-react";

interface TradeReceiptViewProps {
  receipt: TradeReceipt;
  onDone: () => void;
}

export function TradeReceiptView({ receipt, onDone }: TradeReceiptViewProps) {
  const isConfirmed = receipt.status === "CONFIRMED";
  const solscanUrl =
    receipt.network === "mainnet"
      ? `https://solscan.io/tx/${receipt.signature}`
      : `https://solscan.io/tx/${receipt.signature}?cluster=devnet`;

  return (
    <div className="rounded-panel bg-surface border border-borderBase p-6 sm:p-8 shadow-xs max-w-xl mx-auto animate-in fade-in zoom-in-95">
      {/* Icon & Title */}
      <div className="text-center mb-6">
        <div
          className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full ${
            isConfirmed
              ? "bg-sieveGreen-soft text-sieveGreen"
              : "bg-sieveRed-soft text-sieveRed"
          }`}
        >
          {isConfirmed ? (
            <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
          ) : (
            <XCircle className="h-8 w-8" aria-hidden="true" />
          )}
        </div>

        <h2 className="text-2xl font-bold text-primaryText">
          {isConfirmed ? "Trade complete" : "Trade wasn't completed"}
        </h2>
        <p className="text-sm text-secondaryText mt-1">
          {isConfirmed
            ? `Your buy of ${receipt.targetSymbol} was confirmed on Solana.`
            : receipt.failureCode
            ? `Transaction failed (${receipt.failureCode}). The trade did not complete. A network fee may still have been charged.`
            : "The trade did not complete. A network fee may still have been charged."}
        </p>
      </div>

      {/* Details Card */}
      <div className="rounded-card bg-surface-subtle border border-borderBase p-5 mb-6 space-y-3.5 text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-borderBase">
          <span className="text-secondaryText">Bought</span>
          <span className="font-mono font-bold text-sm text-primaryText tabular-nums">
            {receipt.realizedTargetAmount || receipt.expectedTargetAmount} {receipt.targetSymbol}
          </span>
        </div>

        <div className="flex items-center justify-between pb-3 border-b border-borderBase">
          <span className="text-secondaryText">Paid</span>
          <span className="font-mono font-bold text-sm text-primaryText tabular-nums">
            {receipt.fundingAmount} {receipt.fundingAsset}
          </span>
        </div>

        <div className="flex items-center justify-between pb-3 border-b border-borderBase">
          <span className="text-secondaryText">Reference price</span>
          <span className="font-mono font-medium text-primaryText tabular-nums">
            ${receipt.referencePriceUsd}
          </span>
        </div>

        <div className="flex items-center justify-between pb-3 border-b border-borderBase">
          <span className="text-secondaryText">Buy price</span>
          <span className="font-mono font-medium text-sieveGreen tabular-nums">
            ${receipt.checkedBuyPriceUsd} (+{(receipt.premiumBps / 100).toFixed(2)}%)
          </span>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-secondaryText">Signature</span>
          <a
            href={solscanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-sieveBlue hover:underline tabular-nums"
          >
            <span>
              {receipt.signature.slice(0, 6)}...{receipt.signature.slice(-6)}
            </span>
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between gap-3">
        <a
          href={solscanUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-btn border border-borderBase px-4 py-2.5 text-xs font-semibold text-secondaryText hover:text-primaryText hover:bg-surface-subtle transition-colors min-h-[44px]"
        >
          <span>View on Solscan</span>
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>

        <button
          type="button"
          onClick={onDone}
          className="inline-flex items-center gap-2 rounded-btn bg-primaryText px-6 py-2.5 text-xs font-semibold text-white hover:bg-primaryText/90 transition-colors shadow-xs min-h-[44px]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Done</span>
        </button>
      </div>
    </div>
  );
}
