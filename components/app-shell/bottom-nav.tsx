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
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-borderBase bg-surface px-2 py-1"
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
              className={`flex flex-col items-center justify-center gap-1 min-w-[64px] min-h-[44px] rounded-[4px] py-1 text-[11px] font-medium transition-colors ${
                isActive
                  ? "text-primaryText font-semibold border-b-2 border-primaryText"
                  : "text-secondaryText hover:text-primaryText border-b-2 border-transparent"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
