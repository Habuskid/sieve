"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BarChart3, History, Settings } from "lucide-react";

export function BottomNav() {
  const pathname = usePathname();

  const navLinks = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/markets", label: "Markets", icon: BarChart3 },
    { href: "/history", label: "History", icon: History },
    { href: "/preferences", label: "Preferences", icon: Settings },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-borderBase bg-surface px-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 md:hidden"
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
              className={`flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 border-t py-1 text-xs transition-colors duration-150 ${
                isActive
                  ? "border-sieveBlue font-medium text-sieveBlue"
                  : "border-transparent text-secondaryText hover:text-primaryText"
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
