"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { LogOut, ChevronDown } from "lucide-react";

export function WalletButton() {
  const router = useRouter();
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
          className="inline-flex min-h-9 items-center gap-2 border border-borderStrong px-3 py-1.5 text-xs font-medium text-primaryText transition-colors duration-150 hover:border-sieveBlue"
          aria-expanded={dropdownOpen}
          aria-haspopup="true"
        >
          <span className="size-1.5 rounded-full bg-sieveGreen" aria-hidden="true" />
          <span className="tabular-nums">{truncated}</span>
          <ChevronDown className="h-3 w-3 text-secondaryText" aria-hidden="true" />
        </button>

        {dropdownOpen && (
          <div
            className="absolute right-0 mt-1.5 w-56 rounded-panel bg-surface p-1 shadow-2xl border border-borderStrong z-40 animate-in fade-in zoom-in-95"
            role="menu"
          >
            <div className="mb-1 border-b border-borderBase px-3 py-2 text-xs text-secondaryText">
              <span className="block text-[10px] font-semibold uppercase text-mutedText">
                Connected Wallet
              </span>
              <span className="font-mono text-[11px] text-primaryText break-all select-all pt-0.5 block">
                {base58}
              </span>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await disconnect();
                } catch (err) {
                  console.error("Disconnect error", err);
                }
                setDropdownOpen(false);
                router.replace("/");
              }}
              className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-sm font-medium text-sieveRed transition-colors duration-150 hover:bg-sieveRed/10"
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

  const handleConnectClick = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sieve:wallet-connect-intent"));
    }
    setVisible(true);
  };

  return (
    <button
      type="button"
      onClick={handleConnectClick}
      disabled={connecting}
      className="inline-flex min-h-9 items-center gap-1.5 bg-sieveBlue px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition-colors duration-150 hover:bg-sieveBlue-hover disabled:opacity-50 sm:text-sm"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-slate-950/60" aria-hidden="true" />
      <span>{connecting ? "Connecting..." : "Connect wallet"}</span>
    </button>
  );
}
