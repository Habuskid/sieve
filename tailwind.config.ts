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
        background: "#17212D",
        surface: {
          DEFAULT: "#1D2A38",
          subtle: "#243445",
          elevated: "#2B3D50",
        },
        primaryText: "#F7FAFC",
        secondaryText: "#C4D0DC",
        mutedText: "#8FA2B6",
        borderBase: "#304255",
        borderStrong: "#465B70",
        sieveBlue: {
          DEFAULT: "#67C8FF",
          soft: "rgba(103, 200, 255, 0.1)",
          hover: "#91D8FF",
        },
        sieveCyan: {
          DEFAULT: "#38D0E5",
          soft: "rgba(56, 208, 229, 0.1)",
          hover: "#63DDEB",
        },
        sieveGreen: {
          DEFAULT: "#35C98A",
          soft: "rgba(53, 201, 138, 0.1)",
          hover: "#5AD8A1",
        },
        sieveRed: {
          DEFAULT: "#FF6B7D",
          soft: "rgba(255, 107, 125, 0.1)",
          hover: "#FF8896",
        },
        sieveAmber: {
          DEFAULT: "#F4B860",
          soft: "rgba(244, 184, 96, 0.1)",
        },
      },
      borderRadius: {
        panel: "4px",
        card: "4px",
        btn: "4px",
      },
    },
  },
  plugins: [],
};

export default config;
