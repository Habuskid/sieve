"use client";

import React from "react";
import { Search } from "lucide-react";

export type MarketFilter = "ALL" | "NEAR_REF" | "ABOVE_REF" | "BELOW_REF";

interface SearchFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  currentFilter: MarketFilter;
  onFilterChange: (filter: MarketFilter) => void;
}

export function SearchFilter({
  searchQuery,
  onSearchChange,
  currentFilter,
  onFilterChange,
}: SearchFilterProps) {
  const filters: { id: MarketFilter; label: string }[] = [
    { id: "ALL", label: "All" },
    { id: "NEAR_REF", label: "Near reference (≤ 5%)" },
    { id: "ABOVE_REF", label: "Above reference" },
    { id: "BELOW_REF", label: "Below reference" },
  ];

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
      {/* Search Bar */}
      <div className="relative flex-1 max-w-md">
        <Search
          className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-mutedText pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search companies or symbols..."
          aria-label="Search companies"
          className="w-full rounded-btn bg-surface border border-borderBase pl-10 pr-4 py-2.5 text-xs text-primaryText placeholder:text-mutedText shadow-2xs focus:outline-none focus:ring-2 focus:ring-sieveBlue min-h-[44px]"
        />
      </div>

      {/* Filter Chips */}
      <div
        role="group"
        aria-label="Market filters"
        className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0"
      >
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilterChange(f.id)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium transition-colors min-h-[36px] ${
              currentFilter === f.id
                ? "bg-primaryText text-white font-semibold shadow-xs"
                : "bg-surface border border-borderBase text-secondaryText hover:text-primaryText hover:bg-surface-subtle"
            }`}
            aria-pressed={currentFilter === f.id}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
