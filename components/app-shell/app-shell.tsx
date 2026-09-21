"use client";

import React from "react";
import { SolanaWalletProvider } from "./solana-provider";
import { Header } from "./header";
import { BottomNav } from "./bottom-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SolanaWalletProvider>
      <div className="flex min-h-dvh flex-col bg-background pb-16 text-primaryText md:pb-0">
        <Header />
        <main className="flex-1">{children}</main>
        <BottomNav />
      </div>
    </SolanaWalletProvider>
  );
}
