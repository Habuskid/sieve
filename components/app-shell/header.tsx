"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NetworkToggle } from "./network-toggle";
import { WalletButton } from "./wallet-button";
import { SieveLogo } from "../brand/sieve-logo";
import type { NetworkMode } from "@/core/domain/types";

interface HeaderProps {
  network: NetworkMode;
  onNetworkChange: (network: NetworkMode) => void;
}

export function Header({ network, onNetworkChange }: HeaderProps) {
  const pathname = usePathname();

  const navLinks = [
    { href: "/markets", label: "Markets" },
    { href: "/buy", label: "Buy" },
    { href: "/history", label: "History" },
    { href: "/preferences", label: "Preferences" },
  ];

  return (
    <header className="sticky top-0 z-30 w-full border-b border-borderBase bg-surface">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand & Main Nav */}
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-primaryText hover:text-sieveBlue transition-colors"
            aria-label="Sieve Home"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-[4px] bg-primaryText text-surface">
              <SieveLogo size={16} color="#FFFFFF" />
            </div>
            <span className="text-base font-bold tracking-wider font-mono">SIEVE</span>
          </Link>

          {/* Desktop Navigation - Clean text with underline for active state */}
          <nav className="hidden md:flex items-center gap-6" aria-label="Main Navigation">
            {navLinks.map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname?.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`py-4 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
                    isActive
                      ? "border-primaryText text-primaryText font-semibold"
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

        {/* Right Controls: Network Toggle + Wallet */}
        <div className="flex items-center gap-3">
          <NetworkToggle
            currentNetwork={network}
            onNetworkChange={onNetworkChange}
          />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
