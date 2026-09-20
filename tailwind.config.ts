import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./core/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--sieve-bg)",
        surface: {
          DEFAULT: "var(--sieve-surface)",
          subtle: "var(--sieve-surface-subtle)",
          elevated: "var(--sieve-surface-elevated)",
        },
        primaryText: "var(--sieve-text)",
        secondaryText: "var(--sieve-text-secondary)",
        mutedText: "var(--sieve-text-muted)",
        borderBase: "var(--sieve-border)",
        borderStrong: "var(--sieve-border-strong)",
        sieveBlue: {
          DEFAULT: "var(--sieve-blue)",
          soft: "var(--sieve-blue-soft)",
          hover: "var(--sieve-blue-hover)",
        },
        sieveCyan: {
          DEFAULT: "var(--sieve-cyan)",
          soft: "var(--sieve-cyan-soft)",
        },
        sieveGreen: {
          DEFAULT: "var(--sieve-green)",
          soft: "var(--sieve-green-soft)",
        },
        sieveRed: {
          DEFAULT: "var(--sieve-red)",
          soft: "var(--sieve-red-soft)",
        },
        sieveAmber: {
          DEFAULT: "var(--sieve-amber)",
          soft: "var(--sieve-amber-soft)",
        },
      },
      borderRadius: {
        panel: "var(--sieve-radius)",
        card: "var(--sieve-radius)",
        btn: "var(--sieve-radius)",
      },
    },
  },
  plugins: [],
};

export default config;
