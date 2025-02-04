import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "#8B5CF6", // Updated to more vibrant purple
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#1EAEDB", // Bright blue
          foreground: "#ffffff",
        },
        accent: {
          DEFAULT: "#F97316", // Bright orange
          foreground: "#ffffff",
        },
        tech: {
          dark: "#1A1F2C",
          light: "#FEF7CD",
        },
      },
      fontFamily: {
        heebo: ["Heebo", "sans-serif"],
        handwriting: ["Caveat", "cursive"], // Added handwriting font
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;