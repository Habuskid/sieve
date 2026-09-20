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
      <label className="block text-[11px] font-mono uppercase tracking-wider text-secondaryText mb-1.5">
        Funding Asset
      </label>
      <div
        role="radiogroup"
        aria-label="Funding Asset"
        className="grid grid-cols-2 gap-1.5 p-1 rounded-btn bg-surface-subtle border border-borderBase"
      >
        <button
          type="button"
          role="radio"
          aria-checked={selected === "USDC"}
          disabled={disabled}
          onClick={() => onChange("USDC")}
          className={`flex items-center justify-center gap-2 rounded-[4px] py-2 px-3 text-xs font-semibold transition-colors min-h-[38px] ${
            selected === "USDC"
              ? "bg-surface text-primaryText font-bold shadow-2xs border border-borderBase"
              : "text-secondaryText hover:text-primaryText hover:bg-surface/50 border border-transparent"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <span className="font-mono text-[11px] text-sieveBlue font-bold">$</span>
          <span>USDC</span>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={selected === "SOL"}
          disabled={disabled}
          onClick={() => onChange("SOL")}
          className={`flex items-center justify-center gap-2 rounded-[4px] py-2 px-3 text-xs font-semibold transition-colors min-h-[38px] ${
            selected === "SOL"
              ? "bg-surface text-primaryText font-bold shadow-2xs border border-borderBase"
              : "text-secondaryText hover:text-primaryText hover:bg-surface/50 border border-transparent"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <span className="font-mono text-[11px] text-secondaryText font-bold">◎</span>
          <span>SOL</span>
        </button>
      </div>
    </div>
  );
}
