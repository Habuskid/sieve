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
        className="inline-flex h-8 items-stretch overflow-hidden rounded-[4px] border border-borderBase bg-background text-[11px] sm:h-8 sm:text-xs"
      >
        <button
          type="button"
          onClick={() => handleToggleClick("mainnet")}
          className={`relative flex items-center px-2.5 transition-colors duration-150 sm:px-3 ${
            currentNetwork === "mainnet"
              ? "bg-sieveBlue-soft text-sieveBlue font-semibold after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-sieveBlue"
              : "text-mutedText hover:bg-surface-subtle/60 hover:text-secondaryText"
          }`}
          aria-pressed={currentNetwork === "mainnet"}
        >
          <span>Mainnet</span>
        </button>

        <button
          type="button"
          aria-label="Testnet"
          onClick={() => handleToggleClick("testnet")}
          className={`relative flex items-center border-l border-borderBase px-2.5 transition-colors duration-150 sm:px-3 ${
            currentNetwork === "testnet"
              ? "bg-sieveBlue-soft text-sieveBlue font-semibold after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-sieveBlue"
              : "text-mutedText hover:bg-surface-subtle/60 hover:text-secondaryText"
          }`}
          aria-pressed={currentNetwork === "testnet"}
        >
          <span>Testnet</span>
        </button>
      </div>

      {/* Network Switch Confirmation Dialog */}
      {isDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setIsDialogOpen(false);
              setPendingNetwork(null);
            }
          }}
        >
          <div className="w-full max-w-md rounded-panel bg-surface p-6 shadow-2xl border border-borderStrong animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center text-sieveBlue">
                <AlertCircle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h3 id="dialog-title" className="text-base font-semibold text-primaryText">
                  Switch to {pendingNetwork === "mainnet" ? "Mainnet" : "Testnet"}?
                </h3>
                <p className="text-xs text-secondaryText leading-relaxed pt-1">
                  {pendingNetwork === "mainnet"
                    ? "Mainnet connects to live Solana market liquidity and real PreStocks assets. Any active testnet check will be cleared."
                    : "Testnet uses simulated data so you can test price checks and limits without using real funds."}
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
                className="min-h-11 border border-borderStrong px-4 py-2 text-sm font-medium text-secondaryText transition-colors duration-150 hover:text-primaryText"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSwitch}
                className="min-h-11 bg-sieveBlue px-4 py-2 text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-sieveBlue-hover"
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
