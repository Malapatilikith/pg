import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#007AFF",
        ink: "#000000",
        mist: "#F2F4F7",
        accent: "#34C759",
        shell: "#F9FAFB"
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
      },
      boxShadow: {
        "premium-soft": "0 8px 30px rgba(0, 0, 0, 0.04)",
        "premium-floating": "0 20px 40px rgba(0, 0, 0, 0.08)",
        panel: "0 4px 20px rgba(0, 0, 0, 0.03)",
        shell: "0 0 0 1px rgba(0,0,0,0.02), 0 24px 60px rgba(0, 0, 0, 0.04)"
      },
      borderRadius: {
        '4xl': '2rem',
      }
    }
  },
  plugins: []
} satisfies Config;
