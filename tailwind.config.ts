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
        background: "#F7FAFD",
        surface: {
          DEFAULT: "#FFFFFF",
          subtle: "#F1F6FA",
        },
        primaryText: "#0B1220",
        secondaryText: "#526173",
        mutedText: "#7B8796",
        borderBase: "#DCE5ED",
        borderStrong: "#C4D0DB",
        sieveBlue: {
          DEFAULT: "#1473E6",
          soft: "#EAF4FF",
          hover: "#0D5CBF",
        },
        sieveGreen: {
          DEFAULT: "#0E7653",
          soft: "#EDF8F3",
        },
        sieveRed: {
          DEFAULT: "#B83A36",
          soft: "#FFF2F1",
        },
        sieveAmber: {
          DEFAULT: "#8A6200",
          soft: "#FFF8E8",
        },
      },
      borderRadius: {
        panel: "0.5rem", // 8px
        card: "0.375rem", // 6px
        btn: "0.375rem", // 6px
      },
    },
  },
  plugins: [],
};

export default config;
