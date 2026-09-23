import type { Metadata } from "next";
import React, { Suspense } from "react";
import { BuyView } from "@/components/buy/buy-view";

export const metadata: Metadata = {
  title: "Dashboard — Execution | Sieve",
  description: "User-defined execution boundary engine for PreStocks on Solana.",
};

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="h-8 w-48 animate-pulse rounded bg-surface-subtle" />
          <div className="mt-6 h-px w-full bg-borderBase" />
          <div className="mt-8 space-y-6">
            <div className="h-28 animate-pulse rounded-panel bg-surface-subtle" />
            <div className="h-44 animate-pulse rounded-panel bg-surface-subtle" />
          </div>
        </div>
      }
    >
      <BuyView isDashboard />
    </Suspense>
  );
}
