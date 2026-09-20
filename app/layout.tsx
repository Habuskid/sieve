import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sieve | Buy private-market tokens without overpaying",
  description: "Set the price limit you're comfortable with. Sieve checks the live market before you sign.",
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
