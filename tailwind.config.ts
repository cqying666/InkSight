import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // InkSight Editorial 文学杂志风格色板
        seal: "#8B2635",
        gold: "#A87E3B",
        ink: "#1A1614",
        ivory: "#F5F0E8",
        paper: "#FAF6EF",
        muted: "#6B5D52",
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', '"Noto Serif SC"', "serif"],
        sans: ['"Inter"', '"Noto Sans SC"', "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
