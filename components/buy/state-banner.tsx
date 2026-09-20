"use client";

import React from "react";
import { RefreshCw } from "lucide-react";

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
      <div className="rounded-[4px] bg-surface border border-borderBase p-3 text-xs text-secondaryText flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-mutedText">
          DECISION STATUS
        </span>
        <span>Configure parameters and click &ldquo;Check today&apos;s price&rdquo;</span>
      </div>
    );
  }

  if (state === "CHECKING") {
    return (
      <div
        className="rounded-[4px] bg-sieveBlue-soft border border-blue-200 p-3 text-xs text-sieveBlue flex items-center justify-between"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden="true" />
          <span className="font-mono font-medium">Evaluating live Solana route against price boundary...</span>
        </div>
      </div>
    );
  }

  if (state === "GOOD_TO_GO") {
    return (
      <div
        className="rounded-[4px] bg-sieveGreen-soft border border-emerald-300 p-3.5 transition-colors"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-2 w-2 rounded-full bg-sieveGreen" aria-hidden="true" />
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-sieveGreen">
                INSIDE LIMIT
              </h4>
            </div>
            <p className="text-xs text-primaryText font-medium">
              {title || "The price is inside your limit."}
            </p>
            <p className="text-[11px] font-mono text-secondaryText mt-0.5 tabular-nums">
              {message ||
                `Premium: ${premiumPct}% | Limit: ${limitPct}%`}
            </p>
          </div>

          {expiresInSeconds != null && (
            <div className="text-right shrink-0 font-mono text-xs text-secondaryText tabular-nums">
              Quote: {expiresInSeconds}s
            </div>
          )}
        </div>
      </div>
    );
  }

  if (state === "PRICE_TOO_HIGH") {
    return (
      <div
        className="rounded-[4px] bg-sieveRed-soft border border-rose-300 p-3.5 transition-colors"
        role="alert"
        aria-live="assertive"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-2 w-2 rounded-full bg-sieveRed" aria-hidden="true" />
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-sieveRed">
                OUTSIDE LIMIT — EXECUTION HALTED
              </h4>
            </div>
            <p className="text-xs text-primaryText font-medium">
              {title || "This buy is outside your limit."}
            </p>
            <p className="text-[11px] font-mono text-secondaryText mt-0.5 tabular-nums">
              {message ||
                `Live price exceeds limit. Premium: ${premiumPct}% | Maximum: ${limitPct}%`}
            </p>
            <p className="text-[11px] font-mono font-semibold text-sieveRed mt-1">
              No trade would be created. Signing blocked.
            </p>
          </div>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-[4px] border border-borderBase bg-surface px-2.5 py-1 text-xs font-semibold text-secondaryText hover:text-primaryText hover:bg-surface-subtle transition-colors shrink-0"
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
      className="rounded-[4px] bg-sieveAmber-soft border border-amber-300 p-3.5 transition-colors"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-sieveAmber" aria-hidden="true" />
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-sieveAmber">
              {isStale
                ? "QUOTE EXPIRED"
                : isNoRoute
                ? "NO ROUTE FOUND"
                : "CHECK FAILED"}
            </h4>
          </div>
          <p className="text-xs text-primaryText font-medium">
            {title ||
              (isStale
                ? "Market quote expired"
                : isNoRoute
                ? "No market route found"
                : "Check could not be completed")}
          </p>
          <p className="text-[11px] text-secondaryText mt-0.5">
            {message ||
              (isStale
                ? "The market quote or reference price expired. Please check today's price again."
                : isNoRoute
                ? "There is currently no executable market route for this token and amount."
                : "Please try checking again.")}
          </p>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-[4px] border border-borderBase bg-surface px-2.5 py-1 text-xs font-semibold text-secondaryText hover:text-primaryText hover:bg-surface-subtle transition-colors shrink-0"
          >
            Check again
          </button>
        )}
      </div>
    </div>
  );
}
