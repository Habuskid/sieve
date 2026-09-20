"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden py-12 sm:py-16 lg:py-20 border-b border-borderBase bg-surface">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column (5 columns) */}
          <div className="lg:col-span-5 space-y-6 text-left">
            <div className="inline-flex items-center gap-2 border border-borderBase bg-surface-subtle px-2.5 py-1 text-[11px] font-mono font-semibold uppercase tracking-wider text-secondaryText rounded-[4px]">
              <span>PRICE BOUNDARY EXECUTION</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-primaryText leading-[1.15]">
              Set the price. Sieve checks the execution.
              <span className="block text-lg sm:text-xl font-semibold text-secondaryText mt-2">
                Buy private-market tokens without overpaying.
              </span>
            </h1>

            <p className="text-sm sm:text-base text-secondaryText leading-relaxed">
              Sieve compares the PreStocks reference price with the current Solana route and stops the buy when execution moves beyond your limit.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/buy"
                className="inline-flex items-center justify-center gap-2 rounded-btn bg-primaryText px-6 py-3 text-xs font-semibold text-white hover:bg-primaryText/90 transition-colors shadow-xs min-h-[44px]"
              >
                <span>Start a buy</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>

              <Link
                href="/markets"
                className="inline-flex items-center justify-center rounded-btn bg-surface border border-borderBase px-5 py-3 text-xs font-semibold text-secondaryText hover:text-primaryText hover:bg-surface-subtle transition-colors min-h-[44px]"
              >
                View markets
              </Link>
            </div>

            <p className="text-xs text-mutedText pt-2">
              You set the limit. Sieve enforces the check before signing.
            </p>
          </div>

          {/* Right Column (7 columns): Non-fake Schematic Execution Boundary Preview */}
          <div className="lg:col-span-7">
            <div className="rounded-panel bg-surface border border-borderBase p-6 sm:p-8 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-borderBase mb-6">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-secondaryText">
                    EXECUTION BOUNDARY SCHEMA — OPENAI PRESTOCKS (OPENAI)
                  </span>
                  <p className="text-xs text-mutedText mt-0.5">
                    Pre-trade price boundary verification model
                  </p>
                </div>
                <span className="text-[11px] font-mono text-secondaryText border border-borderBase px-2 py-0.5 rounded-[4px] bg-surface-subtle">
                  PRECISION SCALE
                </span>
              </div>

              {/* Schematic Precision Scale */}
              <div className="relative pt-6 pb-12">
                {/* 2px Base Track */}
                <div className="h-2 w-full bg-surface-subtle border border-borderBase relative overflow-hidden rounded-[2px]">
                  {/* Subtle Shaded Allowed Region up to Your Maximum */}
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-sieveBlue-soft border-r border-sieveBlue/40"
                    style={{ width: "55%" }}
                    aria-hidden="true"
                  />
                </div>

                {/* Marker 1: Reference */}
                <div
                  className="absolute top-2 flex flex-col items-center -translate-x-1/2"
                  style={{ left: "0%" }}
                >
                  <div className="h-6 w-[2px] bg-primaryText" />
                  <span className="text-[11px] font-mono font-semibold text-primaryText mt-2 whitespace-nowrap">
                    Reference
                  </span>
                  <span className="text-[10px] text-mutedText">Base Valuation</span>
                </div>

                {/* Marker 2: Your Maximum */}
                <div
                  className="absolute top-2 flex flex-col items-center -translate-x-1/2"
                  style={{ left: "55%" }}
                >
                  <div className="h-6 w-[2px] bg-sieveBlue" />
                  <span className="text-[11px] font-mono font-bold text-sieveBlue mt-2 whitespace-nowrap">
                    Your Maximum
                  </span>
                  <span className="text-[10px] text-secondaryText">Ceiling Limit</span>
                </div>

                {/* Marker 3: Live Executable */}
                <div
                  className="absolute top-2 flex flex-col items-center -translate-x-1/2"
                  style={{ left: "38%" }}
                >
                  <div className="h-6 w-[2px] bg-sieveGreen" />
                  <span className="text-[11px] font-mono font-semibold text-sieveGreen mt-2 whitespace-nowrap">
                    Live Executable
                  </span>
                  <span className="text-[10px] text-sieveGreen">Inside Limit</span>
                </div>
              </div>

              {/* Status Note */}
              <div className="p-3 rounded-[4px] bg-surface-subtle border border-borderBase text-xs text-secondaryText flex items-center justify-between mb-6">
                <span className="font-mono text-[11px]">DECISION RULE:</span>
                <span className="font-mono text-[11px] text-primaryText">
                  Live Executable ≤ Your Maximum → Permitted
                </span>
              </div>

              {/* Compact 4-Step Workflow */}
              <div className="pt-4 border-t border-borderBase">
                <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-mutedText block mb-3">
                  WORKFLOW STAGES
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-2.5 rounded-[4px] border border-borderBase bg-surface">
                    <span className="text-[10px] font-mono text-mutedText block mb-0.5">01</span>
                    <span className="font-semibold text-primaryText block">Reference</span>
                    <span className="text-[11px] text-secondaryText">PreStocks feed</span>
                  </div>

                  <div className="p-2.5 rounded-[4px] border border-borderBase bg-surface">
                    <span className="text-[10px] font-mono text-mutedText block mb-0.5">02</span>
                    <span className="font-semibold text-primaryText block">Route</span>
                    <span className="text-[11px] text-secondaryText">Solana quote</span>
                  </div>

                  <div className="p-2.5 rounded-[4px] border border-borderBase bg-surface">
                    <span className="text-[10px] font-mono text-mutedText block mb-0.5">03</span>
                    <span className="font-semibold text-primaryText block">Boundary</span>
                    <span className="text-[11px] text-secondaryText">Server check</span>
                  </div>

                  <div className="p-2.5 rounded-[4px] border border-borderBase bg-surface">
                    <span className="text-[10px] font-mono text-mutedText block mb-0.5">04</span>
                    <span className="font-semibold text-primaryText block">Sign</span>
                    <span className="text-[11px] text-secondaryText">Wallet approval</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
