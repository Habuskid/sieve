"use client";

import React, { useId } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";

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
      className={`rounded-card bg-surface border border-borderBase p-5 shadow-xs ${className}`}
      aria-labelledby={`${sliderId}-label`}
    >
      {/* Accessible Text Alternative (SR-only) */}
      <div className="sr-only" aria-live="polite">
        {screenReaderText}
      </div>

      {/* Header Info */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <span
            id={`${sliderId}-label`}
            className="text-xs font-semibold uppercase tracking-wider text-secondaryText"
          >
            Price Boundary Rail
          </span>
          <p className="text-sm font-medium text-primaryText mt-0.5">
            Reference:{" "}
            <span className="font-mono font-semibold tabular-nums">
              ${referencePriceUsd.toFixed(2)}
            </span>
          </p>
        </div>

        {/* State Badge */}
        {currentBuyPriceUsd !== null && (
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              isGoodToGo
                ? "bg-sieveGreen-soft text-sieveGreen border border-emerald-200"
                : "bg-sieveRed-soft text-sieveRed border border-rose-200"
            }`}
          >
            {isGoodToGo ? (
              <>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>Good to go</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <span>Price too high</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Horizontal Rail Track */}
      <div className="relative pt-6 pb-8">
        {/* Background Track */}
        <div className="h-3 w-full rounded-full bg-surface-subtle border border-borderBase relative overflow-hidden">
          {/* Allowed Region (Green shaded area up to user limit) */}
          <div
            className="absolute left-0 top-0 bottom-0 bg-sieveGreen/20 transition-all duration-300 ease-out"
            style={{ width: `${userLimitPosition}%` }}
            aria-hidden="true"
          />
        </div>

        {/* Reference Marker (at 0%) */}
        <div
          className="absolute top-3 flex flex-col items-center -translate-x-1/2"
          style={{ left: "0%" }}
          aria-hidden="true"
        >
          <div className="h-4 w-1 bg-primaryText rounded-full" />
          <span className="text-[11px] font-medium text-secondaryText mt-1 whitespace-nowrap">
            Ref $0%
          </span>
        </div>

        {/* User Limit Marker */}
        <div
          className="absolute top-2 flex flex-col items-center -translate-x-1/2 transition-all duration-150"
          style={{ left: `${userLimitPosition}%` }}
          aria-hidden="true"
        >
          <div className="h-5 w-3 bg-sieveBlue rounded-xs shadow-xs border border-white" />
          <span className="text-[11px] font-semibold text-sieveBlue mt-1 font-mono tabular-nums whitespace-nowrap">
            Limit +{userLimitPct.toFixed(1)}% (${maxBuyPriceUsd.toFixed(2)})
          </span>
        </div>

        {/* Current Market Price Marker (if known) */}
        {marketPosition !== null && (
          <div
            className="absolute top-1 flex flex-col items-center -translate-x-1/2 transition-all duration-300 ease-out z-10"
            style={{ left: `${marketPosition}%` }}
            aria-hidden="true"
          >
            <div
              className={`h-6 w-3 rounded-xs shadow-md border-2 border-white ${
                isGoodToGo ? "bg-sieveGreen" : "bg-sieveRed"
              }`}
            />
            <span
              className={`text-[11px] font-bold mt-1 font-mono tabular-nums whitespace-nowrap px-1.5 py-0.5 rounded-sm ${
                isGoodToGo
                  ? "bg-sieveGreen-soft text-sieveGreen"
                  : "bg-sieveRed-soft text-sieveRed"
              }`}
            >
              Market {currentPremiumPct! >= 0 ? "+" : ""}
              {currentPremiumPct!.toFixed(1)}% (${currentBuyPriceUsd!.toFixed(2)})
            </span>
          </div>
        )}
      </div>

      {/* Interactive Slider Input for Limit */}
      {interactive && onLimitChange && (
        <div className="mt-4 pt-4 border-t border-borderBase">
          <div className="flex items-center justify-between text-xs text-secondaryText mb-2">
            <label htmlFor={sliderId} className="font-medium text-primaryText">
              Adjust your price limit:
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
            className="w-full h-2 bg-surface-subtle border border-borderBase rounded-lg appearance-none cursor-pointer accent-sieveBlue focus:outline-none focus:ring-2 focus:ring-sieveBlue"
            aria-valuemin={minLimitPct}
            aria-valuemax={maxLimitPct}
            aria-valuenow={userLimitPct}
            aria-valuetext={`+${userLimitPct.toFixed(1)} percent, maximum price $${maxBuyPriceUsd.toFixed(2)}`}
          />
          <div className="flex justify-between text-[11px] text-mutedText mt-1">
            <span>+{minLimitPct}% (At reference)</span>
            <span>+{maxLimitPct}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
