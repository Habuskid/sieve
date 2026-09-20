"use client";

import React, { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { LogOut, ChevronDown } from "lucide-react";

export function WalletButton() {
  const { publicKey, connected, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [mounted, setMounted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-8 w-28 rounded-btn bg-surface-subtle border border-borderBase animate-pulse" />
    );
  }

  if (connected && publicKey) {
    const base58 = publicKey.toBase58();
    const truncated = `${base58.slice(0, 4)}...${base58.slice(-4)}`;

    return (
      <div className="relative inline-block text-left">
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="inline-flex items-center gap-2 rounded-btn bg-surface border border-borderBase px-3 py-1.5 text-xs font-mono font-medium text-primaryText hover:bg-surface-subtle transition-colors min-h-[36px]"
          aria-expanded={dropdownOpen}
          aria-haspopup="true"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          <span>{truncated}</span>
          <ChevronDown className="h-3 w-3 text-secondaryText" aria-hidden="true" />
        </button>

        {dropdownOpen && (
          <div
            className="absolute right-0 mt-1.5 w-52 rounded-card bg-surface p-1 shadow-lg border border-borderBase z-40 animate-in fade-in zoom-in-95"
            role="menu"
          >
            <div className="px-3 py-2 text-xs text-secondaryText border-b border-borderBase mb-1">
              <span className="block font-semibold text-primaryText">Connected Wallet</span>
              <span className="font-mono text-[11px] break-all">{base58}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                disconnect();
                setDropdownOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-[4px] px-3 py-1.5 text-xs font-medium text-sieveRed hover:bg-sieveRed-soft transition-colors"
              role="menuitem"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setVisible(true)}
      disabled={connecting}
      className="inline-flex items-center gap-1.5 rounded-btn bg-primaryText px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-primaryText/90 transition-colors min-h-[36px] disabled:opacity-50"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden="true" />
      <span>{connecting ? "Connecting..." : "Connect wallet"}</span>
    </button>
  );
}
