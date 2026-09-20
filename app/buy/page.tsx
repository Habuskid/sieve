"use client";

import React, { Suspense } from "react";
import { BuyView } from "@/components/buy/buy-view";
import { useNetwork } from "@/components/app-shell/network-context";

export default function BuyPage() {
  const { network } = useNetwork();

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:px-10">
          <div className="h-8 w-56 animate-pulse bg-surface-subtle" />
          <div className="mt-8 h-px w-full bg-borderBase" />
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            <div className="h-24 animate-pulse bg-surface-subtle" />
            <div className="h-24 animate-pulse bg-surface-subtle" />
            <div className="h-24 animate-pulse bg-surface-subtle" />
          </div>
        </div>
      }
    >
      <BuyView network={network} />
    </Suspense>
  );
}
