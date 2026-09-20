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
        background: "#101722",
        surface: {
          DEFAULT: "#151E2B",
          subtle: "#1A2635",
          elevated: "#202E40",
        },
        primaryText: "#F1F5F9",
        secondaryText: "#B3C0CE",
        mutedText: "#7F90A3",
        borderBase: "#263446",
        borderStrong: "#35475D",
        sieveBlue: {
          DEFAULT: "#55BFF4",
          soft: "rgba(85, 191, 244, 0.1)",
          hover: "#7CCCF5",
        },
        sieveCyan: {
          DEFAULT: "#06B6D4",
          soft: "rgba(6, 182, 212, 0.1)",
          hover: "#0891B2",
        },
        sieveGreen: {
          DEFAULT: "#10B981",
          soft: "rgba(16, 185, 129, 0.12)",
          hover: "#059669",
        },
        sieveRed: {
          DEFAULT: "#F43F5E",
          soft: "rgba(244, 63, 94, 0.12)",
          hover: "#E11D48",
        },
        sieveAmber: {
          DEFAULT: "#F59E0B",
          soft: "rgba(245, 158, 11, 0.12)",
        },
      },
      borderRadius: {
        panel: "2px",
        card: "2px",
        btn: "2px",
      },
    },
  },
  plugins: [],
};

export default config;
