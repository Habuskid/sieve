"use client";

import React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export interface MarketItem {
  name: string;
  symbol: string;
  mint: string;
  imageUrl?: string | null;
  referencePriceUsd: string;
  sourceTokenPriceUsd?: string | null;
  differencePct?: string | null;
}

interface MarketRowProps {
  market: MarketItem;
}

export function MarketRow({ market }: MarketRowProps) {
  const diff = market.differencePct ? parseFloat(market.differencePct) : null;
  const isDiscount = diff !== null && diff < 0;
  const isNear = diff !== null && diff >= 0 && diff <= 5;\n  const displayName = market.name.replace(/\\s*\\(Practice\\)\\s*$/i, "");

  return (
    <>
      {/* Desktop Table Row */}
      <tr className="hidden sm:table-row border-b border-borderBase hover:bg-surface-subtle/50 transition-colors text-xs">
        {/* Company & Symbol */}
        <td className="py-2.5 px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] bg-surface-subtle border border-borderBase font-mono font-bold text-[11px] text-secondaryText overflow-hidden">
              {market.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={market.imageUrl}
                  alt={displayName}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              ) : (
                market.symbol.slice(0, 3)
              )}
            </div>
            <div>
              <span className="font-semibold text-primaryText block">
                {displayName}
              </span>
              <span className="font-mono text-[11px] text-mutedText">
                {market.symbol}
              </span>
            </div>
          </div>
        </td>

        {/* Market Buy Price */}
        <td className="py-2.5 px-4 text-right">
          <span className="font-mono font-medium text-primaryText tabular-nums">
            {market.sourceTokenPriceUsd ? `$${parseFloat(market.sourceTokenPriceUsd).toFixed(2)}` : "—"}
          </span>
        </td>

        {/* Reference Price */}
        <td className="py-2.5 px-4 text-right">
          <span className="font-mono text-secondaryText tabular-nums">
            ${parseFloat(market.referencePriceUsd).toFixed(2)}
          </span>
        </td>

        {/* Difference - Signed numeric text, no colorful pill overload */}
        <td className="py-2.5 px-4 text-right">
          {diff !== null ? (
            <span
              className={`font-mono font-medium tabular-nums ${
                isDiscount
                  ? "text-sieveBlue"
                  : isNear
                  ? "text-sieveGreen"
                  : "text-sieveAmber"
              }`}
            >
              {diff > 0 ? `+${diff.toFixed(2)}%` : `${diff.toFixed(2)}%`}
            </span>
          ) : (
            <span className="text-mutedText font-mono">—</span>
          )}
        </td>

        {/* Action Button */}
        <td className="py-2.5 px-4 text-right">
          <Link
            href={`/buy?mint=${market.mint}`}
            className="sieve-control-primary sieve-control-primary-compact"
          >
            <span>Buy</span>
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </td>
      </tr>

      {/* Mobile Card Row */}
      <div className="sm:hidden border-b border-borderBase py-3 px-1 text-xs">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] bg-surface-subtle border border-borderBase font-mono font-bold text-[11px] text-secondaryText overflow-hidden">
              {market.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={market.imageUrl}
                  alt={displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                market.symbol.slice(0, 3)
              )}
            </div>
            <div>
              <span className="font-semibold text-primaryText block">
                {displayName}
              </span>
              <span className="font-mono text-[11px] text-mutedText">
                {market.symbol}
              </span>
            </div>
          </div>

          <Link
            href={`/buy?mint=${market.mint}`}
            className="sieve-control-primary sieve-control-primary-compact"
          >
            <span>Buy</span>
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-borderBase/40 text-[11px]">
          <div>
            <span className="text-secondaryText block">Market</span>
            <span className="font-mono font-medium text-primaryText tabular-nums">
              {market.sourceTokenPriceUsd ? `$${parseFloat(market.sourceTokenPriceUsd).toFixed(2)}` : "—"}
            </span>
          </div>

          <div className="text-center">
            <span className="text-secondaryText block">Ref</span>
            <span className="font-mono text-mutedText tabular-nums">
              ${parseFloat(market.referencePriceUsd).toFixed(2)}
            </span>
          </div>

          <div className="text-right">
            <span className="text-secondaryText block">Diff</span>
            {diff !== null ? (
              <span
                className={`font-mono font-medium tabular-nums ${
                  isDiscount
                    ? "text-sieveBlue"
                    : isNear
                    ? "text-sieveGreen"
                    : "text-sieveAmber"
                }`}
              >
                {diff > 0 ? `+${diff.toFixed(2)}%` : `${diff.toFixed(2)}%`}
              </span>
            ) : (
              <span className="text-mutedText font-mono">—</span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
