"use client";

import React, { useId } from "react";

export interface PriceRailProps {
  referencePriceUsd: number;
  currentBuyPriceUsd: number | null;
  userLimitPct: number; // e.g. 5.0 for +5%
  onLimitChange?: (newLimitPct: number) => void;
  interactive?: boolean;
  minLimitPct?: number;
  maxLimitPct?: number;
  step?: number;
  className?: string;
}

export function PriceRail({
  referencePriceUsd,
  currentBuyPriceUsd,
  userLimitPct,
  onLimitChange,
  interactive = true,
  minLimitPct = 0,
  maxLimitPct = 25,
  step = 0.5,
  className = "",
}: PriceRailProps) {
  const sliderId = useId();

  // Calculate prices
  const maxBuyPriceUsd = referencePriceUsd * (1 + userLimitPct / 100);
  const currentPremiumPct =
    currentBuyPriceUsd && referencePriceUsd > 0
      ? ((currentBuyPriceUsd - referencePriceUsd) / referencePriceUsd) * 100
      : null;

  const isGoodToGo =
    currentPremiumPct !== null ? currentPremiumPct <= userLimitPct : true;

  // Rail mapping scale: 0% to maxLimitPct (or higher if market price exceeds maxLimitPct)
  const railMaxPct = Math.max(maxLimitPct, (currentPremiumPct ?? 0) + 2);
  const userLimitPosition = Math.min(
    100,
    Math.max(0, (userLimitPct / railMaxPct) * 100)
  );
  const marketPosition =
    currentPremiumPct !== null
      ? Math.min(100, Math.max(0, (currentPremiumPct / railMaxPct) * 100))
      : null;

  // Text alternative for screen readers per ACCESSIBILITY.md
  const screenReaderText = currentBuyPriceUsd
    ? `Reference $${referencePriceUsd.toFixed(2)}. Your maximum price $${maxBuyPriceUsd.toFixed(
        2
      )}. Current buy price $${currentBuyPriceUsd.toFixed(2)}. ${
        isGoodToGo ? "Current price is inside your limit." : "Current price is outside your limit."
      }`
    : `Reference $${referencePriceUsd.toFixed(2)}. Your maximum price $${maxBuyPriceUsd.toFixed(2)}.`;

  return (
    <div
      className={`rounded-panel bg-surface border border-borderBase p-5 shadow-xs ${className}`}
      aria-labelledby={`${sliderId}-label`}
    >
      {/* Accessible Text Alternative (SR-only) */}
      <div className="sr-only" aria-live="polite">
        {screenReaderText}
      </div>

      {/* Rail Scale Title */}
      <div className="flex items-center justify-between gap-4 pb-3 border-b border-borderBase mb-4">
        <span
          id={`${sliderId}-label`}
          className="text-[11px] font-mono uppercase tracking-wider text-secondaryText font-semibold"
        >
          Price Boundary Rail
        </span>
        <span className="font-mono text-xs text-secondaryText tabular-nums">
          Reference: ${referencePriceUsd.toFixed(2)}
        </span>
      </div>

      {/* Horizontal Precision Scale Track */}
      <div className="relative pt-6 pb-10">
        {/* 2px Base Rule */}
        <div className="h-[2px] w-full bg-borderStrong relative overflow-visible">
          {/* Allowed Region: Extremely subtle sky-blue tint up to user limit */}
          <div
            className="absolute left-0 -top-[1px] -bottom-[1px] bg-sieveBlue-soft border-r border-sieveBlue"
            style={{ width: `${userLimitPosition}%` }}
            aria-hidden="true"
          />
        </div>

        {/* Reference Marker: Graphite */}
        <div
          className="absolute top-2 flex flex-col items-center -translate-x-1/2"
          style={{ left: "0%" }}
          aria-hidden="true"
        >
          <div className="h-4 w-[2px] bg-primaryText" />
          <span className="text-[10px] font-mono font-semibold text-primaryText mt-1 whitespace-nowrap">
            Ref $0%
          </span>
        </div>

        {/* User Maximum Marker: Blue */}
        <div
          className="absolute top-1 flex flex-col items-center -translate-x-1/2 transition-all duration-150"
          style={{ left: `${userLimitPosition}%` }}
          aria-hidden="true"
        >
          <div className="h-6 w-[2px] bg-sieveBlue" />
          <span className="text-[10px] font-mono font-bold text-sieveBlue mt-1 tabular-nums whitespace-nowrap">
            Limit +{userLimitPct.toFixed(1)}% (${maxBuyPriceUsd.toFixed(2)})
          </span>
        </div>

        {/* Current Executable Marker: Green if inside, Red if outside */}
        {marketPosition !== null && currentBuyPriceUsd !== null && (
          <div
            className="absolute top-0 flex flex-col items-center -translate-x-1/2 transition-all duration-300 ease-out z-10"
            style={{ left: `${marketPosition}%` }}
            aria-hidden="true"
          >
            <div
              className={`h-8 w-[2px] ${
                isGoodToGo ? "bg-sieveGreen" : "bg-sieveRed"
              }`}
            />
            <span
              className={`text-[10px] font-mono font-bold mt-1 tabular-nums whitespace-nowrap px-1.5 py-0.5 rounded-[2px] border ${
                isGoodToGo
                  ? "bg-sieveGreen-soft text-sieveGreen border-emerald-300"
                  : "bg-sieveRed-soft text-sieveRed border-rose-300"
              }`}
            >
              Live {currentPremiumPct! >= 0 ? "+" : ""}
              {currentPremiumPct!.toFixed(1)}% (${currentBuyPriceUsd.toFixed(2)})
            </span>
          </div>
        )}
      </div>

      {/* Comparison & Status Strip */}
      {currentBuyPriceUsd !== null && (
        <div className="pt-3 border-t border-borderBase space-y-2">
          {/* Concise Comparison */}
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-secondaryText">EXECUTION CHECK:</span>
            <span
              className={`font-semibold tabular-nums ${
                isGoodToGo ? "text-sieveGreen" : "text-sieveRed"
              }`}
            >
              {isGoodToGo
                ? `$${currentBuyPriceUsd.toFixed(2)} live ≤ $${maxBuyPriceUsd.toFixed(2)} maximum`
                : `$${currentBuyPriceUsd.toFixed(2)} live > $${maxBuyPriceUsd.toFixed(2)} maximum`}
            </span>
          </div>

          {/* Thin Status Strip */}
          <div
            className={`flex items-center gap-2 py-1.5 px-2.5 rounded-[4px] border text-xs font-mono ${
              isGoodToGo
                ? "bg-sieveGreen-soft border-emerald-200 text-sieveGreen"
                : "bg-sieveRed-soft border-rose-200 text-sieveRed"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                isGoodToGo ? "bg-sieveGreen" : "bg-sieveRed"
              }`}
              aria-hidden="true"
            />
            <span className="font-semibold">
              {isGoodToGo ? "Inside your limit" : "Outside your limit"}
            </span>
          </div>
        </div>
      )}

      {/* Interactive Slider Input for Limit */}
      {interactive && onLimitChange && (
        <div className="mt-4 pt-3 border-t border-borderBase">
          <div className="flex items-center justify-between text-xs text-secondaryText mb-1.5">
            <label htmlFor={sliderId} className="font-mono text-[11px] uppercase tracking-wider text-secondaryText font-medium">
              Adjust limit:
            </label>
            <span className="font-mono font-bold text-sieveBlue tabular-nums">
              +{userLimitPct.toFixed(1)}% (max ${maxBuyPriceUsd.toFixed(2)})
            </span>
          </div>
          <input
            id={sliderId}
            type="range"
            min={minLimitPct}
            max={maxLimitPct}
            step={step}
            value={userLimitPct}
            onChange={(e) => onLimitChange(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-surface-subtle border border-borderBase rounded-[2px] appearance-none cursor-pointer accent-sieveBlue focus:outline-none focus:ring-1 focus:ring-sieveBlue"
            aria-valuemin={minLimitPct}
            aria-valuemax={maxLimitPct}
            aria-valuenow={userLimitPct}
            aria-valuetext={`+${userLimitPct.toFixed(1)} percent, maximum price $${maxBuyPriceUsd.toFixed(2)}`}
          />
          <div className="flex justify-between text-[10px] font-mono text-mutedText mt-1">
            <span>+{minLimitPct}% (At reference)</span>
            <span>+{maxLimitPct}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
