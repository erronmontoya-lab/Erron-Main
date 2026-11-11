import type { Config } from "tailwindcss";

// Design tokens from the homepage mock (brief section 13).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B1220",
        deepest: "#05090F", // announcement bar and footer
        raised: "#131C2E",
        "dark-border": "#26324A",
        "dark-outline": "#3A4862",
        page: "#F5F7FA",
        line: "#DFE4EB",
        "line-soft": "#EEF1F5",
        chip: "#E6EAF0",
        muted: "#4A5568",
        body: "#2D3748",
        "muted-dark": "#AEB8C9",
        "soft-dark": "#C9D3E3",
        accent: "#FF6B2C", // always with ink text, never white
        "data-dark": "#5B8CFF",
        "data-light": "#1F4FE0",
      },
      fontFamily: {
        display: ["'Bricolage Grotesque'", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      maxWidth: { site: "1180px" },
    },
  },
  plugins: [],
} satisfies Config;
