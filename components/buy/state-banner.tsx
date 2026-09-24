"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { RefreshMark } from "@/components/ui/refresh-mark";
import { RefreshAction } from "@/components/ui/refresh-action";

export type BannerState =
  | "IDLE"
  | "CHECKING"
  | "GOOD_TO_GO"
  | "PRICE_TOO_HIGH"
  | "STALE_DATA"
  | "NO_ROUTE"
  | "ROUTE_RISK"
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
  onRefresh,
}: StateBannerProps) {
  if (state === "IDLE") {
    return <p className="text-sm text-secondaryText">Enter the buy details, then check the price.</p>;
  }

  if (state === "CHECKING") {
    return (
      <div className="flex items-center gap-2.5 text-sm text-sieveBlue" role="status" aria-live="polite">
        <RefreshMark loading />
        <span className="font-medium">Checking the current route…</span>
      </div>
    );
  }

  if (state === "GOOD_TO_GO") {
    return (
      <div className="border-l border-sieveBlue pl-4" role="status" aria-live="polite">
        <p className="text-sm font-medium text-primaryText">{title || "Within boundary"}</p>
        <p className="mt-1 text-sm text-secondaryText tabular-nums">
          {message || `Premium: ${premiumPct}% · Limit: ${limitPct}%`}
        </p>
      </div>
    );
  }

  if (state === "PRICE_TOO_HIGH") {
    return (
      <div className="border-l border-sieveRed pl-4" role="alert" aria-live="assertive">
        <p className="text-sm font-medium text-primaryText">{title || "Boundary exceeded"}</p>
        <p className="mt-1 text-sm text-secondaryText tabular-nums">
          {message || `Premium: ${premiumPct}% · Limit: ${limitPct}%`}
        </p>
      </div>
    );
  }

  const isStale = state === "STALE_DATA";
  const isNoRoute = state === "NO_ROUTE";
  const isRouteRisk = state === "ROUTE_RISK";

  return (
    <div className="border-l border-sieveAmber pl-4" role="alert" aria-live="polite">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-primaryText">
            <AlertTriangle className="size-4 shrink-0 text-sieveAmber" aria-hidden="true" />
            {title || (isStale ? "Price expired" : isNoRoute ? "Route unavailable" : isRouteRisk ? "Route not supported" : "Check failed")}
          </p>
          <p className="mt-1 pl-6 text-sm leading-6 text-secondaryText">
            {message ||
              (isStale
                ? "Check the price again."
                : isNoRoute
                  ? "No executable Jupiter route is available for this market right now. Try another funding asset or market."
                  : isRouteRisk
                    ? "A market route exists, but it is not currently supported by Sieve's verified execution path."
                    : "Please try again.")}
          </p>
        </div>
        {onRefresh && (
          <div className="shrink-0">
            <RefreshAction onClick={onRefresh} label="Check again" />
          </div>
        )}
      </div>
    </div>
  );
}
