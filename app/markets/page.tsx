"use client";

import React from "react";
import { MarketsView } from "@/components/markets/markets-view";
import { useNetwork } from "@/components/app-shell/network-context";

export default function MarketsPage() {
  const { network } = useNetwork();
  return <MarketsView network={network} />;
}
