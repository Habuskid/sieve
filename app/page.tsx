import React from "react";
import { LandingHero } from "@/components/landing/landing-hero";

const steps = [
  {
    index: "01",
    title: "Choose your ceiling",
    body: "Set the maximum premium you are willing to accept for the order.",
  },
  {
    index: "02",
    title: "Check the executable route",
    body: "Sieve measures the route for your exact amount before a transaction is prepared.",
  },
  {
    index: "03",
    title: "Sign only when it fits",
    body: "If execution moves beyond your boundary, Sieve stops before the trade reaches your wallet.",
  },
];

export default function Home() {
  return (
    <div className="bg-background">
      <LandingHero />

      <section className="border-b border-borderBase py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="mb-8 border-b border-borderBase pb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mutedText">
              How it works
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-primaryText sm:text-3xl">
              A price check before the signature.
            </h2>
          </div>

          <div className="grid gap-8 md:grid-cols-3 md:gap-10">
            {steps.map((step) => (
              <article key={step.index} className="border-t border-borderStrong pt-5">
                <p className="text-xs font-medium tabular-nums text-sieveBlue">{step.index}</p>
                <h3 className="mt-4 text-lg font-medium text-primaryText">{step.title}</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-secondaryText">{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
