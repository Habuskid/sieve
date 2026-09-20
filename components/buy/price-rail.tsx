"use client";

import React, { useId } from "react";
import { cn } from "@/lib/utils";

export interface PriceRailProps {
  referencePriceUsd: number | null;
  currentBuyPriceUsd: number | null;
  userLimitPct: number;
  onLimitChange?: (newLimitPct: number) => void;
  interactive?: boolean;
  minLimitPct?: number;
  maxLimitPct?: number;
  step?: number;
  className?: string;
}

const ticks = Array.from({ length: 17 });

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
  const hasReference = referencePriceUsd !== null && referencePriceUsd > 0;
  const maxBuyPriceUsd = hasReference
    ? referencePriceUsd * (1 + userLimitPct / 100)
    : null;
  const currentPremiumPct =
    currentBuyPriceUsd !== null && hasReference
      ? ((currentBuyPriceUsd - referencePriceUsd) / referencePriceUsd) * 100
      : null;
  const passesLimit = currentPremiumPct === null ? null : currentPremiumPct <= userLimitPct;

  const visualMax = Math.max(10, userLimitPct * 1.75, (currentPremiumPct ?? 0) + 2);
  const startPosition = 4;
  const mapPremium = (premium: number) =>
    Math.min(96, Math.max(startPosition, startPosition + (premium / visualMax) * 92));
  const limitPosition = mapPremium(userLimitPct);
  const routePosition = currentPremiumPct === null ? null : mapPremium(currentPremiumPct);

  const formatPrice = (price: number | null) =>
    price === null ? "—" : `$${price.toFixed(2)}`;

  const screenReaderText = hasReference
    ? `Reference price ${formatPrice(referencePriceUsd)}. Maximum price ${formatPrice(maxBuyPriceUsd)}. ${
        currentBuyPriceUsd === null
          ? "Route price has not been checked."
          : `Route price ${formatPrice(currentBuyPriceUsd)}. The route ${passesLimit ? "passes" : "exceeds"} your limit.`
      }`
    : "Price data is unavailable. Route price has not been checked.";

  return (
    <section className={cn("relative", className)} aria-labelledby={`${sliderId}-label`}>
      <p className="sr-only" aria-live="polite">{screenReaderText}</p>

      {interactive && onLimitChange && (
        <div className="pb-8">
          <div className="flex items-baseline justify-between gap-6">
            <div>
              <label id={`${sliderId}-label`} htmlFor={sliderId} className="text-base font-medium text-primaryText">
                Maximum premium
              </label>
              <p className="mt-1 text-sm text-mutedText">The most you&apos;ll accept above the reference price.</p>
            </div>
            <span className="text-xl font-medium text-sieveBlue tabular-nums">+{userLimitPct.toFixed(1)}%</span>
          </div>
          <input
            id={sliderId}
            type="range"
            min={minLimitPct}
            max={maxLimitPct}
            step={step}
            value={userLimitPct}
            onChange={(event) => onLimitChange(Number.parseFloat(event.target.value))}
            className="price-range mt-5 h-11 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sieveBlue"
            aria-valuemin={minLimitPct}
            aria-valuemax={maxLimitPct}
            aria-valuenow={userLimitPct}
            aria-valuetext={`+${userLimitPct.toFixed(1)} percent${maxBuyPriceUsd === null ? "" : `, maximum price ${formatPrice(maxBuyPriceUsd)}`}`}
          />
          <div className="flex justify-between text-xs text-mutedText tabular-nums">
            <span>0%</span>
            <span>{maxLimitPct}%</span>
          </div>
        </div>
      )}

      <div className="mt-2 grid grid-cols-3 gap-4 border-y border-borderBase py-6 sm:gap-8">
        <PriceDatum label="Reference price" value={formatPrice(referencePriceUsd)} />
        <PriceDatum label="Maximum price" value={formatPrice(maxBuyPriceUsd)} accent />
        <PriceDatum label="Route price" value={formatPrice(currentBuyPriceUsd)} state={passesLimit} />
      </div>

      <div className="relative mt-8 pb-10 pt-7 select-none" aria-hidden="true">
        <div className="absolute inset-x-0 top-7 flex justify-between">
          {ticks.map((_, index) => (
            <span key={index} className={cn("w-px bg-borderStrong", index % 4 === 0 ? "h-3" : "h-1.5")} />
          ))}
        </div>
        <div className="relative mt-3 h-px bg-borderStrong">
          <div className="absolute inset-y-0 left-0 bg-sieveBlue" style={{ width: `${limitPosition}%` }} />
          <div className="absolute top-1/2 h-12 w-px -translate-y-1/2 bg-sieveBlue" style={{ left: `${limitPosition}%` }} />
          {routePosition !== null && (
            <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${routePosition}%` }}>
              <span className={cn("block size-3 rounded-full border-2 border-surface", passesLimit ? "bg-sieveGreen" : "bg-sieveRed")} />
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-borderBase pt-5" role={passesLimit === false ? "alert" : "status"} aria-live="polite">
        {passesLimit === null ? (
          <p className="text-sm leading-6 text-secondaryText">Check the route to compare it with your limit.</p>
        ) : passesLimit ? (
          <p className="flex items-center gap-2 text-sm font-medium text-primaryText">
            <span className="size-2 rounded-full bg-sieveGreen" aria-hidden="true" />
            The price is inside your limit.
          </p>
        ) : (
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-primaryText">
              <span className="size-2 rounded-full bg-sieveRed" aria-hidden="true" />
              Price exceeds your limit.
            </p>
            <p className="mt-1 pl-4 text-sm text-secondaryText">No transaction was created.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function PriceDatum({
  label,
  value,
  accent = false,
  state = null,
}: {
  label: string;
  value: string;
  accent?: boolean;
  state?: boolean | null;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-mutedText">{label}</p>
      <p
        className={cn(
          "mt-2 truncate text-xl font-medium tabular-nums sm:text-2xl",
          accent ? "text-sieveBlue" : state === true ? "text-sieveGreen" : state === false ? "text-sieveRed" : "text-primaryText"
        )}
      >
        {value}
      </p>
    </div>
  );
}
