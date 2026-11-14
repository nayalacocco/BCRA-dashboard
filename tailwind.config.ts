import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Sistema de diseño v5: variables CSS generadas desde src/design/tokens.ts
        ds: {
          bg: "var(--bg)",
          surface: "var(--surface)",
          sidebar: "var(--sidebar)",
          rule: "var(--rule)",
          "rule-strong": "var(--rule-strong)",
          text: "var(--text)",
          "text-2": "var(--text-2)",
          muted: "var(--muted)",
          head: "var(--head)",
          celeste: "var(--celeste)",
          soft: "var(--soft)",
          s1: "var(--s1)",
          s2: "var(--s2)",
          s3: "var(--s3)",
          s4: "var(--s4)",
          "div-lo": "var(--div-lo)",
          "div-hi": "var(--div-hi)",
        },
        // BCRA brand-adjacent palette
        bcra: {
          50: "#eef2ff",
          100: "#e0e7ff",
          500: "#3b5bdb",
          600: "#3451c7",
          700: "#2c44b0",
          800: "#233a99",
          900: "#1a2e7a",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        serif: ['"Source Serif 4"', "Georgia", '"Times New Roman"', "serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
