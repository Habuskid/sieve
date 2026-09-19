"use client";

import React from "react";
import { RefreshCw, Shield } from "lucide-react";

interface WalletWaitingProps {
  onCancel?: () => void;
}

export function WalletWaiting({ onCancel }: WalletWaitingProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-waiting-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-sm rounded-panel bg-surface p-8 shadow-xl border border-borderBase text-center animate-in fade-in zoom-in-95">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sieveBlue-soft text-sieveBlue relative">
          <RefreshCw className="h-7 w-7 animate-spin" aria-hidden="true" />
          <Shield className="h-3.5 w-3.5 absolute text-sieveBlue" aria-hidden="true" />
        </div>

        <h3 id="wallet-waiting-title" className="text-lg font-bold text-primaryText mb-1.5">
          Waiting for your wallet
        </h3>
        <p className="text-xs text-secondaryText mb-6">
          Please approve the transaction in your Solana wallet window.
        </p>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-btn border border-borderBase px-4 py-2 text-xs font-medium text-secondaryText hover:text-primaryText hover:bg-surface-subtle transition-colors min-h-[44px]"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
