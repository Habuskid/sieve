"use client";

import React from "react";
import { RefreshCw } from "lucide-react";

interface WalletWaitingProps {
  onCancel?: () => void;
}

export function WalletWaiting({ onCancel }: WalletWaitingProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-waiting-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-sm rounded-panel bg-surface p-6 shadow-xl border border-borderBase text-center animate-in fade-in zoom-in-95">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-[4px] bg-sieveBlue-soft text-sieveBlue">
          <RefreshCw className="h-5 w-5 animate-spin" aria-hidden="true" />
        </div>

        <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-secondaryText block mb-1">
          AWAITING APPROVAL
        </span>
        <h3 id="wallet-waiting-title" className="text-base font-bold text-primaryText mb-1">
          Waiting for your wallet
        </h3>
        <p className="text-xs text-secondaryText mb-5 leading-relaxed">
          Please approve the transaction in your Solana wallet window.
        </p>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-btn border border-borderBase px-4 py-2 text-xs font-semibold text-secondaryText hover:text-primaryText hover:bg-surface-subtle transition-colors min-h-[38px]"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
