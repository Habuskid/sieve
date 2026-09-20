"use client";

import React, { useState, useEffect } from "react";
import { SearchFilter, type MarketFilter } from "./search-filter";
import { MarketRow, type MarketItem } from "./market-row";
import type { NetworkMode } from "@/core/domain/types";
import { AlertCircle } from "lucide-react";
import { RefreshAction } from "@/components/ui/refresh-action";

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
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
      {/* Page Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 mb-4 border-b border-borderBase">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-primaryText">
            Private Market Assets
          </h1>
          <p className="text-xs text-secondaryText mt-0.5">
            Compare live Solana market pricing against official PreStocks reference valuations.
          </p>
        </div>

        <div className="self-start sm:self-auto">
          <RefreshAction
            onClick={fetchMarkets}
            label="Update prices"
            loadingLabel="Updating prices…"
            loading={loading}
          />
        </div>
      </div>

      {/* Search and Filters */}
      <SearchFilter
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        currentFilter={filter}
        onFilterChange={setFilter}
      />

      {/* Markets Table */}
      {loading ? (
        <div className="border border-borderBase rounded-panel overflow-hidden bg-surface">
          <div className="divide-y divide-borderBase">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 w-full bg-surface animate-pulse" />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="rounded-panel bg-surface border border-borderBase p-8 text-center">
          <AlertCircle className="mx-auto h-6 w-6 text-sieveRed mb-2" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-primaryText">Unable to load markets</h3>
          <p className="text-xs text-secondaryText mt-0.5 mb-3">{error}</p>
          <RefreshAction onClick={fetchMarkets} label="Try again" />
        </div>
      ) : filteredMarkets.length === 0 ? (
        <div className="rounded-panel bg-surface border border-borderBase p-8 text-center">
          <p className="text-xs font-medium text-secondaryText">
            No assets found matching &ldquo;{searchQuery}&rdquo;.
          </p>
        </div>
      ) : (
        <div className="border border-borderBase rounded-panel overflow-hidden bg-surface shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="hidden sm:table-header-group bg-surface-subtle border-b border-borderBase text-[10px] font-mono font-semibold uppercase tracking-wider text-secondaryText">
                <tr>
                  <th scope="col" className="py-2.5 px-4">Company</th>
                  <th scope="col" className="py-2.5 px-4 text-right">Market Price</th>
                  <th scope="col" className="py-2.5 px-4 text-right">Reference Price</th>
                  <th scope="col" className="py-2.5 px-4 text-right">Difference</th>
                  <th scope="col" className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderBase">
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
