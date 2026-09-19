"use client";

import React from "react";
import Link from "next/link";
import { ArrowUpRight, TrendingUp, TrendingDown, Minus } from "lucide-react";

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
  const isNear = diff !== null && diff >= 0 && diff <= 5;

  return (
    <>
      {/* Desktop Table Row */}
      <tr className="hidden sm:table-row border-b border-borderBase hover:bg-surface-subtle/70 transition-colors">
        {/* Company & Symbol */}
        <td className="py-4 px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-subtle border border-borderBase font-bold text-xs text-secondaryText overflow-hidden">
              {market.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={market.imageUrl}
                  alt={market.name}
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
              <span className="font-semibold text-sm text-primaryText block">
                {market.name}
              </span>
              <span className="font-mono text-xs text-mutedText">
                {market.symbol}
              </span>
            </div>
          </div>
        </td>

        {/* Market Buy Price */}
        <td className="py-4 px-4 text-right">
          <span className="font-mono font-bold text-sm text-primaryText tabular-nums">
            {market.sourceTokenPriceUsd ? `$${parseFloat(market.sourceTokenPriceUsd).toFixed(2)}` : "—"}
          </span>
        </td>

        {/* Reference Price */}
        <td className="py-4 px-4 text-right">
          <span className="font-mono text-xs text-secondaryText tabular-nums">
            ${parseFloat(market.referencePriceUsd).toFixed(2)}
          </span>
        </td>

        {/* Difference Pill */}
        <td className="py-4 px-4 text-right">
          {diff !== null ? (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold tabular-nums font-mono ${
                isDiscount
                  ? "bg-sieveBlue-soft text-sieveBlue"
                  : isNear
                  ? "bg-sieveGreen-soft text-sieveGreen"
                  : "bg-sieveAmber-soft text-sieveAmber"
              }`}
            >
              {isDiscount ? (
                <TrendingDown className="h-3 w-3" aria-hidden="true" />
              ) : isNear ? (
                <Minus className="h-3 w-3" aria-hidden="true" />
              ) : (
                <TrendingUp className="h-3 w-3" aria-hidden="true" />
              )}
              {diff > 0 ? `+${diff.toFixed(2)}%` : `${diff.toFixed(2)}%`}
            </span>
          ) : (
            <span className="text-xs text-mutedText">—</span>
          )}
        </td>

        {/* Action Button */}
        <td className="py-4 px-4 text-right">
          <Link
            href={`/buy?mint=${market.mint}`}
            className="inline-flex items-center gap-1 rounded-btn bg-surface border border-borderBase px-3.5 py-1.5 text-xs font-semibold text-primaryText hover:bg-primaryText hover:text-white transition-colors shadow-2xs min-h-[36px]"
          >
            <span>Buy</span>
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </td>
      </tr>

      {/* Mobile Card Row */}
      <div className="sm:hidden rounded-card bg-surface border border-borderBase p-4 mb-3 shadow-2xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-subtle border border-borderBase font-bold text-xs text-secondaryText overflow-hidden">
              {market.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={market.imageUrl}
                  alt={market.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                market.symbol.slice(0, 3)
              )}
            </div>
            <div>
              <span className="font-semibold text-sm text-primaryText block">
                {market.name}
              </span>
              <span className="font-mono text-xs text-mutedText">
                {market.symbol}
              </span>
            </div>
          </div>

          <Link
            href={`/buy?mint=${market.mint}`}
            className="inline-flex items-center gap-1 rounded-btn bg-primaryText px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs min-h-[36px]"
          >
            <span>Buy</span>
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="flex items-center justify-between text-xs pt-2 border-t border-borderBase/60">
          <div>
            <span className="text-secondaryText block">Market Price</span>
            <span className="font-mono font-bold text-primaryText tabular-nums">
              {market.sourceTokenPriceUsd ? `$${parseFloat(market.sourceTokenPriceUsd).toFixed(2)}` : "—"}
            </span>
          </div>

          <div className="text-center">
            <span className="text-secondaryText block">Reference</span>
            <span className="font-mono text-mutedText tabular-nums">
              ${parseFloat(market.referencePriceUsd).toFixed(2)}
            </span>
          </div>

          <div className="text-right">
            <span className="text-secondaryText block">Difference</span>
            {diff !== null ? (
              <span
                className={`font-mono font-semibold tabular-nums ${
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
              <span className="text-mutedText">—</span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
