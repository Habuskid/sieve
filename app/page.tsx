import React from "react";
import Link from "next/link";
import { LandingHero } from "@/components/landing/landing-hero";
import { ArrowRight, ShieldCheck, ArrowUpRight, ArrowDownLeft, Layers, UserCheck, Activity } from "lucide-react";

const executionSteps = [
  {
    index: "01",
    title: "Check boundary",
    body: "Set asset, side, amount, and your execution boundary (maximum premium for Buy or maximum discount for Sell).",
  },
  {
    index: "02",
    title: "Inspect Boundary Capacity",
    body: "Sieve measures Jupiter route candidates against the PreStocks reference and returns the verified capacity.",
  },
  {
    index: "03",
    title: "Choose verified amount",
    body: "When capacity is partial, choose to prepare the verified amount or adjust your boundary.",
  },
  {
    index: "04",
    title: "Prepare transaction",
    body: "Sieve rechecks the reference, token state, and executable route and enforces the user's boundary in the final transaction constraints.",
  },
  {
    index: "05",
    title: "Review and sign",
    body: "Review the exact order ticket details and explicitly sign with your connected Solana wallet.",
  },
];

const architectureRoles = [
  {
    provider: "PreStocks",
    role: "Reference state",
    body: "Asset registry and reference state. PreStocks maintains official reference valuations. Sieve evaluates executable routes against the current PreStocks reference.",
    icon: Activity,
  },
  {
    provider: "Jupiter",
    role: "Executable liquidity",
    body: "Current executable route. Jupiter shows what can execute; Sieve checks whether that execution still fits the boundary you set.",
    icon: Layers,
  },
  {
    provider: "Solana",
    role: "Token-2022 economic state",
    body: "Onchain token state. Sieve accounts for Token-2022 economic state such as scaled UI amounts and transfer fees before treating a route as valid.",
    icon: ShieldCheck,
  },
  {
    provider: "You",
    role: "Execution policy",
    body: "You set the boundary (maximum premium or maximum discount) and choose the order size. Sieve enforces your policy instead of advising you.",
    icon: UserCheck,
  },
];

export default function Home() {
  return (
    <div className="bg-background">
      <LandingHero />

      {/* Core Primitive: Boundary Capacity */}
      <section className="border-b border-borderBase py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mutedText">
              The Core Question
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-primaryText sm:text-4xl leading-tight">
              How much of my requested order can execute right now without crossing the boundary I set?
            </h2>
            <p className="mt-5 text-base sm:text-lg leading-relaxed text-secondaryText">
              Boundary Capacity shows how much of your requested order was actually verified within your configured boundary.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-secondaryText">
              Instead of executing blindly or failing completely on price impact, Sieve probes executable route candidates up to your requested amount. When partial capacity is observed, you choose whether to prepare only the verified portion. Verification is bounded to observed route samples during the check; it is an empirical constraint check, not a theoretical market depth claim.
            </p>
          </div>
        </div>
      </section>

      {/* Buy and Sell Boundaries (Side-by-Side) */}
      <section className="border-b border-borderBase py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="mb-10 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mutedText">
              Two-Sided Enforcement
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-primaryText sm:text-3xl">
              Configurable constraints for both Buy and Sell orders.
            </h2>
            <p className="mt-3 text-sm text-secondaryText">
              Whether acquiring or exiting PreStocks, you define the execution boundary and Sieve enforces it.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 md:gap-10">
            {/* BUY Card */}
            <div className="rounded-panel border border-borderBase bg-surface p-6 sm:p-8 space-y-4">
              <div className="flex items-center justify-between border-b border-borderBase pb-3">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-sieveBlue flex items-center gap-1.5">
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                  Buy PreStocks
                </span>
                <span className="font-mono text-[11px] text-mutedText">USDC or SOL funding</span>
              </div>
              <h3 className="text-lg font-semibold text-primaryText">
                User sets Maximum Premium
              </h3>
              <p className="text-xs text-secondaryText leading-relaxed">
                Sieve verifies effective Buy execution against the PreStocks reference. If current route execution exceeds your maximum premium (reference price + premium ceiling), the order is blocked before transaction preparation.
              </p>
              <div className="rounded-[4px] border border-borderBase bg-surface-subtle p-3 font-mono text-[11px] space-y-1 text-secondaryText">
                <div>Constraint: <span className="text-primaryText font-semibold">Maximum execution price ceiling</span></div>
                <div>Output: <span className="text-primaryText font-semibold">Target PreStock units delivered to wallet</span></div>
              </div>
            </div>

            {/* SELL Card */}
            <div className="rounded-panel border border-borderBase bg-surface p-6 sm:p-8 space-y-4">
              <div className="flex items-center justify-between border-b border-borderBase pb-3">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-sieveBlue flex items-center gap-1.5">
                  <ArrowDownLeft className="size-4" aria-hidden="true" />
                  Sell PreStocks
                </span>
                <span className="font-mono text-[11px] text-mutedText">USDC output</span>
              </div>
              <h3 className="text-lg font-semibold text-primaryText">
                User sets Maximum Discount
              </h3>
              <p className="text-xs text-secondaryText leading-relaxed">
                Sieve verifies effective Sell execution against the PreStocks reference. If current route execution falls below your minimum price (reference price − discount floor), the order is blocked before transaction preparation.
              </p>
              <div className="rounded-[4px] border border-borderBase bg-surface-subtle p-3 font-mono text-[11px] space-y-1 text-secondaryText">
                <div>Constraint: <span className="text-primaryText font-semibold">Minimum execution price floor</span></div>
                <div>Output: <span className="text-primaryText font-semibold">Canonical USDC proceeds delivered to wallet</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Architecture & Roles: What Makes Sieve Different */}
      <section className="border-b border-borderBase py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="mb-10 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mutedText">
              Architecture &amp; Roles
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-primaryText sm:text-3xl">
              Clear separation of state, execution, and policy.
            </h2>
            <p className="mt-3 text-sm text-secondaryText">
              Sieve evaluates executable routes against the current PreStocks reference, accounts for onchain token economics, and enforces your execution policy.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {architectureRoles.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.provider} className="rounded-panel border border-borderBase bg-surface p-5 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-8 items-center justify-center rounded-[4px] bg-surface-subtle border border-borderBase text-sieveBlue">
                      <Icon className="size-4" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-primaryText text-sm">{item.provider}</h3>
                      <span className="font-mono text-[10px] text-sieveBlue uppercase tracking-wider block">
                        {item.role}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-secondaryText leading-relaxed">
                    {item.body}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-6 rounded-panel border border-borderBase bg-surface p-5 text-xs text-secondaryText leading-relaxed">
            <span className="font-bold text-primaryText">Sieve (Verification + Enforcement): </span>
            Boundary Capacity evaluation and final execution-boundary enforcement. Verifies route execution before transaction preparation and protects transaction constraints.
          </div>
        </div>
      </section>

      {/* Execution Lifecycle: Actionable, Not Analytics Only */}
      <section className="border-b border-borderBase py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="mb-10 border-b border-borderBase pb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mutedText">
              Execution Lifecycle
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-primaryText sm:text-3xl">
              Actionable verification before wallet signature.
            </h2>
            <p className="mt-2 text-sm text-secondaryText">
              Sieve is an execution boundary engine, not a read-only analytics dashboard. Every boundary check leads to an actionable transaction preparation flow.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-5 md:gap-6">
            {executionSteps.map((step) => (
              <article key={step.index} className="border-t border-borderStrong pt-4">
                <p className="text-xs font-medium tabular-nums text-sieveBlue font-mono">{step.index}</p>
                <h3 className="mt-3 text-sm font-semibold text-primaryText">{step.title}</h3>
                <p className="mt-2 text-xs leading-5 text-secondaryText">{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Final Revalidation & Bottom CTA */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="rounded-panel border border-borderBase bg-surface p-8 sm:p-12 text-center max-w-3xl mx-auto space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sieveBlue">
              Server-Authoritative Enforcement
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-primaryText">
              Define the execution limit. Verify the route. Prepare only what still fits.
            </h2>
            <p className="text-xs sm:text-sm text-secondaryText max-w-xl mx-auto leading-relaxed">
              Before transaction preparation, Sieve rechecks the reference, token state, and executable route and enforces the user&apos;s boundary in the final transaction constraints.
            </p>
            <div className="pt-2 flex justify-center">
              <Link href="/buy" className="sieve-action-primary">
                Check a boundary
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
