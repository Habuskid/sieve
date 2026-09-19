"use client";

import React from "react";
import type { FundingAsset } from "@/core/domain/types";

interface FundingSelectorProps {
  selected: FundingAsset;
  onChange: (asset: FundingAsset) => void;
  disabled?: boolean;
}

export function FundingSelector({
  selected,
  onChange,
  disabled = false,
}: FundingSelectorProps) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-secondaryText mb-2">
        Pay with
      </label>
      <div
        role="radiogroup"
        aria-label="Funding Asset"
        className="grid grid-cols-2 gap-2 p-1 rounded-btn bg-surface-subtle border border-borderBase"
      >
        <button
          type="button"
          role="radio"
          aria-checked={selected === "USDC"}
          disabled={disabled}
          onClick={() => onChange("USDC")}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 px-4 text-sm font-medium transition-colors min-h-[44px] ${
            selected === "USDC"
              ? "bg-surface text-primaryText font-semibold shadow-xs border border-borderBase"
              : "text-secondaryText hover:text-primaryText hover:bg-surface/50"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-bold text-xs">
            $
          </div>
          <span>USDC</span>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={selected === "SOL"}
          disabled={disabled}
          onClick={() => onChange("SOL")}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 px-4 text-sm font-medium transition-colors min-h-[44px] ${
            selected === "SOL"
              ? "bg-surface text-primaryText font-semibold shadow-xs border border-borderBase"
              : "text-secondaryText hover:text-primaryText hover:bg-surface/50"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-purple-600 font-bold text-xs">
            ◎
          </div>
          <span>SOL</span>
        </button>
      </div>
    </div>
  );
}
