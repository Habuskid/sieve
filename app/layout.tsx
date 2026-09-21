import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sieve — Execution Boundaries for PreStocks",
  description:
    "User-defined execution boundaries for PreStocks on Solana. Verify current Buy or Sell execution against your configured constraint before transaction preparation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background text-primaryText antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
