"use client";

import React, { useState } from "react";
import type { NetworkMode } from "@/core/domain/types";
import { AlertCircle } from "lucide-react";

interface NetworkToggleProps {
  currentNetwork: NetworkMode;
  onNetworkChange: (newNetwork: NetworkMode) => void;
}

export function NetworkToggle({
  currentNetwork,
  onNetworkChange,
}: NetworkToggleProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pendingNetwork, setPendingNetwork] = useState<NetworkMode | null>(null);

  const handleToggleClick = (target: NetworkMode) => {
    if (target === currentNetwork) return;
    setPendingNetwork(target);
    setIsDialogOpen(true);
  };

  const confirmSwitch = () => {
    if (pendingNetwork) {
      onNetworkChange(pendingNetwork);
    }
    setIsDialogOpen(false);
    setPendingNetwork(null);
  };

  return (
    <>
      <div
        role="group"
        aria-label="Network selection"
        className="inline-flex items-center rounded-btn bg-surface border border-borderBase p-0.5 text-xs font-mono"
      >
        <button
          type="button"
          onClick={() => handleToggleClick("mainnet")}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] transition-colors min-h-[32px] ${
            currentNetwork === "mainnet"
              ? "bg-primaryText text-white font-semibold"
              : "text-secondaryText hover:text-primaryText hover:bg-surface-subtle"
          }`}
          aria-pressed={currentNetwork === "mainnet"}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              currentNetwork === "mainnet" ? "bg-emerald-400" : "bg-mutedText"
            }`}
            aria-hidden="true"
          />
          <span className="tracking-wider">Mainnet</span>
        </button>

        <button
          type="button"
          onClick={() => handleToggleClick("testnet")}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] transition-colors min-h-[32px] ${
            currentNetwork === "testnet"
              ? "bg-sieveAmber text-white font-semibold"
              : "text-secondaryText hover:text-primaryText hover:bg-surface-subtle"
          }`}
          aria-pressed={currentNetwork === "testnet"}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              currentNetwork === "testnet" ? "bg-amber-300" : "bg-mutedText"
            }`}
            aria-hidden="true"
          />
          <span className="tracking-wider">Practice mode</span>
        </button>
      </div>

      {/* Network Switch Confirmation Dialog */}
      {isDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setIsDialogOpen(false);
              setPendingNetwork(null);
            }
          }}
        >
          <div className="w-full max-w-md rounded-panel bg-surface p-6 shadow-xl border border-borderBase animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] bg-sieveBlue-soft text-sieveBlue">
                <AlertCircle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h3 id="dialog-title" className="text-base font-bold text-primaryText">
                  Switch to {pendingNetwork === "mainnet" ? "Mainnet" : "Practice mode"}?
                </h3>
                <p className="text-xs text-secondaryText leading-relaxed">
                  {pendingNetwork === "mainnet"
                    ? "Mainnet connects to live Solana market liquidity and real PreStocks assets. Any active practice check will be cleared."
                    : "Practice mode uses deterministic test data so you can test price checks and limits without using real funds."}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5 pt-4 border-t border-borderBase">
              <button
                type="button"
                onClick={() => {
                  setIsDialogOpen(false);
                  setPendingNetwork(null);
                }}
                className="rounded-btn border border-borderBase px-3.5 py-2 text-xs font-semibold text-secondaryText hover:bg-surface-subtle hover:text-primaryText transition-colors min-h-[38px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSwitch}
                className="rounded-btn bg-primaryText px-4 py-2 text-xs font-semibold text-white hover:bg-primaryText/90 transition-colors min-h-[38px]"
              >
                Switch Network
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
