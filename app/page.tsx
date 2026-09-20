import React from "react";
import { LandingHero } from "@/components/landing/landing-hero";

const points = [
  { title: "Set your limit", body: "Choose the maximum premium you accept." },
  { title: "Check the route", body: "Sieve compares the price for your exact amount." },
  { title: "Review before signing", body: "Continue only when the route passes your limit." },
];

export default function Home() {
  return (
    <div className="bg-background">
      <LandingHero />
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="grid gap-8 border-t border-borderBase pt-8 sm:grid-cols-3 sm:gap-10 sm:pt-10">
            {points.map((point) => (
              <div key={point.title} className="max-w-sm">
                <h2 className="text-base font-medium text-primaryText">{point.title}</h2>
                <p className="mt-2 text-pretty text-sm leading-6 text-secondaryText">{point.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
