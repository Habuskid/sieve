"use client";

import React from "react";
import { HistoryView } from "@/components/history/history-view";
import { useNetwork } from "@/components/app-shell/network-context";

export default function HistoryPage() {
  const { network } = useNetwork();
  return <HistoryView network={network} />;
}
