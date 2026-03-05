import type { Config } from "tailwindcss";

const config: Config = {
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
      },
    },
  },
  plugins: [],
};

export default config;
