/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#04060c",
        panel: "rgba(13,18,33,0.9)",
        panel2: "rgba(18,26,46,0.95)",
        line: "rgba(0,240,255,0.14)",
        line2: "rgba(0,240,255,0.35)",
        dim: "#7e90ad",
        faint: "#45536d",
        cyan: "#00f0ff",
        nblue: "#3b82f6",
        pink: "#ff2d95",
        purple: "#a78bfa",
        lime: "#b6ff2e",
        amber: "#ffb020",
        nred: "#ff4757",
      },
      fontFamily: {
        display: ["'Chakra Petch'", "sans-serif"],
        body: ["'Rajdhani'", "sans-serif"],
        mono: ["'Share Tech Mono'", "monospace"],
        hand: ["'Caveat'", "cursive"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        "spin-slow": "spin 9s linear infinite",
        sweep: "sweep 14s linear infinite",
        tick: "tick 60s linear infinite",
        shimmer: "shimmer 2.8s infinite",
        rise: "rise 0.5s backwards",
      },
      keyframes: {
        sweep: { to: { transform: "translateY(calc(100vh + 280px))" } },
        tick: { to: { transform: "translateX(-50%)" } },
        shimmer: { to: { transform: "translateX(100%)" } },
        rise: { from: { opacity: "0", transform: "translateY(14px)" } },
      },
    },
  },
  plugins: [],
};
