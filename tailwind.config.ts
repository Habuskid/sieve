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
        background: "#F7F9FC",
        surface: {
          DEFAULT: "#FFFFFF",
          subtle: "#F8FAFC",
        },
        primaryText: "#0F172A",
        secondaryText: "#5F6B7A",
        mutedText: "#8994A3",
        borderBase: "#E1E7EF",
        borderStrong: "#CBD5E1",
        sieveBlue: {
          DEFAULT: "#2563EB",
          soft: "#EEF6FF",
          hover: "#1D4ED8",
        },
        sieveGreen: {
          DEFAULT: "#16794F",
          soft: "#EFF8F3",
        },
        sieveRed: {
          DEFAULT: "#B5473E",
          soft: "#FFF4F2",
        },
        sieveAmber: {
          DEFAULT: "#8B6508",
          soft: "#FFF9ED",
        },
      },
      borderRadius: {
        panel: "1.25rem", // 20px
        card: "1rem", // 16px
        btn: "0.875rem", // 14px
      },
    },
  },
  plugins: [],
};

export default config;
