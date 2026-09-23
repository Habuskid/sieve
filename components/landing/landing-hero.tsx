"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

export function LandingHero() {
  const reduceMotion = useReducedMotion();
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const router = useRouter();

  const explicitConnectRef = useRef(false);

  useEffect(() => {
    const handleIntent = () => {
      explicitConnectRef.current = true;
    };
    window.addEventListener("sieve:wallet-connect-intent", handleIntent);
    return () => window.removeEventListener("sieve:wallet-connect-intent", handleIntent);
  }, []);

  useEffect(() => {
    if (explicitConnectRef.current && connected) {
      explicitConnectRef.current = false;
      router.push("/dashboard");
    }
  }, [connected, router]);

  const handleConnectWallet = () => {
    explicitConnectRef.current = true;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sieve:wallet-connect-intent"));
    }
    setVisible(true);
  };

  return (
    <section className="relative overflow-hidden border-b border-borderBase bg-background">
      <div className="sieve-shell grid min-h-[calc(100dvh-56px)] grid-cols-1 items-center gap-14 py-16 sm:py-20 lg:grid-cols-12 lg:gap-12 lg:py-20">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="lg:col-span-7"
        >
          <p className="sieve-eyebrow">User-defined execution boundary engine for PreStocks</p>

          <h1 className="sieve-display mt-5">
            <span className="block">You set the boundary.</span>
            <span className="sieve-display-muted">Sieve enforces it.</span>
          </h1>

          <p className="sieve-hero-copy mt-7">
            Set the execution constraint for a PreStocks trade. Sieve measures current Jupiter execution against the PreStocks reference, accounts for the token&apos;s onchain economics, and verifies how much of the requested order currently fits your boundary before transaction preparation.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
            {connected ? (
              <Link href="/dashboard" className="sieve-action-primary">
                Open dashboard
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleConnectWallet}
                className="sieve-action-primary"
              >
                Connect wallet
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            )}

            <Link href="/markets" className="sieve-action-secondary">
              Explore PreStocks
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.08, duration: 0.5, ease: "easeOut" }}
          className="lg:col-span-5"
        >
          <div className="rounded-panel border border-borderBase bg-surface p-5 shadow-xs sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-borderBase pb-3">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-secondaryText">
                Illustrative example
              </span>
              <span className="font-mono text-[10px] text-mutedText">
                Not live market data
              </span>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-secondaryText">Asset</span>
                <span className="font-bold text-primaryText">OpenAI (OPENAI)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-secondaryText">Reference price</span>
                <span className="text-primaryText">$500.00</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-secondaryText">Configured boundary</span>
                <span className="font-semibold text-sieveBlue">+5.0% maximum premium ($525.00)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-secondaryText">Requested order</span>
                <span className="text-primaryText">1,000 USDC</span>
              </div>

              <div className="rounded-[4px] border border-sky-500/20 bg-sky-500/[0.03] p-3 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-primaryText flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5 text-sieveBlue" aria-hidden="true" />
                    Within boundary
                  </span>
                  <span className="text-secondaryText font-medium">Boundary Capacity Verified</span>
                </div>
                <p className="text-secondaryText leading-relaxed">
                  650 USDC of the requested 1,000 USDC is currently verified within your configured boundary.
                </p>
                <div className="pt-1 text-mutedText text-[10px]">
                  Verified Amount: <span className="font-bold text-primaryText">650 USDC</span> · Effective Price: <span className="font-bold text-primaryText">$512.40</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-borderBase flex items-center justify-between text-[11px] text-secondaryText font-mono">
              <span>Executable route check</span>
              <span className="text-sieveBlue font-semibold">Ready to prepare</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
