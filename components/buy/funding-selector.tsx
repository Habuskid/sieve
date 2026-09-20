"use client";

import React from "react";
import type { FundingAsset } from "@/core/domain/types";
import { TokenIcon } from "@/components/ui/token-icon";

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
      <label className="mb-2 block text-sm font-medium text-secondaryText">
        Pay with
      </label>
      <div
        role="radiogroup"
        aria-label="Funding Asset"
        className="flex items-center gap-7 border-b border-borderStrong"
      >
        <button
          type="button"
          role="radio"
          aria-checked={selected === "USDC"}
          disabled={disabled}
          onClick={() => onChange("USDC")}
          className={`flex min-h-11 items-center justify-start gap-2 border-b px-0 py-2 text-sm font-medium transition-colors duration-150 ${
            selected === "USDC"
              ? "-mb-px border-sieveBlue text-sieveBlue"
              : "border-transparent text-secondaryText hover:text-primaryText"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <TokenIcon asset="USDC" size={18} />
          <span>USDC</span>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={selected === "SOL"}
          disabled={disabled}
          onClick={() => onChange("SOL")}
          className={`flex min-h-11 items-center justify-start gap-2 border-b px-0 py-2 text-sm font-medium transition-colors duration-150 ${
            selected === "SOL"
              ? "-mb-px border-sieveBlue text-sieveBlue"
              : "border-transparent text-secondaryText hover:text-primaryText"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <TokenIcon asset="SOL" size={18} />
          <span>SOL</span>
        </button>
      </div>
    </div>
  );
}
