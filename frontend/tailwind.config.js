/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#070d1a", 900: "#0b1220", 850: "#0f1830", 800: "#131e38", 700: "#1b2845", 600: "#25345a" },
        line: "#1f2d4b",
        accent: { DEFAULT: "#22d3ee", soft: "#0e7490", blue: "#3b82f6" },
        paper: "#eef1f6",
        sodium: "#f2b45a",
        flow: { free: "#22c55e", moderate: "#eab308", heavy: "#f97316", severe: "#ef4444", closed: "#64748b" },
      },
      fontFamily: {
        sans: ["Inter Variable", "Inter", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
        editorial: ["Playfair Display", "Georgia", "Times New Roman", "serif"],
      },
      boxShadow: { card: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)" },
    },
  },
  plugins: [],
};
