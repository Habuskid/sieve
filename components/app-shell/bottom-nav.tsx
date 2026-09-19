"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ShoppingCart, History, Settings } from "lucide-react";

export function BottomNav() {
  const pathname = usePathname();

  const navLinks = [
    { href: "/markets", label: "Markets", icon: BarChart3 },
    { href: "/buy", label: "Buy", icon: ShoppingCart },
    { href: "/history", label: "History", icon: History },
    { href: "/preferences", label: "Settings", icon: Settings },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-borderBase bg-surface/95 backdrop-blur-md px-4 py-2"
      aria-label="Mobile Bottom Navigation"
    >
      <div className="flex items-center justify-around">
        {navLinks.map((link) => {
          const isActive = pathname?.startsWith(link.href);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center justify-center gap-1 min-w-[64px] min-h-[44px] rounded-lg py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "text-sieveBlue font-semibold"
                  : "text-secondaryText hover:text-primaryText"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
