"use client";

import React, { Suspense } from "react";
import { BuyView } from "@/components/buy/buy-view";
import { useNetwork } from "@/components/app-shell/network-context";

export default function BuyPage() {
  const { network } = useNetwork();

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-4 py-12 text-center">
          <div className="h-8 w-48 mx-auto bg-surface-subtle rounded-btn animate-pulse mb-4" />
          <div className="h-96 w-full bg-surface-subtle rounded-panel border border-borderBase animate-pulse" />
        </div>
      }
    >
      <BuyView network={network} />
    </Suspense>
  );
}
