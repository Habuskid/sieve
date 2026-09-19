import React from "react";
import { LandingHero } from "@/components/landing/landing-hero";
import { ShieldCheck, Sliders, Lock } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div>
      {/* Hero with Interactive Price Rail */}
      <LandingHero />

      {/* Value Proposition Grid */}
      <section className="border-t border-borderBase bg-surface py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-primaryText">
              How Sieve protects your private market trades
            </h2>
            <p className="text-sm text-secondaryText mt-1 max-w-lg mx-auto">
              Pre-IPO tokens often suffer from thin liquidity and sudden price spikes. Sieve gives you complete price control.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Step 1 */}
            <div className="rounded-card bg-surface-subtle border border-borderBase p-6 shadow-2xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sieveBlue-soft text-sieveBlue mb-4">
                <Sliders className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-base font-bold text-primaryText mb-1.5">
                1. You set the limit
              </h3>
              <p className="text-xs text-secondaryText leading-relaxed">
                Choose the maximum premium you are willing to pay over the official reference price. You are always in the driver seat.
              </p>
            </div>

            {/* Step 2 */}
            <div className="rounded-card bg-surface-subtle border border-borderBase p-6 shadow-2xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sieveGreen-soft text-sieveGreen mb-4">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-base font-bold text-primaryText mb-1.5">
                2. Server independently checks
              </h3>
              <p className="text-xs text-secondaryText leading-relaxed">
                Before any transaction is constructed, Sieve queries the live market. If the price moves past your limit, no trade is created.
              </p>
            </div>

            {/* Step 3 */}
            <div className="rounded-card bg-surface-subtle border border-borderBase p-6 shadow-2xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sieveAmber-soft text-sieveAmber mb-4">
                <Lock className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-base font-bold text-primaryText mb-1.5">
                3. On-chain slippage guard
              </h3>
              <p className="text-xs text-secondaryText leading-relaxed">
                Every transaction contains an exact minimum output constraint. If liquidity thins during execution, the Solana transaction reverts.
              </p>
            </div>
          </div>

          {/* Bottom CTA Banner */}
          <div className="mt-16 rounded-panel bg-surface-subtle border border-borderBase p-8 text-center sm:flex sm:items-center sm:justify-between sm:text-left">
            <div>
              <h3 className="text-lg font-bold text-primaryText">Ready to start?</h3>
              <p className="text-xs text-secondaryText mt-0.5">
                Explore available PreStocks tokens or start with Practice mode.
              </p>
            </div>
            <div className="mt-4 sm:mt-0 flex gap-3">
              <Link
                href="/markets"
                className="rounded-btn bg-primaryText px-5 py-2.5 text-xs font-semibold text-white hover:bg-primaryText/90 transition-colors shadow-xs min-h-[44px] inline-flex items-center justify-center"
              >
                View markets
              </Link>
              <Link
                href="/buy"
                className="rounded-btn bg-sieveBlue px-5 py-2.5 text-xs font-semibold text-white hover:bg-sieveBlue-hover transition-colors shadow-xs min-h-[44px] inline-flex items-center justify-center"
              >
                Start a buy
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
