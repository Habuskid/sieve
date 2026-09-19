"use client";

import React, { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import type { NetworkMode } from "@/core/domain/types";

// Import wallet adapter default styles
import "@solana/wallet-adapter-react-ui/styles.css";

interface SolanaProviderProps {
  children: React.ReactNode;
  network?: NetworkMode;
}

export function SolanaWalletProvider({
  children,
  network = "testnet",
}: SolanaProviderProps) {
  // Use devnet RPC for testnet, or public mainnet-beta endpoint
  const endpoint = useMemo(() => {
    if (network === "mainnet") {
      return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("mainnet-beta");
    }
    return clusterApiUrl("devnet");
  }, [network]);

  // Standard wallet adapters (Phantom, Solflare, etc. are auto-detected by standard wallet adapter)
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
