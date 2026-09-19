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
    // Allow numbers and single decimal point
    if (/^\d*\.?\d*$/.test(val)) {
      onChange(val);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label
          htmlFor={inputId}
          className="text-xs font-semibold uppercase tracking-wider text-secondaryText"
        >
          How much?
        </label>
        <span id={helperId} className="text-xs text-mutedText">
          Amount to spend
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
          className={`w-full rounded-btn bg-surface border px-4 py-3.5 pr-20 text-xl font-bold font-mono tabular-nums text-primaryText placeholder:text-mutedText shadow-2xs focus:outline-none focus:ring-2 min-h-[52px] ${
            error
              ? "border-sieveRed focus:ring-sieveRed"
              : "border-borderBase focus:ring-sieveBlue"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        />
        <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
          <span className="rounded-md bg-surface-subtle border border-borderBase px-2.5 py-1 text-xs font-bold text-secondaryText font-mono">
            {asset}
          </span>
        </div>
      </div>

      {/* Preset Amount Chips */}
      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap" aria-label="Preset amounts">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            onClick={() => onChange(preset)}
            className="rounded-md bg-surface border border-borderBase px-2.5 py-1 text-xs font-medium text-secondaryText hover:text-primaryText hover:bg-surface-subtle transition-colors min-h-[32px] tabular-nums"
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
