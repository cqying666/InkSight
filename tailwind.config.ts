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
        // InkSight Design System v3.0 — Editorial Paper + Cinnabar
        // 干净纸白底、墨迹主色、朱砂强调、文学杂志质感
        primary: "#1C1C1E",
        accent: "#9C4B3C",
        "accent-soft": "#F3E3DD",
        "accent-muted": "#D4A89A",
        "accent-warm": "#7C6F66",
        bg: "#FDFCFA",
        "bg-alt": "#FFFFFF",
        "bg-soft": "#FAF7F2",
        "bg-elevated": "#FFFFFF",
        surface: "#FFFFFF",
        "surface-sunken": "#F8F6F1",
        text: "#1C1C1E",
        "text-muted": "#6B665E",
        "text-inverse": "#FDFCFA",
        border: "rgba(28,28,30,0.06)",
        "border-strong": "rgba(28,28,30,0.10)",
        success: "#5B7A5B",
        warning: "#B8894A",
        danger: "#A94B4B",
        info: "#6A7D89",
        data: {
          heat0: "#FDFCFA",
          heat1: "#EDE5DF",
          heat2: "#E2CFC7",
          heat3: "#D4A89A",
          heat4: "#B86B5A",
          heat5: "#9C4B3C",
        },

        // 旧色名兼容（逐步迁移中，新代码请使用新 token）
        seal: "#1C1C1E",
        gold: "#7C6F66",
        ink: "#1C1C1E",
        ivory: "#FDFBF7",
        paper: "#F5F0E8",
        muted: "#7A746C",
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', '"Noto Serif SC"', "serif"],
        sans: ['"Inter"', '"Noto Sans SC"', "sans-serif"],
        display: ['"Inter"', '"Noto Sans SC"', "sans-serif"],
        mono: ['"JetBrains Mono"', '"SF Mono"', '"Menlo"', "monospace"],
      },
      fontSize: {
        display: ["clamp(2.75rem, 5.5vw, 4rem)", { lineHeight: "0.95", letterSpacing: "-0.035em", fontWeight: "800" }],
        "title-xl": ["clamp(2rem, 4vw, 2.75rem)", { lineHeight: "1.0", letterSpacing: "-0.025em", fontWeight: "700" }],
        "title-lg": ["1.75rem", { lineHeight: "1.15", letterSpacing: "-0.015em", fontWeight: "700" }],
        "title-md": ["1.25rem", { lineHeight: "1.3", letterSpacing: "-0.005em", fontWeight: "600" }],
        body: ["0.9375rem", { lineHeight: "1.65" }],
        "body-sm": ["0.8125rem", { lineHeight: "1.55" }],
        caption: ["0.6875rem", { lineHeight: "1.4", letterSpacing: "0.14em" }],
        tiny: ["0.625rem", { lineHeight: "1.4", letterSpacing: "0.08em" }],
      },
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "24px",
        xl: "40px",
        "2xl": "64px",
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "16px",
        xl: "20px",
        full: "9999px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(28,28,30,0.03), 0 6px 24px rgba(28,28,30,0.04)",
        float: "0 1px 2px rgba(28,28,30,0.04), 0 8px 32px rgba(28,28,30,0.06)",
        nav: "2px 0 16px rgba(28,28,30,0.02)",
        "focus-ring": "0 0 0 2px rgba(156,75,60,0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
