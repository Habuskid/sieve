"use client";

import React from "react";
import { NetworkProvider, useNetwork } from "./network-context";
import { SolanaWalletProvider } from "./solana-provider";
import { Header } from "./header";
import { BottomNav } from "./bottom-nav";

function InnerShell({ children }: { children: React.ReactNode }) {
  const { network, setNetwork } = useNetwork();

  return (
    <SolanaWalletProvider network={network}>
      <div className="flex min-h-dvh flex-col bg-background pb-16 text-primaryText md:pb-0">
        <Header network={network} onNetworkChange={setNetwork} />
        <main className="flex-1">{children}</main>
        <BottomNav />
      </div>
    </SolanaWalletProvider>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <NetworkProvider>
      <InnerShell>{children}</InnerShell>
    </NetworkProvider>
  );
}
