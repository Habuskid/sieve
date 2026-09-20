import React from "react";
import { LandingHero } from "@/components/landing/landing-hero";
import Link from "next/link";

export default function Home() {
  return (
    <div className="bg-background">
      {/* Editorial Hero with Non-fake Schematic Preview */}
      <LandingHero />

      {/* Institutional Value Proposition */}
      <section className="border-b border-borderBase bg-surface py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12">
            <span className="text-[11px] font-mono uppercase tracking-wider text-secondaryText block mb-1">
              SYSTEM MECHANICS
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-primaryText">
              Deterministic price boundary enforcement
            </h2>
            <p className="text-sm text-secondaryText mt-2 leading-relaxed">
              Pre-IPO assets trade across decentralized Solana liquidity. Without protective boundary validation, thin liquidity can lead to significant execution slippage. Sieve guarantees zero signature exposure if market pricing exceeds your limit.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Step 1 */}
            <div className="rounded-panel bg-surface border border-borderBase p-6 shadow-xs">
              <span className="text-xs font-mono font-bold text-sieveBlue block mb-2">01 / SPECIFICATION</span>
              <h3 className="text-base font-bold text-primaryText mb-2">
                User-Defined Price Ceiling
              </h3>
              <p className="text-xs text-secondaryText leading-relaxed">
                Specify the maximum acceptable premium over the authoritative PreStocks reference price. Your limit is mathematically fixed prior to trade evaluation.
              </p>
            </div>

            {/* Step 2 */}
            <div className="rounded-panel bg-surface border border-borderBase p-6 shadow-xs">
              <span className="text-xs font-mono font-bold text-sieveGreen block mb-2">02 / INDEPENDENT CHECK</span>
              <h3 className="text-base font-bold text-primaryText mb-2">
                Server-Side Route Evaluation
              </h3>
              <p className="text-xs text-secondaryText leading-relaxed">
                Before transaction construction, Sieve queries authoritative on-chain mint state and live Jupiter routes. If the executable price exceeds your limit, execution stops immediately.
              </p>
            </div>

            {/* Step 3 */}
            <div className="rounded-panel bg-surface border border-borderBase p-6 shadow-xs">
              <span className="text-xs font-mono font-bold text-primaryText block mb-2">03 / ON-CHAIN PROTECTION</span>
              <h3 className="text-base font-bold text-primaryText mb-2">
                Enforced Minimum Output
              </h3>
              <p className="text-xs text-secondaryText leading-relaxed">
                Every prepared Solana transaction includes an explicit, non-bypassable minimum token output constraint. If liquidity thins during block inclusion, the transaction reverts on-chain.
              </p>
            </div>
          </div>

          {/* Bottom Execution Banner */}
          <div className="mt-12 rounded-panel bg-surface-subtle border border-borderBase p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-primaryText">Ready to evaluate private market tokens?</h3>
              <p className="text-xs text-secondaryText mt-0.5">
                Inspect active markets or test execution boundaries safely in Practice mode.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link
                href="/markets"
                className="rounded-btn border border-borderBase bg-surface px-4 py-2.5 text-xs font-semibold text-secondaryText hover:text-primaryText hover:bg-surface-subtle transition-colors min-h-[40px] inline-flex items-center justify-center"
              >
                View markets
              </Link>
              <Link
                href="/buy"
                className="rounded-btn bg-primaryText px-5 py-2.5 text-xs font-semibold text-white hover:bg-primaryText/90 transition-colors shadow-xs min-h-[40px] inline-flex items-center justify-center"
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
