import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Palette neutre froide (famille zinc). Les noms historiques
      // (cream, line…) sont conservés pour ne pas toucher chaque page ;
      // seules les valeurs changent. Le rouge Mario (accent) est réservé
      // au logo, aux erreurs et aux actions destructrices.
      colors: {
        white: "#FFFFFF",
        cream: "#F7F7F8",
        "cream-dark": "#EFEFF1",
        ink: "#18181B",
        body: "#3F3F46",
        muted: "#71717A",
        line: "#E4E4E7",
        "line-soft": "#F0F0F2",
        "line-input": "#D4D4D8",
        "line-dashed": "#C4C4CC",
        segment: "#EDEDF0",
        accent: "#C8381F",
        pill: {
          "green-bg": "#E6F4EA",
          "green-fg": "#1E6B3A",
          "amber-bg": "#FBF1DC",
          "amber-fg": "#7A5310",
          "red-bg": "#FBE9E6",
          "red-fg": "#9A2A17",
          "blue-bg": "#E7EEFA",
          "blue-fg": "#1F4E8C",
          "gray-bg": "#F0F0F2",
          "gray-fg": "#3F3F46",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
