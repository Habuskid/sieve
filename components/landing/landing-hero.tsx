"use client";

import React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const ticks = Array.from({ length: 19 });

export function LandingHero() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="border-b border-borderBase bg-background">
      <div className="mx-auto grid min-h-[calc(100dvh-56px)] max-w-7xl grid-cols-1 items-center gap-14 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-12 lg:gap-16 lg:px-10 lg:py-24">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="lg:col-span-6"
        >
          <h1 className="max-w-[10ch] text-balance text-[3rem] font-semibold leading-[0.98] text-primaryText sm:text-6xl lg:text-[4.75rem]">
            <span className="block">Set the price.</span>
            <span className="mt-2 block text-secondaryText">Sieve checks the</span>
            <span className="block text-sieveBlue">execution.</span>
          </h1>

          <p className="mt-7 max-w-[31rem] text-pretty text-base leading-7 text-secondaryText sm:mt-8 sm:text-lg">
            Choose the most you&apos;re willing to pay. Sieve checks the current route before your wallet is asked to sign.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 sm:mt-10">
            <Link
              href="/buy"
              className="inline-flex min-h-11 items-center justify-center gap-2 bg-sieveBlue px-6 py-3 text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-sieveBlue-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sieveBlue focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Start a buy
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href="/markets"
              className="inline-flex min-h-11 items-center justify-center py-3 text-sm font-medium text-secondaryText transition-colors duration-150 hover:text-primaryText focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sieveBlue"
            >
              View markets
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.1, duration: 0.45, ease: "easeOut" }}
          className="lg:col-span-6"
        >
          <div
            className="relative mx-auto max-w-2xl px-2 py-16 sm:px-8 sm:py-24 lg:py-28"
            role="img"
            aria-label="An abstract price rail showing a route checked against a user-set limit before signing."
          >
            <div className="absolute inset-x-2 top-1/2 flex -translate-y-8 justify-between sm:inset-x-8" aria-hidden="true">
              {ticks.map((_, index) => (
                <span
                  key={index}
                  className={`w-px bg-borderStrong ${index % 3 === 0 ? "h-4" : "h-2"}`}
                />
              ))}
            </div>

            <div className="relative h-px bg-borderStrong" aria-hidden="true">
              <motion.div
                className="absolute inset-y-0 left-0 origin-left bg-sieveBlue"
                style={{ width: "67%" }}
                initial={reduceMotion ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: reduceMotion ? 0 : 0.25, duration: 0.55, ease: "easeOut" }}
              />

              <div className="absolute left-[67%] top-1/2 h-28 w-px -translate-y-1/2 bg-sieveBlue" />
              <div className="absolute left-[67%] top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 border border-sieveBlue bg-background" />

              <motion.div
                className="absolute left-[45%] top-1/2 -translate-x-1/2 -translate-y-1/2"
                initial={reduceMotion ? false : { opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: reduceMotion ? 0 : 0.55, duration: 0.3, ease: "easeOut" }}
              >
                <span className="block size-4 rounded-full border-2 border-background bg-primaryText" />
              </motion.div>
            </div>

            <div className="mt-10 flex items-center justify-between gap-6 text-sm">
              <p className="text-secondaryText">Route checked before signing</p>
              <p className="text-sieveBlue">Your limit</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
