import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // GitHub Primer-inspired accent palette
        primer: {
          green: "#3fb950",
          blue: "#58a6ff",
          purple: "#bc8cff",
          red: "#f85149",
          orange: "#d29922",
          muted: "#8b949e",
        },
        // Semantic theme tokens (CSS variables)
        surface: {
          page:      "var(--bg-page)",
          card:      "var(--bg-card)",
          "card-hover": "var(--bg-card-hover)",
          elevated:  "var(--bg-elevated)",
          subtle:    "var(--bg-subtle)",
          inset:     "var(--bg-inset)",
        },
        overlay: "var(--bg-overlay)",
        hover:   "var(--bg-hover)",
        active:  "var(--bg-active)",
        border: {
          default: "var(--border-default)",
          subtle:  "var(--border-subtle)",
        },
        fg: {
          primary:   "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary:  "var(--text-tertiary)",
          muted:     "var(--text-muted)",
          faint:     "var(--text-faint)",
        },
        accent: {
          green: "var(--accent-green)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
