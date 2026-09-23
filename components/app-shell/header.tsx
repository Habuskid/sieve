"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./wallet-button";
import { SieveLogo } from "../brand/sieve-logo";

export function Header() {
  const pathname = usePathname();

  const navLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/markets", label: "Markets" },
    { href: "/buy", label: "Buy" },
    { href: "/history", label: "History" },
    { href: "/preferences", label: "Preferences" },
  ];

  return (
    <header className="sticky top-0 z-30 w-full border-b border-borderBase bg-background/95">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
        {/* Brand & Main Nav */}
        <div className="flex items-center gap-10">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-primaryText transition-colors duration-150 hover:text-sieveBlue"
            aria-label="Sieve Home"
          >
            <div className="flex size-7 items-center justify-center text-sieveBlue">
              <SieveLogo size={16} color="#38BDF8" />
            </div>
            <span className="text-sm font-semibold text-primaryText">
              SIEVE
            </span>
          </Link>

          {/* Desktop Navigation - Precision hairline active indicator */}
          <nav className="hidden items-center gap-7 md:flex" aria-label="Main Navigation">
            {navLinks.map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname?.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`-mb-px border-b py-4 text-sm transition-colors duration-150 ${
                    isActive
                      ? "border-sieveBlue text-primaryText font-medium"
                      : "border-transparent text-secondaryText hover:text-primaryText"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Controls: fixed Mainnet identity + wallet */}
        <div className="flex items-center gap-4">
          <span className="hidden text-xs text-secondaryText sm:inline">Solana Mainnet</span>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
