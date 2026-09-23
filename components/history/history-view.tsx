"use client";

import React, { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { HistoryItem } from "@/server/services/history-service";
import { ExternalLink } from "lucide-react";
import { RefreshAction } from "@/components/ui/refresh-action";

export type HistoryFilter = "ALL" | "EXECUTIONS" | "CHECKS";

function formatDisplayAmount(amountStr?: string | number, asset?: string): string {
  if (!amountStr || amountStr === "—") return "—";
  const num = typeof amountStr === "number" ? amountStr : parseFloat(amountStr);
  if (isNaN(num)) return String(amountStr);
  if (asset === "USDC") {
    return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (asset === "SOL") {
    return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function formatDisplayPrice(priceStr?: string | number | null): string {
  if (!priceStr || priceStr === "—") return "—";
  const num = typeof priceStr === "number" ? priceStr : parseFloat(priceStr);
  if (isNaN(num)) return String(priceStr);
  return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function HistoryView() {
  const { publicKey, connected } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<HistoryFilter>("ALL");

  const fetchHistory = React.useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/history?wallet=${publicKey.toBase58()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error("Failed to fetch history", err);
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    if (connected && publicKey) {
      fetchHistory();
    } else {
      setItems([]);
    }
  }, [connected, publicKey, fetchHistory]);

  const filteredItems = items.filter((item) => {
    if (filter === "EXECUTIONS") {
      return item.type === "TRADE_CONFIRMED" || item.type === "TRADE_FAILED";
    }
    if (filter === "CHECKS") {
      return item.type === "CHECK_BLOCKED" || item.type === "CHECK_PASSED";
    }
    return true;
  });

  const displayItems = filteredItems.map((item) => ({ ...item, signature: item.signature ?? "" }));

  if (!connected) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16 text-center">
        <div className="rounded-panel bg-surface border border-borderBase p-8 shadow-xs max-w-md mx-auto">
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-secondaryText block mb-1">
            AUTHENTICATION REQUIRED
          </span>
          <h2 className="text-lg font-bold text-primaryText mb-1.5">Connect wallet to view history</h2>
          <p className="text-xs text-secondaryText mb-6 leading-relaxed">
            Connect your Solana wallet to view your past price checks, boundary-enforced blocks, and confirmed on-chain executions.
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

        <div className="self-start sm:self-auto">
          <RefreshAction
            onClick={fetchHistory}
            label="Refresh"
            loadingLabel="Refreshing…"
            loading={loading}
          />
        </div>
      </div>

      {/* Filter Tabs - Compact Segmented Control */}
      <div
        role="tablist"
        aria-label="History filters"
        className="inline-flex items-center gap-1 rounded-panel border border-borderBase bg-surface p-1 shadow-xs mb-4"
      >
        <button
          type="button"
          role="tab"
          aria-selected={filter === "ALL"}
          onClick={() => setFilter("ALL")}
          className={`px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors min-h-[32px] border ${
            filter === "ALL"
              ? "bg-surface-subtle border-borderStrong text-primaryText font-semibold shadow-2xs"
              : "border-transparent text-secondaryText hover:text-primaryText hover:bg-surface-subtle/50"
          }`}
        >
          All
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === "EXECUTIONS"}
          onClick={() => setFilter("EXECUTIONS")}
          className={`px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors min-h-[32px] border ${
            filter === "EXECUTIONS"
              ? "bg-surface-subtle border-borderStrong text-primaryText font-semibold shadow-2xs"
              : "border-transparent text-secondaryText hover:text-primaryText hover:bg-surface-subtle/50"
          }`}
        >
          Executions
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === "CHECKS"}
          onClick={() => setFilter("CHECKS")}
          className={`px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors min-h-[32px] border ${
            filter === "CHECKS"
              ? "bg-surface-subtle border-borderStrong text-primaryText font-semibold shadow-2xs"
              : "border-transparent text-secondaryText hover:text-primaryText hover:bg-surface-subtle/50"
          }`}
        >
          Boundary checks
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
                  <th scope="col" className="py-2.5 px-4 whitespace-nowrap">Status</th>
                  <th scope="col" className="py-2.5 px-4 whitespace-nowrap">Asset</th>
                  <th scope="col" className="py-2.5 px-4 whitespace-nowrap">Side</th>
                  <th scope="col" className="py-2.5 px-4 text-right whitespace-nowrap">Amount</th>
                  <th scope="col" className="py-2.5 px-4 text-right whitespace-nowrap">Execution Price</th>
                  <th scope="col" className="py-2.5 px-4 text-right whitespace-nowrap">Boundary</th>
                  <th scope="col" className="py-2.5 px-4 text-right whitespace-nowrap">Time</th>
                  <th scope="col" className="py-2.5 px-4 text-right whitespace-nowrap">Transaction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderBase">
                {displayItems.map((item) => {
                  const isTrade = item.type === "TRADE_CONFIRMED";
                  const isFailed = item.type === "TRADE_FAILED";
                  const isBlocked = item.type === "CHECK_BLOCKED";
                  const isCheckOnly = item.type === "CHECK_BLOCKED" || item.type === "CHECK_PASSED";
                  const side = item.side;

                  const statusLabel = item.statusLabel || (isTrade
                    ? "Confirmed"
                    : isFailed
                    ? "Failed"
                    : isBlocked
                    ? "Blocked"
                    : "Checked");

                  const statusBadgeClass = `font-mono text-[11px] font-semibold px-2 py-0.5 rounded-[2px] border ${
                    isTrade
                      ? "bg-surface-subtle border-borderStrong text-primaryText"
                      : isBlocked || isFailed
                      ? "bg-sieveRed-soft border-rose-300 text-sieveRed"
                      : "bg-surface-subtle border-borderBase text-secondaryText"
                  }`;

                  const isDiscount = item.boundary?.type === "MAX_DISCOUNT" || side === "SELL";
                  const boundaryPct = item.boundary.pct;
                  const boundaryLabel = isDiscount
                    ? `Max discount ${boundaryPct}%`
                    : `Max +${boundaryPct}%`;
                  const execPrice = item.executionPriceUsd;
                  const diffPct = item.realizedBoundaryPct;

                  const hasRealSignature = Boolean(
                    item.signature && !item.signature.startsWith("sim-")
                  );
                  const solscanUrl =
                    hasRealSignature && item.signature
                      ? `https://solscan.io/tx/${item.signature}`
                      : null;

                  return (
                    <tr key={item.id} className="hover:bg-surface-subtle/50 transition-colors">
                      {/* Status */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className={statusBadgeClass}>
                          {statusLabel}
                        </span>
                      </td>

                      {/* Asset */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className="font-bold text-primaryText block">
                          {item.tokenSymbol}
                        </span>
                        <span className="text-[11px] text-secondaryText">
                          {item.asset.name}
                        </span>
                      </td>

                      {/* Side */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-[2px] border border-borderBase bg-surface-subtle text-primaryText">
                          {side}
                        </span>
                      </td>

                      {/* Amount */}
                      <td
                        className="py-2.5 px-4 text-right font-mono tabular-nums text-primaryText font-medium whitespace-nowrap"
                        title={item.amount}
                      >
                        {formatDisplayAmount(item.amount, item.funding.asset)} {item.funding.asset}
                      </td>

                      {/* Execution Price */}
                      <td
                        className="py-2.5 px-4 text-right font-mono tabular-nums text-primaryText whitespace-nowrap"
                        title={execPrice ?? undefined}
                      >
                        {formatDisplayPrice(execPrice)}{" "}
                        {diffPct && diffPct !== "—" && (
                          <span className="text-secondaryText text-[11px]">
                            ({isDiscount ? "-" : "+"}{diffPct}%)
                          </span>
                        )}
                      </td>

                      {/* Boundary */}
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-secondaryText whitespace-nowrap">
                        {boundaryLabel}
                      </td>

                      {/* Time */}
                      <td className="py-2.5 px-4 text-right font-mono text-[11px] text-mutedText tabular-nums whitespace-nowrap">
                        {new Date(item.timestamp).toLocaleString()}
                      </td>

                      {/* Transaction */}
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        {solscanUrl && item.signature ? (
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
                        ) : isCheckOnly ? (
                          <span className="font-mono text-[11px] text-mutedText">
                            Check only — no transaction prepared
                          </span>
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
            {displayItems.map((item) => {
              const isTrade = item.type === "TRADE_CONFIRMED";
              const isFailed = item.type === "TRADE_FAILED";
              const isBlocked = item.type === "CHECK_BLOCKED";
              const isCheckOnly = item.type === "CHECK_BLOCKED" || item.type === "CHECK_PASSED";
              const side = item.side;

              const statusLabel = item.statusLabel || (isTrade
                ? "Confirmed"
                : isFailed
                ? "Failed"
                : isBlocked
                ? "Blocked"
                : "Checked");

              const statusBadgeClass = `font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-[2px] border ${
                isTrade
                  ? "bg-surface-subtle border-borderStrong text-primaryText"
                  : isBlocked || isFailed
                  ? "bg-sieveRed-soft border-rose-300 text-sieveRed"
                  : "bg-surface-subtle border-borderBase text-secondaryText"
              }`;

              const isDiscount = item.boundary?.type === "MAX_DISCOUNT" || side === "SELL";
              const boundaryPct = item.boundary.pct;
              const boundaryLabel = isDiscount
                ? `Max discount ${boundaryPct}%`
                : `Max +${boundaryPct}%`;
              const execPrice = item.executionPriceUsd;
              const diffPct = item.realizedBoundaryPct;

              const hasRealSignature = Boolean(
                item.signature && !item.signature.startsWith("sim-")
              );
              const solscanUrl =
                hasRealSignature && item.signature
                  ? `https://solscan.io/tx/${item.signature}`
                  : null;

              return (
                <div key={item.id} className="p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-bold text-primaryText truncate">
                        {item.tokenSymbol}
                      </span>
                      <span className="text-[11px] text-secondaryText truncate">
                        {item.asset.name}
                      </span>
                      <span className="font-mono text-[9px] font-semibold px-1 py-0.5 rounded border border-borderBase bg-surface-subtle text-primaryText">
                        {side}
                      </span>
                    </div>
                    <span className={statusBadgeClass}>
                      {statusLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[11px] font-mono bg-surface-subtle/50 p-2 rounded border border-borderBase/60">
                    <div>
                      <span className="block text-[9px] text-mutedText uppercase tracking-wider">Amount</span>
                      <span className="text-primaryText font-medium tabular-nums" title={item.amount}>
                        {formatDisplayAmount(item.amount, item.funding.asset)} {item.funding.asset}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-mutedText uppercase tracking-wider">Price</span>
                      <span className="text-primaryText font-medium tabular-nums" title={execPrice ?? undefined}>
                        {formatDisplayPrice(execPrice)}
                      </span>
                      {diffPct && diffPct !== "—" && (
                        <span className="block text-[9px] text-secondaryText">
                          ({isDiscount ? "-" : "+"}{diffPct}%)
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="block text-[9px] text-mutedText uppercase tracking-wider">Boundary</span>
                      <span className="text-secondaryText font-medium tabular-nums">
                        {boundaryLabel}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-0.5 text-[10px] text-mutedText font-mono">
                    <span className="tabular-nums">{new Date(item.timestamp).toLocaleString()}</span>
                    <div>
                      {solscanUrl && item.signature ? (
                        <a
                          href={solscanUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sieveBlue hover:underline"
                        >
                          <span>Solscan ({item.signature.slice(0, 4)}...{item.signature.slice(-4)})</span>
                          <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                        </a>
                      ) : isCheckOnly ? (
                        <span className="text-mutedText">
                          Check only — no transaction prepared
                        </span>
                      ) : (
                        <span className="text-mutedText">
                          Transaction reconciliation unavailable
                        </span>
                      )}
                    </div>
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
