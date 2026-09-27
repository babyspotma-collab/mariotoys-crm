import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        white: "#FFFFFF",
        cream: "#F6F4EF",
        "cream-dark": "#F1EEE7",
        ink: "#1C1B19",
        body: "#4A4741",
        muted: "#6B675F",
        line: "#E4E0D8",
        "line-soft": "#EEEAE3",
        "line-input": "#DDD8CE",
        "line-dashed": "#CFC8BB",
        segment: "#ECE8E0",
        accent: "#C8381F",
        pill: {
          "green-bg": "#E3EFE5",
          "green-fg": "#245C34",
          "amber-bg": "#F6EEDC",
          "amber-fg": "#6E500E",
          "red-bg": "#F8E6E1",
          "red-fg": "#8E2A18",
          "blue-bg": "#E4ECF7",
          "blue-fg": "#1F4E8C",
          "gray-bg": "#EFECE6",
          "gray-fg": "#4A4741",
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
