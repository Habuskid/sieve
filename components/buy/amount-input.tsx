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
      <div className="mb-2 flex items-center justify-between">
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-secondaryText"
        >
          Amount
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
          className={`min-h-14 w-full border bg-background px-4 py-3 pr-20 text-2xl font-medium tabular-nums text-primaryText placeholder:text-mutedText focus:outline-none focus:ring-1 ${
            error
              ? "border-sieveRed focus:ring-sieveRed"
              : "border-borderBase focus:ring-sieveBlue focus:border-sieveBlue"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        />
        <div className="absolute inset-y-0 right-2.5 flex items-center pointer-events-none">
          <span className="font-mono text-xs font-medium text-sieveBlue">
            {asset}
          </span>
        </div>
      </div>

      {/* Preset Amount Chips */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Preset amounts">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            onClick={() => onChange(preset)}
            className="min-h-11 border-b border-transparent px-0 text-xs font-medium text-secondaryText tabular-nums transition-colors duration-150 hover:border-sieveBlue hover:text-primaryText"
          >
            +{preset} {asset}
          </button>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <p id={errorId} className="mt-2 text-sm font-medium text-sieveRed" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
