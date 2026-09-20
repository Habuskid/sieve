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
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
      {/* Search Input */}
      <div className="relative flex-1 max-w-sm">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-secondaryText pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter by company or symbol..."
          aria-label="Search companies"
          className="w-full rounded-[4px] bg-surface border border-borderBase pl-9 pr-3 py-1.5 text-xs text-primaryText placeholder:text-mutedText focus:outline-none focus:ring-1 focus:ring-primaryText min-h-[36px]"
        />
      </div>

      {/* Filter Buttons */}
      <div
        role="group"
        aria-label="Market filters"
        className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0"
      >
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilterChange(f.id)}
            className={`whitespace-nowrap px-2.5 py-1 rounded-[4px] text-xs font-medium transition-colors min-h-[32px] border ${
              currentFilter === f.id
                ? "bg-surface-subtle border-borderStrong text-primaryText font-semibold shadow-2xs"
                : "bg-surface border-borderBase text-secondaryText hover:text-primaryText hover:bg-surface-subtle"
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
