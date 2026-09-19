"use client";

import React, { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { NetworkMode } from "@/core/domain/types";
import type { HistoryItem } from "@/server/services/history-service";
import { History, ExternalLink, ShieldAlert, CheckCircle2, Wallet, RefreshCw } from "lucide-react";

interface HistoryViewProps {
  network: NetworkMode;
}

export function HistoryView({ network }: HistoryViewProps) {
  const { publicKey, connected } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "TRADES" | "BLOCKED">("ALL");

  const fetchHistory = React.useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/history?wallet=${publicKey.toBase58()}&network=${network}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error("Failed to fetch history", err);
    } finally {
      setLoading(false);
    }
  }, [publicKey, network]);

  useEffect(() => {
    if (connected && publicKey) {
      fetchHistory();
    } else {
      setItems([]);
    }
  }, [connected, publicKey, fetchHistory]);

  const filteredItems = items.filter((item) => {
    if (filter === "TRADES") return item.type === "TRADE_CONFIRMED" || item.type === "TRADE_FAILED";
    if (filter === "BLOCKED") return item.type === "CHECK_BLOCKED";
    return true;
  });

  if (!connected) {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sieveBlue-soft text-sieveBlue">
          <Wallet className="h-7 w-7" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-primaryText">Connect your wallet</h2>
        <p className="text-xs text-secondaryText mt-1 mb-6 max-w-sm mx-auto">
          Connect your Solana wallet to view your past price checks, blocked trades, and confirmed orders.
        </p>
        <button
          type="button"
          onClick={() => setWalletModalVisible(true)}
          className="inline-flex items-center gap-2 rounded-btn bg-sieveBlue px-5 py-2.5 text-xs font-semibold text-white hover:bg-sieveBlue-hover transition-colors shadow-xs min-h-[44px]"
        >
          <Wallet className="h-4 w-4" aria-hidden="true" />
          Connect wallet
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primaryText">
            History
          </h1>
          <p className="text-sm text-secondaryText mt-0.5">
            Review previous price checks and completed trades.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchHistory}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-btn border border-borderBase bg-surface px-3.5 py-2 text-xs font-medium text-secondaryText hover:text-primaryText hover:bg-surface-subtle transition-colors shadow-2xs self-start sm:self-auto min-h-[44px]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div
        role="group"
        aria-label="History filters"
        className="flex items-center gap-2 mb-6"
      >
        <button
          type="button"
          onClick={() => setFilter("ALL")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors min-h-[36px] ${
            filter === "ALL"
              ? "bg-primaryText text-white font-semibold shadow-xs"
              : "bg-surface border border-borderBase text-secondaryText hover:text-primaryText"
          }`}
          aria-pressed={filter === "ALL"}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setFilter("TRADES")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors min-h-[36px] ${
            filter === "TRADES"
              ? "bg-primaryText text-white font-semibold shadow-xs"
              : "bg-surface border border-borderBase text-secondaryText hover:text-primaryText"
          }`}
          aria-pressed={filter === "TRADES"}
        >
          Trades
        </button>
        <button
          type="button"
          onClick={() => setFilter("BLOCKED")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors min-h-[36px] ${
            filter === "BLOCKED"
              ? "bg-primaryText text-white font-semibold shadow-xs"
              : "bg-surface border border-borderBase text-secondaryText hover:text-primaryText"
          }`}
          aria-pressed={filter === "BLOCKED"}
        >
          Blocked Checks
        </button>
      </div>

      {/* History Items List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-16 w-full rounded-card bg-surface border border-borderBase animate-pulse"
            />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-panel bg-surface border border-borderBase p-12 text-center">
          <History className="mx-auto h-8 w-8 text-mutedText mb-3" aria-hidden="true" />
          <h3 className="text-base font-semibold text-primaryText">No history found</h3>
          <p className="text-xs text-secondaryText mt-1">
            Price checks and completed trades on this network will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const isTrade = item.type === "TRADE_CONFIRMED";
            const isBlocked = item.type === "CHECK_BLOCKED";
            const solscanUrl = item.signature
              ? item.network === "mainnet"
                ? `https://solscan.io/tx/${item.signature}`
                : `https://solscan.io/tx/${item.signature}?cluster=devnet`
              : null;

            return (
              <div
                key={item.id}
                className="rounded-card bg-surface border border-borderBase p-4 shadow-2xs hover:bg-surface-subtle/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      isTrade
                        ? "bg-sieveGreen-soft text-sieveGreen border border-emerald-200"
                        : isBlocked
                        ? "bg-sieveRed-soft text-sieveRed border border-rose-200"
                        : "bg-surface-subtle text-secondaryText border border-borderBase"
                    }`}
                  >
                    {isTrade ? (
                      <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    ) : isBlocked ? (
                      <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <History className="h-5 w-5" aria-hidden="true" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-primaryText">
                        {item.asset.name} ({item.asset.symbol})
                      </span>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          isTrade
                            ? "bg-sieveGreen-soft text-sieveGreen"
                            : isBlocked
                            ? "bg-sieveRed-soft text-sieveRed"
                            : "bg-surface-subtle text-secondaryText"
                        }`}
                      >
                        {item.statusLabel}
                      </span>
                    </div>

                    <p className="text-xs text-secondaryText mt-0.5">
                      Paid:{" "}
                      <span className="font-mono font-medium text-primaryText tabular-nums">
                        {item.funding.amount} {item.funding.asset}
                      </span>{" "}
                      • Buy:{" "}
                      <span className="font-mono tabular-nums">${item.price.checkedBuyUsd}</span> (
                      {item.price.premiumPct}% premium) • Limit:{" "}
                      <span className="font-mono tabular-nums">{item.price.limitPct}%</span>
                    </p>

                    <span className="text-[11px] text-mutedText mt-0.5 block">
                      {new Date(item.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Right side Solscan link */}
                {solscanUrl && (
                  <a
                    href={solscanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-mono text-sieveBlue hover:underline self-end sm:self-center tabular-nums"
                  >
                    <span>View on Solscan</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
