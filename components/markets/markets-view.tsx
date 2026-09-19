"use client";

import React, { useState, useEffect } from "react";
import { SearchFilter, type MarketFilter } from "./search-filter";
import { MarketRow, type MarketItem } from "./market-row";
import type { NetworkMode } from "@/core/domain/types";
import { RefreshCw, AlertCircle, Info } from "lucide-react";

interface MarketsViewProps {
  network: NetworkMode;
}

export function MarketsView({ network }: MarketsViewProps) {
  const [markets, setMarkets] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<MarketFilter>("ALL");

  const fetchMarkets = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/markets?network=${network}`);
      if (!res.ok) {
        throw new Error(`Failed to load markets (HTTP ${res.status})`);
      }
      const data = await res.json();
      setMarkets(data.markets || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load markets");
    } finally {
      setLoading(false);
    }
  }, [network]);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  // Filter & Search logic
  const filteredMarkets = markets.filter((m) => {
    // Search filter
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.symbol.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    // Category filter
    const diff = m.differencePct ? parseFloat(m.differencePct) : null;
    if (filter === "NEAR_REF") {
      return diff !== null && diff >= 0 && diff <= 5;
    }
    if (filter === "ABOVE_REF") {
      return diff !== null && diff > 5;
    }
    if (filter === "BELOW_REF") {
      return diff !== null && diff < 0;
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primaryText">
              Private markets
            </h1>
            {network === "testnet" && (
              <span className="rounded-full bg-sieveAmber-soft text-sieveAmber border border-amber-200 px-2.5 py-0.5 text-xs font-semibold">
                Practice mode
              </span>
            )}
          </div>
          <p className="text-sm text-secondaryText">
            Compare the market price with the latest reference price before you buy.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchMarkets}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-btn border border-borderBase bg-surface px-3.5 py-2 text-xs font-medium text-secondaryText hover:text-primaryText hover:bg-surface-subtle transition-colors shadow-2xs self-start sm:self-auto min-h-[44px]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Network notice */}
      {network === "testnet" && (
        <div className="rounded-card bg-sieveAmber-soft border border-amber-200 p-3.5 mb-6 flex items-start gap-2.5 text-xs text-secondaryText">
          <Info className="h-4 w-4 text-sieveAmber shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            You are viewing <strong>Practice mode fixtures</strong>. No real funds will be spent. Switch to Mainnet in the top navigation to view live PreStocks markets.
          </p>
        </div>
      )}

      {/* Search and Filters */}
      <SearchFilter
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        currentFilter={filter}
        onFilterChange={setFilter}
      />

      {/* Markets Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-16 w-full rounded-card bg-surface border border-borderBase animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-panel bg-surface border border-borderBase p-12 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-sieveRed mb-3" aria-hidden="true" />
          <h3 className="text-base font-semibold text-primaryText">Unable to load markets</h3>
          <p className="text-xs text-secondaryText mt-1 mb-4">{error}</p>
          <button
            type="button"
            onClick={fetchMarkets}
            className="rounded-btn bg-sieveBlue px-4 py-2 text-xs font-semibold text-white hover:bg-sieveBlue-hover transition-colors"
          >
            Try again
          </button>
        </div>
      ) : filteredMarkets.length === 0 ? (
        <div className="rounded-panel bg-surface border border-borderBase p-12 text-center">
          <p className="text-sm font-medium text-secondaryText">
            No companies found matching &ldquo;{searchQuery}&rdquo;.
          </p>
        </div>
      ) : (
        <div className="rounded-panel bg-surface border border-borderBase overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="hidden sm:table-header-group bg-surface-subtle/80 border-b border-borderBase text-[11px] font-semibold uppercase tracking-wider text-secondaryText">
                <tr>
                  <th scope="col" className="py-3 px-4">Company</th>
                  <th scope="col" className="py-3 px-4 text-right">Market Price</th>
                  <th scope="col" className="py-3 px-4 text-right">Reference Price</th>
                  <th scope="col" className="py-3 px-4 text-right">Difference</th>
                  <th scope="col" className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderBase/50 sm:divide-y-0">
                {filteredMarkets.map((market) => (
                  <MarketRow key={market.mint} market={market} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
