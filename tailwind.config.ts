import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        white: "#FAFAF8",
        ink: "#16181B",
        stone: "#EFEEE9",
        line: "#DEDCD3",
        slate: "#7C93A0",
        sage: {
          DEFAULT: "#6B7A5E",
          dark: "#4E5A43",
        },
        muted: "#6B6D68",
        danger: "#B3463A",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
