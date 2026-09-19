"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NetworkToggle } from "./network-toggle";
import { WalletButton } from "./wallet-button";
import type { NetworkMode } from "@/core/domain/types";
import { ShieldCheck, BarChart3, ShoppingCart, History, Settings } from "lucide-react";

interface HeaderProps {
  network: NetworkMode;
  onNetworkChange: (network: NetworkMode) => void;
}

export function Header({ network, onNetworkChange }: HeaderProps) {
  const pathname = usePathname();

  const navLinks = [
    { href: "/markets", label: "Markets", icon: BarChart3 },
    { href: "/buy", label: "Buy", icon: ShoppingCart },
    { href: "/history", label: "History", icon: History },
    { href: "/preferences", label: "Preferences", icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-30 w-full border-b border-borderBase bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-primaryText hover:opacity-90 transition-opacity"
            aria-label="Sieve Home"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primaryText text-white">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <span className="text-xl font-bold tracking-tight">SIEVE</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main Navigation">
            {navLinks.map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname?.startsWith(link.href);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-surface-subtle text-primaryText font-semibold shadow-2xs"
                      : "text-secondaryText hover:text-primaryText hover:bg-surface-subtle/60"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
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
