"use client";

import React, { Suspense } from "react";
import { BuyView } from "@/components/buy/buy-view";
import { useNetwork } from "@/components/app-shell/network-context";

export default function BuyPage() {
  const { network } = useNetwork();

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 py-12 text-center">
          <div className="h-8 w-48 mx-auto bg-surface border border-borderBase rounded-[2px] animate-pulse mb-4" />
          <div className="h-96 w-full bg-surface rounded-panel border border-borderBase animate-pulse" />
        </div>
      }
    >
      <BuyView network={network} />
    </Suspense>
  );
}
