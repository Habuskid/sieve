"use client";

import React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export function LandingHero() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden border-b border-borderBase bg-background">
      <div className="mx-auto grid min-h-[calc(100dvh-56px)] max-w-7xl grid-cols-1 items-center gap-14 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-12 lg:gap-12 lg:px-10 lg:py-20">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="lg:col-span-7"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sieveBlue">
            PreStocks execution guard
          </p>

          <h1 className="mt-5 max-w-[11ch] text-balance text-[3.25rem] font-semibold leading-[0.95] text-primaryText sm:text-6xl lg:text-[5rem]">
            <span className="block">Set the price.</span>
            <span className="mt-2 block text-secondaryText">Sieve checks the execution.</span>
          </h1>

          <p className="mt-7 max-w-[35rem] text-pretty text-base leading-7 text-secondaryText sm:text-lg">
            Set the most you are willing to pay. Sieve checks the current executable Solana route before your wallet is asked to sign.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
            <Link
              href="/buy"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-btn bg-sieveBlue px-6 py-3 text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-sieveBlue-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sieveBlue focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Start a buy
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href="/markets"
              className="inline-flex min-h-11 items-center justify-center border-b border-borderStrong py-3 text-sm font-medium text-secondaryText transition-colors duration-150 hover:border-sieveBlue hover:text-primaryText focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sieveBlue"
            >
              View markets
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.08, duration: 0.5, ease: "easeOut" }}
          className="lg:col-span-5"
        >
          <div
            className="relative min-h-[340px] overflow-hidden border-y border-borderBase py-10 sm:min-h-[390px]"
            role="img"
            aria-label="Abstract execution path checked against a user-set price boundary before signing."
          >
            <div className="absolute inset-0 opacity-60" aria-hidden="true">
              <div className="absolute left-[18%] top-0 h-full w-px bg-borderBase" />
              <div className="absolute left-[50%] top-0 h-full w-px bg-borderBase" />
              <div className="absolute left-[82%] top-0 h-full w-px bg-borderBase" />
              <div className="absolute left-0 top-[28%] h-px w-full bg-borderBase" />
              <div className="absolute left-0 top-[72%] h-px w-full bg-borderBase" />
            </div>

            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2" aria-hidden="true">
              <div className="relative h-px bg-borderStrong">
                <motion.div
                  className="absolute inset-y-0 left-0 origin-left bg-sieveBlue"
                  style={{ width: "71%" }}
                  initial={reduceMotion ? false : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: reduceMotion ? 0 : 0.25, duration: 0.7, ease: "easeOut" }}
                />
                <div className="absolute left-[71%] top-1/2 h-36 w-px -translate-y-1/2 bg-sieveBlue" />
                <motion.div
                  className="absolute left-[56%] top-1/2 -translate-x-1/2 -translate-y-1/2"
                  initial={reduceMotion ? false : { opacity: 0, x: -18 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: reduceMotion ? 0 : 0.55, duration: 0.35, ease: "easeOut" }}
                >
                  <span className="block size-4 rounded-full border-2 border-background bg-primaryText" />
                </motion.div>
              </div>
            </div>

            <div className="absolute bottom-8 left-0 right-0 flex items-center justify-between text-xs uppercase tracking-[0.12em] text-mutedText">
              <span>Checked before signing</span>
              <span className="text-sieveBlue">Boundary enforced</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
