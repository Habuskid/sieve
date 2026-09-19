"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ShieldCheck, ArrowRight, CheckCircle2, AlertTriangle, Play, Pause } from "lucide-react";

export function LandingHero() {
  // Demo interactive state
  const referencePriceUsd = 100.0;
  const [userLimitPct, setUserLimitPct] = useState<number>(5.0);
  const [marketPremiumPct, setMarketPremiumPct] = useState<number>(2.5);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);

  // Motion loop based on MOTION_SPEC.md
  useEffect(() => {
    if (!isPlaying) return;

    // Timeline: Good to go (+2.5%) <-> Price too high (+15.8%)
    const timer = setInterval(() => {
      setMarketPremiumPct((prev) => (prev <= 5 ? 15.8 : 2.5));
    }, 3800);

    return () => clearInterval(timer);
  }, [isPlaying]);

  // Derived calculations
  const maxBuyPriceUsd = referencePriceUsd * (1 + userLimitPct / 100);
  const currentBuyPriceUsd = referencePriceUsd * (1 + marketPremiumPct / 100);
  const isGoodToGo = marketPremiumPct <= userLimitPct;

  // Rail mapping scale: 0% to 20%
  const railMaxPct = 20;
  const userLimitPosition = Math.min(100, Math.max(0, (userLimitPct / railMaxPct) * 100));
  const marketPosition = Math.min(100, Math.max(0, (marketPremiumPct / railMaxPct) * 100));

  return (
    <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full bg-sieveBlue-soft border border-blue-200 px-3.5 py-1 text-xs font-semibold text-sieveBlue mb-6 shadow-2xs">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <span>Solana Pre-IPO Protection</span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-primaryText leading-[1.1] mb-6">
          Buy private-market tokens <br className="hidden sm:inline" />
          without overpaying.
        </h1>

        {/* Body */}
        <p className="mx-auto max-w-2xl text-base sm:text-lg text-secondaryText mb-8">
          Set the price limit you&apos;re comfortable with. Sieve checks the live market before you sign.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4">
          <Link
            href="/buy"
            className="flex items-center justify-center gap-2 rounded-btn bg-sieveBlue px-8 py-3.5 text-base font-bold text-white hover:bg-sieveBlue-hover transition-all shadow-md hover:shadow-lg min-h-[52px] w-full sm:w-auto"
          >
            <span>Start a buy</span>
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>

          <Link
            href="/markets"
            className="flex items-center justify-center rounded-btn bg-surface border border-borderBase px-6 py-3.5 text-base font-semibold text-primaryText hover:bg-surface-subtle transition-colors min-h-[52px] w-full sm:w-auto"
          >
            Browse markets
          </Link>
        </div>

        <p className="text-xs text-mutedText mb-12">
          No AI calls the shot. You set the limit.
        </p>

        {/* Signature Visual: Interactive Price Rail Hero Demo */}
        <div className="mx-auto max-w-3xl rounded-panel bg-surface border border-borderBase p-6 sm:p-8 shadow-md text-left">
          <div className="flex items-center justify-between pb-4 border-b border-borderBase mb-6">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-secondaryText">
                Live Interactive Demonstration
              </span>
              <p className="text-sm font-bold text-primaryText mt-0.5">
                OpenAI PreStocks (OPENAI) — Reference:{" "}
                <span className="font-mono font-bold tabular-nums">$100.00</span>
              </p>
            </div>

            {/* Play/Pause Demo */}
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-borderBase bg-surface-subtle px-2.5 py-1 text-xs font-medium text-secondaryText hover:text-primaryText transition-colors min-h-[36px]"
              aria-label={isPlaying ? "Pause demo animation" : "Play demo animation"}
            >
              {isPlaying ? (
                <>
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Pause</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Play</span>
                </>
              )}
            </button>
          </div>

          {/* Rail Track */}
          <div className="relative pt-6 pb-10">
            {/* Track Line */}
            <div className="h-3.5 w-full rounded-full bg-surface-subtle border border-borderBase relative overflow-hidden">
              {/* Allowed Green Band */}
              <div
                className="absolute left-0 top-0 bottom-0 bg-sieveGreen/20 transition-all duration-300 ease-out"
                style={{ width: `${userLimitPosition}%` }}
                aria-hidden="true"
              />
            </div>

            {/* Reference Marker */}
            <div
              className="absolute top-3 flex flex-col items-center -translate-x-1/2"
              style={{ left: "0%" }}
              aria-hidden="true"
            >
              <div className="h-4 w-1 bg-primaryText rounded-full" />
              <span className="text-[11px] font-semibold text-secondaryText mt-1 whitespace-nowrap">
                Ref $100.00
              </span>
            </div>

            {/* User Limit Marker */}
            <div
              className="absolute top-1.5 flex flex-col items-center -translate-x-1/2 transition-all duration-200"
              style={{ left: `${userLimitPosition}%` }}
              aria-hidden="true"
            >
              <div className="h-6 w-3.5 bg-sieveBlue rounded-xs shadow-xs border-2 border-white" />
              <span className="text-[11px] font-bold text-sieveBlue mt-1 font-mono tabular-nums whitespace-nowrap">
                Limit +{userLimitPct.toFixed(1)}% (${maxBuyPriceUsd.toFixed(2)})
              </span>
            </div>

            {/* Market Price Marker */}
            <div
              className="absolute top-0.5 flex flex-col items-center -translate-x-1/2 transition-all duration-700 ease-out z-10"
              style={{ left: `${marketPosition}%` }}
              aria-hidden="true"
            >
              <div
                className={`h-7 w-3.5 rounded-xs shadow-md border-2 border-white ${
                  isGoodToGo ? "bg-sieveGreen" : "bg-sieveRed"
                }`}
              />
              <span
                className={`text-[11px] font-bold mt-1 font-mono tabular-nums whitespace-nowrap px-2 py-0.5 rounded-md shadow-2xs ${
                  isGoodToGo
                    ? "bg-sieveGreen-soft text-sieveGreen border border-emerald-200"
                    : "bg-sieveRed-soft text-sieveRed border border-rose-200"
                }`}
              >
                Market +{marketPremiumPct.toFixed(1)}% (${currentBuyPriceUsd.toFixed(2)})
              </span>
            </div>
          </div>

          {/* Morphing State Card */}
          <div
            className={`rounded-card p-4 mb-4 transition-all duration-300 border ${
              isGoodToGo
                ? "bg-sieveGreen-soft border-emerald-200"
                : "bg-sieveRed-soft border-rose-200"
            }`}
          >
            <div className="flex items-start gap-3">
              {isGoodToGo ? (
                <CheckCircle2 className="h-5 w-5 text-sieveGreen shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-sieveRed shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <div>
                <h4
                  className={`text-sm font-bold ${
                    isGoodToGo ? "text-sieveGreen" : "text-sieveRed"
                  }`}
                >
                  {isGoodToGo ? "Good to go" : "Price too high"}
                </h4>
                <p className="text-xs text-secondaryText mt-0.5">
                  {isGoodToGo
                    ? `You're paying about ${marketPremiumPct.toFixed(1)}% above reference. Your limit is ${userLimitPct.toFixed(1)}%.`
                    : `The current price is ${marketPremiumPct.toFixed(1)}% above reference. Your limit is ${userLimitPct.toFixed(1)}%.`}
                </p>
                {!isGoodToGo && (
                  <p className="text-xs font-bold text-sieveRed mt-1">
                    No trade would be created.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Drag Limit Slider */}
          <div className="pt-2">
            <div className="flex items-center justify-between text-xs text-secondaryText mb-1.5">
              <label htmlFor="hero-slider" className="font-semibold text-primaryText">
                Drag to test your price limit:
              </label>
              <span className="font-mono font-bold text-sieveBlue tabular-nums">
                +{userLimitPct.toFixed(1)}%
              </span>
            </div>
            <input
              id="hero-slider"
              type="range"
              min={0}
              max={20}
              step={0.5}
              value={userLimitPct}
              onChange={(e) => {
                setUserLimitPct(parseFloat(e.target.value));
                setIsPlaying(false);
              }}
              className="w-full h-2 bg-surface-subtle border border-borderBase rounded-lg appearance-none cursor-pointer accent-sieveBlue focus:outline-none focus:ring-2 focus:ring-sieveBlue"
              aria-label="Adjust price limit in demo"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
