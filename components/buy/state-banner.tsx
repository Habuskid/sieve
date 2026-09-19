"use client";

import React from "react";
import { CheckCircle2, AlertTriangle, Clock, RefreshCw, XCircle } from "lucide-react";

export type BannerState =
  | "IDLE"
  | "CHECKING"
  | "GOOD_TO_GO"
  | "PRICE_TOO_HIGH"
  | "STALE_DATA"
  | "NO_ROUTE"
  | "ERROR";

interface StateBannerProps {
  state: BannerState;
  title?: string;
  message?: string;
  premiumPct?: string | null;
  limitPct?: string | null;
  expiresInSeconds?: number | null;
  onRefresh?: () => void;
}

export function StateBanner({
  state,
  title,
  message,
  premiumPct,
  limitPct,
  expiresInSeconds,
  onRefresh,
}: StateBannerProps) {
  if (state === "IDLE") {
    return (
      <div className="rounded-card bg-surface-subtle border border-borderBase p-4 text-xs text-secondaryText flex items-center gap-3">
        <Clock className="h-4 w-4 text-mutedText shrink-0" aria-hidden="true" />
        <p>Set your price limit and click &ldquo;Check today&apos;s price&rdquo; to verify before you sign.</p>
      </div>
    );
  }

  if (state === "CHECKING") {
    return (
      <div
        className="rounded-card bg-sieveBlue-soft border border-blue-200 p-4 text-xs text-sieveBlue flex items-center justify-between animate-pulse"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <RefreshCw className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
          <p className="font-medium">Checking live market price against your limit...</p>
        </div>
      </div>
    );
  }

  if (state === "GOOD_TO_GO") {
    return (
      <div
        className="rounded-card bg-sieveGreen-soft border border-emerald-200 p-4 transition-all duration-300"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <CheckCircle2
              className="h-5 w-5 text-sieveGreen shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div>
              <h4 className="text-sm font-semibold text-sieveGreen">
                {title || "The price is inside your limit."}
              </h4>
              <p className="text-xs text-secondaryText mt-0.5">
                {message ||
                  `You're paying about ${premiumPct}% above the reference price. Your limit is ${limitPct}%.`}
              </p>
            </div>
          </div>

          {expiresInSeconds != null && (
            <div className="flex items-center gap-1.5 text-xs text-secondaryText shrink-0 font-mono tabular-nums">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{expiresInSeconds}s</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (state === "PRICE_TOO_HIGH") {
    return (
      <div
        className="rounded-card bg-sieveRed-soft border border-rose-200 p-4 transition-all duration-300"
        role="alert"
        aria-live="assertive"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <XCircle
              className="h-5 w-5 text-sieveRed shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div>
              <h4 className="text-sm font-semibold text-sieveRed">
                {title || "This buy is outside your limit."}
              </h4>
              <p className="text-xs text-secondaryText mt-0.5">
                {message ||
                  `The current price is ${premiumPct}% above the reference price. Your limit is ${limitPct}%.`}
              </p>
              <p className="text-xs font-semibold text-sieveRed mt-1">
                No trade would be created.
              </p>
            </div>
          </div>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-md border border-rose-200 bg-surface px-2.5 py-1 text-xs font-medium text-secondaryText hover:text-primaryText hover:bg-surface-subtle transition-colors shrink-0"
            >
              Re-check
            </button>
          )}
        </div>
      </div>
    );
  }

  // STALE_DATA, NO_ROUTE, or general ERROR
  const isStale = state === "STALE_DATA";
  const isNoRoute = state === "NO_ROUTE";

  return (
    <div
      className="rounded-card bg-sieveAmber-soft border border-amber-200 p-4 transition-all duration-300"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="h-5 w-5 text-sieveAmber shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div>
            <h4 className="text-sm font-semibold text-sieveAmber">
              {title ||
                (isStale
                  ? "Market quote expired"
                  : isNoRoute
                  ? "No market route found"
                  : "Check could not be completed")}
            </h4>
            <p className="text-xs text-secondaryText mt-0.5">
              {message ||
                (isStale
                  ? "The market quote or reference price expired. Please check today's price again."
                  : isNoRoute
                  ? "There is currently no executable market route for this token and amount."
                  : "Please try checking again.")}
            </p>
          </div>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-md border border-amber-300 bg-surface px-2.5 py-1 text-xs font-medium text-secondaryText hover:text-primaryText hover:bg-surface-subtle transition-colors shrink-0"
          >
            Check again
          </button>
        )}
      </div>
    </div>
  );
}
