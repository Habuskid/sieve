"use client";

import React, { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { NetworkMode } from "@/core/domain/types";
import type { HistoryItem } from "@/server/services/history-service";
import { ExternalLink, RefreshCw } from "lucide-react";

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
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16 text-center">
        <div className="rounded-panel bg-surface border border-borderBase p-8 shadow-xs max-w-md mx-auto">
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-secondaryText block mb-1">
            AUTHENTICATION REQUIRED
          </span>
          <h2 className="text-lg font-bold text-primaryText mb-1.5">Connect wallet to view history</h2>
          <p className="text-xs text-secondaryText mb-6 leading-relaxed">
            Connect your Solana wallet to view your past price checks, blocked orders, and confirmed trades.
          </p>
          <button
            type="button"
            onClick={() => setWalletModalVisible(true)}
            className="sieve-control-primary"
          >
            Connect wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 mb-4 border-b border-borderBase">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-primaryText">
            Execution History
          </h1>
          <p className="text-xs text-secondaryText mt-0.5">
            Audit previous price checks, boundary-enforced blocks, and confirmed on-chain executions.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchHistory}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-[4px] border border-borderBase bg-surface px-3 py-1.5 text-xs font-semibold text-secondaryText hover:text-primaryText hover:bg-surface-subtle transition-colors shadow-2xs self-start sm:self-auto min-h-[34px]"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div
        role="group"
        aria-label="History filters"
        className="flex items-center gap-1.5 mb-4"
      >
        <button
          type="button"
          onClick={() => setFilter("ALL")}
          className={`px-3 py-1 rounded-[4px] text-xs font-medium transition-colors min-h-[32px] border ${
            filter === "ALL"
              ? "bg-surface-subtle border-borderStrong text-primaryText font-semibold shadow-2xs"
              : "bg-surface border-borderBase text-secondaryText hover:text-primaryText hover:bg-surface-subtle"
          }`}
          aria-pressed={filter === "ALL"}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setFilter("TRADES")}
          className={`px-3 py-1 rounded-[4px] text-xs font-medium transition-colors min-h-[32px] border ${
            filter === "TRADES"
              ? "bg-surface-subtle border-borderStrong text-primaryText font-semibold shadow-2xs"
              : "bg-surface border-borderBase text-secondaryText hover:text-primaryText hover:bg-surface-subtle"
          }`}
          aria-pressed={filter === "TRADES"}
        >
          Trades
        </button>
        <button
          type="button"
          onClick={() => setFilter("BLOCKED")}
          className={`px-3 py-1 rounded-[4px] text-xs font-medium transition-colors min-h-[32px] border ${
            filter === "BLOCKED"
              ? "bg-surface-subtle border-borderStrong text-primaryText font-semibold shadow-2xs"
              : "bg-surface border-borderBase text-secondaryText hover:text-primaryText hover:bg-surface-subtle"
          }`}
          aria-pressed={filter === "BLOCKED"}
        >
          Blocked Checks
        </button>
      </div>

      {/* History Items List / Table */}
      {loading ? (
        <div className="border border-borderBase rounded-panel overflow-hidden bg-surface">
          <div className="divide-y divide-borderBase">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 w-full bg-surface animate-pulse" />
            ))}
          </div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-panel bg-surface border border-borderBase p-8 text-center">
          <p className="text-xs font-medium text-secondaryText">
            No execution history found for this filter.
          </p>
        </div>
      ) : (
        <div className="border border-borderBase rounded-panel overflow-hidden bg-surface shadow-2xs">
          {/* Desktop Financial Table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-surface-subtle border-b border-borderBase text-[10px] font-mono font-semibold uppercase tracking-wider text-secondaryText">
                <tr>
                  <th scope="col" className="py-2.5 px-4">Status</th>
                  <th scope="col" className="py-2.5 px-4">Asset</th>
                  <th scope="col" className="py-2.5 px-4 text-right">Paid</th>
                  <th scope="col" className="py-2.5 px-4 text-right">Buy Price</th>
                  <th scope="col" className="py-2.5 px-4 text-right">Limit</th>
                  <th scope="col" className="py-2.5 px-4 text-right">Time</th>
                  <th scope="col" className="py-2.5 px-4 text-right">Identifier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderBase">
                {filteredItems.map((item) => {
                  const isTrade = item.type === "TRADE_CONFIRMED";
                  const isBlocked = item.type === "CHECK_BLOCKED";
                  const isPractice = item.network !== "mainnet";
                  const hasRealSignature = Boolean(
                    item.signature && !item.signature.startsWith("sim-")
                  );
                  const solscanUrl =
                    !isPractice && hasRealSignature && item.signature
                      ? `https://solscan.io/tx/${item.signature}`
                      : null;

                  return (
                    <tr key={item.id} className="hover:bg-surface-subtle/50 transition-colors">
                      {/* Status */}
                      <td className="py-2.5 px-4">
                        <span
                          className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded-[2px] border ${
                            isTrade
                              ? "bg-sieveGreen-soft border-emerald-300 text-sieveGreen"
                              : isBlocked
                              ? "bg-sieveRed-soft border-rose-300 text-sieveRed"
                              : "bg-surface-subtle border-borderBase text-secondaryText"
                          }`}
                        >
                          {item.statusLabel}
                        </span>
                      </td>

                      {/* Asset */}
                      <td className="py-2.5 px-4">
                        <span className="font-bold text-primaryText block">
                          {item.asset.symbol}
                        </span>
                        <span className="text-[11px] text-secondaryText">
                          {item.asset.name}
                        </span>
                      </td>

                      {/* Paid */}
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-primaryText font-medium">
                        {item.funding.amount} {item.funding.asset}
                      </td>

                      {/* Buy Price */}
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-primaryText">
                        ${item.price.checkedBuyUsd}{" "}
                        <span className="text-secondaryText text-[11px]">
                          (+{item.price.premiumPct}%)
                        </span>
                      </td>

                      {/* Limit */}
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-secondaryText">
                        +{item.price.limitPct}%
                      </td>

                      {/* Time */}
                      <td className="py-2.5 px-4 text-right font-mono text-[11px] text-mutedText tabular-nums">
                        {new Date(item.timestamp).toLocaleString()}
                      </td>

                      {/* Identifier */}
                      <td className="py-2.5 px-4 text-right">
                        {isPractice ? (
                          <span
                            className="font-mono text-[11px] text-secondaryText"
                            title={item.signature || undefined}
                          >
                            Simulation ID: {item.signature ? (item.signature.startsWith("sim-") ? item.signature.slice(0, 16) + "..." : item.signature.slice(0, 12) + "...") : "—"}
                          </span>
                        ) : solscanUrl && item.signature ? (
                          <a
                            href={solscanUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-xs text-sieveBlue hover:underline tabular-nums"
                          >
                            <span>
                              {item.signature.slice(0, 4)}...{item.signature.slice(-4)}
                            </span>
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        ) : (
                          <span className="font-mono text-[11px] text-mutedText">
                            Transaction reconciliation unavailable
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Rows */}
          <div className="sm:hidden divide-y divide-borderBase text-xs">
            {filteredItems.map((item) => {
              const isTrade = item.type === "TRADE_CONFIRMED";
              const isBlocked = item.type === "CHECK_BLOCKED";
              const isPractice = item.network !== "mainnet";
              const hasRealSignature = Boolean(
                item.signature && !item.signature.startsWith("sim-")
              );
              const solscanUrl =
                !isPractice && hasRealSignature && item.signature
                  ? `https://solscan.io/tx/${item.signature}`
                  : null;

              return (
                <div key={item.id} className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-primaryText">
                      {item.asset.symbol} ({item.asset.name})
                    </span>
                    <span
                      className={`font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-[2px] border ${
                        isTrade
                          ? "bg-sieveGreen-soft border-emerald-300 text-sieveGreen"
                          : isBlocked
                          ? "bg-sieveRed-soft border-rose-300 text-sieveRed"
                          : "bg-surface-subtle border-borderBase text-secondaryText"
                      }`}
                    >
                      {item.statusLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-secondaryText font-mono">
                    <div>
                      Paid: <span className="text-primaryText font-medium">{item.funding.amount} {item.funding.asset}</span>
                    </div>
                    <div className="text-right">
                      Buy: <span className="text-primaryText font-medium">${item.price.checkedBuyUsd}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-[10px] text-mutedText font-mono">
                    <span>{new Date(item.timestamp).toLocaleString()}</span>
                    {isPractice ? (
                      <span className="text-secondaryText font-mono">
                        Simulation ID: {item.signature ? item.signature.slice(0, 12) + "..." : "—"}
                      </span>
                    ) : solscanUrl ? (
                      <a
                        href={solscanUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sieveBlue hover:underline"
                      >
                        <span>Solscan</span>
                        <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="text-mutedText">
                        Reconciliation unavailable
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
