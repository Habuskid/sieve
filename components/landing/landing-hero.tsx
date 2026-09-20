"use client";

import React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SieveLogo } from "@/components/brand/sieve-logo";

export function LandingHero() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden border-b border-borderBase bg-background">
      <div className="sieve-shell grid min-h-[calc(100dvh-56px)] grid-cols-1 items-center gap-14 py-16 sm:py-20 lg:grid-cols-12 lg:gap-12 lg:py-20">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="lg:col-span-7"
        >
          <p className="sieve-eyebrow">PreStocks execution guard</p>

          <h1 className="sieve-display mt-5">
            <span className="block">Set the price.</span>
            <span className="sieve-display-muted">Sieve checks the execution.</span>
          </h1>

          <p className="sieve-hero-copy mt-7">
            Set the most you are willing to pay. Sieve checks the current executable Solana route before your wallet is asked to sign.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
            <Link href="/buy" className="sieve-action-primary">
              Start a buy
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>

            <Link href="/markets" className="sieve-action-secondary">
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
            className="sieve-marketing-stage"
            role="img"
            aria-label="Abstract Sieve animation showing incoming signals passing through a boundary."
          >
            <div className="sieve-marketing-grid" aria-hidden="true" />
            <div className="sieve-marketing-ring sieve-marketing-ring-a" aria-hidden="true" />
            <div className="sieve-marketing-ring sieve-marketing-ring-b" aria-hidden="true" />
            <div className="sieve-marketing-boundary" aria-hidden="true" />

            <div className="sieve-marketing-stream sieve-marketing-stream-1" aria-hidden="true" />
            <div className="sieve-marketing-stream sieve-marketing-stream-2" aria-hidden="true" />
            <div className="sieve-marketing-stream sieve-marketing-stream-3" aria-hidden="true" />
            <div className="sieve-marketing-stream sieve-marketing-stream-4" aria-hidden="true" />
            <div className="sieve-marketing-stream sieve-marketing-stream-5" aria-hidden="true" />

            <div className="sieve-marketing-core" aria-hidden="true">
              <SieveLogo size={28} color="currentColor" />
            </div>

            <p className="sieve-marketing-caption">
              Route enters.
              <strong>Boundary decides.</strong>
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
