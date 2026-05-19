import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        status: {
          idle: "#94a3b8",
          working: "#22c55e",
          blocked: "#ef4444",
          offline: "#64748b",
        },
      },
    },
  },
  plugins: [],
};

export default config;
