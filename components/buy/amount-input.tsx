"use client";

import React, { useId } from "react";
import type { FundingAsset } from "@/core/domain/types";

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  asset: FundingAsset;
  disabled?: boolean;
  error?: string | null;
}

export function AmountInput({
  value,
  onChange,
  asset,
  disabled = false,
  error = null,
}: AmountInputProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;

  const usdcPresets = ["50", "100", "250", "500"];
  const solPresets = ["0.5", "1", "2.5", "5"];
  const presets = asset === "USDC" ? usdcPresets : solPresets;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (/^\d*\.?\d*$/.test(val)) {
      onChange(val);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label
          htmlFor={inputId}
          className="text-[11px] font-mono uppercase tracking-wider text-secondaryText"
        >
          Amount
        </label>
        <span id={helperId} className="text-[11px] text-mutedText">
          Capital to deploy
        </span>
      </div>

      <div className="relative">
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={handleInputChange}
          placeholder="0.00"
          disabled={disabled}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={error ? errorId : helperId}
          className={`w-full rounded-btn bg-surface border px-3.5 py-2.5 pr-20 text-lg font-bold font-mono tabular-nums text-primaryText placeholder:text-mutedText shadow-2xs focus:outline-none focus:ring-1 min-h-[46px] ${
            error
              ? "border-sieveRed focus:ring-sieveRed"
              : "border-borderBase focus:ring-primaryText"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        />
        <div className="absolute inset-y-0 right-2.5 flex items-center pointer-events-none">
          <span className="rounded-[4px] bg-surface-subtle border border-borderBase px-2 py-0.5 text-xs font-mono font-bold text-secondaryText">
            {asset}
          </span>
        </div>
      </div>

      {/* Preset Amount Chips */}
      <div className="mt-2 flex items-center gap-1.5 flex-wrap" aria-label="Preset amounts">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            onClick={() => onChange(preset)}
            className="rounded-[4px] bg-surface border border-borderBase px-2 py-0.5 text-[11px] font-mono font-medium text-secondaryText hover:text-primaryText hover:bg-surface-subtle transition-colors min-h-[28px] tabular-nums"
          >
            +{preset} {asset}
          </button>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-sieveRed font-medium" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
