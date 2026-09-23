"use client";

import React, { useId } from "react";
import { cn } from "@/lib/utils";

export interface PriceRailProps {
  side?: "BUY" | "SELL";
  referencePriceUsd: number | null;
  boundaryPriceUsd?: number | null;
  currentPriceUsd?: number | null;
  currentBuyPriceUsd?: number | null;
  userLimitPct: number;
  onLimitChange?: (newLimitPct: number) => void;
  interactive?: boolean;
  minLimitPct?: number;
  maxLimitPct?: number;
  step?: number;
  className?: string;
  userLimitLabel?: string;
}

export function PriceRail({
  side = "BUY",
  referencePriceUsd,
  boundaryPriceUsd,
  currentPriceUsd,
  currentBuyPriceUsd,
  userLimitPct,
  onLimitChange,
  interactive = true,
  minLimitPct = 0,
  maxLimitPct = 25,
  step = 0.5,
  className = "",
  userLimitLabel,
}: PriceRailProps) {
  const sliderId = useId();
  const hasReference = referencePriceUsd !== null && referencePriceUsd > 0;
  const routePrice = currentPriceUsd ?? currentBuyPriceUsd ?? null;

  const effectiveBoundaryPrice =
    boundaryPriceUsd !== undefined && boundaryPriceUsd !== null && !Number.isNaN(boundaryPriceUsd)
      ? boundaryPriceUsd
      : null;

  const currentDiffPct =
    routePrice !== null && hasReference
      ? side === "SELL"
        ? ((referencePriceUsd - routePrice) / referencePriceUsd) * 100
        : ((routePrice - referencePriceUsd) / referencePriceUsd) * 100
      : null;

  const passesLimit =
    currentDiffPct === null ? null : currentDiffPct <= userLimitPct;

  const visualMax = Math.max(
    maxLimitPct,
    userLimitPct + 2,
    (currentDiffPct ?? 0) + 2
  );

  const mapDiff = (diff: number) =>
    Math.min(100, Math.max(0, (diff / visualMax) * 100));

  const limitPosition = mapDiff(userLimitPct);
  const routePosition =
    currentDiffPct === null ? null : mapDiff(currentDiffPct);

  const sliderFill =
    ((userLimitPct - minLimitPct) / (maxLimitPct - minLimitPct)) * 100;

  const formatPrice = (price: number | null | undefined) =>
    price === null || price === undefined || Number.isNaN(price)
      ? "-"
      : `$${price.toFixed(2)}`;

  const boundaryLabel =
    userLimitLabel || (side === "SELL" ? "Maximum discount" : "Maximum premium");
  const priceTypeLabel = side === "SELL" ? "Minimum price" : "Maximum price";

  const screenReaderText = hasReference
    ? `Reference price ${formatPrice(referencePriceUsd)}. ${priceTypeLabel} ${formatPrice(effectiveBoundaryPrice)}. ${
        routePrice === null
          ? "Route price has not been checked."
          : `Route price ${formatPrice(routePrice)}. The route ${
              passesLimit ? "passes" : "exceeds"
            } your limit.`
      }`
    : "Price data is unavailable. Route price has not been checked.";

  return (
    <section
      className={cn("sieve-price-boundary", className)}
      aria-labelledby={`${sliderId}-label`}
    >
      <p className="sr-only" aria-live="polite">
        {screenReaderText}
      </p>

      {interactive && onLimitChange && (
        <div className="sieve-limit-control">
          <div className="sieve-limit-heading">
            <div>
              <label id={`${sliderId}-label`} htmlFor={sliderId}>
                {boundaryLabel}
              </label>
              <p>You set this execution boundary.</p>
            </div>

            <output htmlFor={sliderId} className="sieve-limit-value">
              {side === "SELL" ? `-${userLimitPct.toFixed(1)}%` : `+${userLimitPct.toFixed(1)}%`}
            </output>
          </div>

          <div
            className="sieve-limit-slider-wrap"
            style={{ "--slider-fill": `${sliderFill}%` } as React.CSSProperties}
          >
            <input
              id={sliderId}
              type="range"
              min={minLimitPct}
              max={maxLimitPct}
              step={step}
              value={userLimitPct}
              onChange={(event) =>
                onLimitChange(Number.parseFloat(event.target.value))
              }
              className="sieve-limit-slider"
              aria-valuemin={minLimitPct}
              aria-valuemax={maxLimitPct}
              aria-valuenow={userLimitPct}
              aria-valuetext={`${side === "SELL" ? `-${userLimitPct.toFixed(1)}` : `+${userLimitPct.toFixed(1)}`} percent${
                effectiveBoundaryPrice === null
                  ? ""
                  : `, ${priceTypeLabel.toLowerCase()} ${formatPrice(effectiveBoundaryPrice)}`
              }`}
            />

            <div className="sieve-limit-scale" aria-hidden="true">
              <span>{minLimitPct}%</span>
              <span>{maxLimitPct}%</span>
            </div>
          </div>
        </div>
      )}

      <div className="sieve-price-strip">
        <PriceDatum
          label="Reference price"
          value={formatPrice(referencePriceUsd)}
        />
        <PriceDatum
          label={priceTypeLabel}
          value={formatPrice(effectiveBoundaryPrice)}
          accent
        />
        <PriceDatum
          label="Route price"
          value={formatPrice(routePrice)}
          state={passesLimit}
        />
      </div>

      {routePosition === null ? (
        <div className="sieve-route-empty" role="status" aria-live="polite">
          <div>
            <span className="sieve-route-empty-label">Route not checked</span>
            <p>Check the price to place the executable route against your boundary.</p>
          </div>
          <span className="sieve-route-empty-line" aria-hidden="true" />
        </div>
      ) : (
        <div
          className="sieve-boundary-visual"
          style={
            {
              "--limit-position": `${limitPosition}%`,
              "--route-position": `${routePosition}%`,
            } as React.CSSProperties
          }
          aria-hidden="true"
        >
          <div className="sieve-boundary-track">
            <span className="sieve-boundary-safe" />
            <span className="sieve-boundary-limit" />
            <span
              className={cn(
                "sieve-boundary-route",
                passesLimit ? "is-safe" : "is-blocked"
              )}
            />
          </div>

          <div className="sieve-boundary-labels">
            <span>Reference</span>
            <span className="sieve-boundary-limit-label">Your limit</span>
            <span
              className={cn(
                "sieve-boundary-route-label",
                passesLimit ? "is-safe" : "is-blocked"
              )}
            >
              Route
            </span>
          </div>
        </div>
      )}

      <div
        className="sieve-boundary-status"
        role={passesLimit === false ? "alert" : "status"}
        aria-live="polite"
      >
        {passesLimit === null ? (
          <p>Check the route to compare it with your limit.</p>
        ) : passesLimit ? (
          <p className="is-safe">
            {side === "SELL"
              ? "Execution is inside your minimum price."
              : "Execution is inside your maximum price."}
          </p>
        ) : (
          <div>
            <p className="is-blocked">
              {side === "SELL"
                ? "Execution is below your minimum price."
                : "Execution exceeds your maximum price."}
            </p>
            <span>No transaction was created.</span>
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
    <div className="sieve-price-datum">
      <p>{label}</p>
      <strong
        className={cn(
          accent
            ? "is-accent"
            : state === true
              ? "is-safe"
              : state === false
                ? "is-blocked"
                : ""
        )}
      >
        {value}
      </strong>
    </div>
  );
}
