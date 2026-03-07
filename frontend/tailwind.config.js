/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      /* ===== BRANDING: change these to adjust look =====
       * background: surface-bg, surface-bg-end (gradient)
       * accent gradients: surface-accent-* (iridescent/holographic)
       * text: surface-text, surface-text-muted, surface-text-strong
       * pills/buttons: surface-pill border and hover
       */
      colors: {
        "surface-bg": "#0d0a14",
        "surface-bg-end": "#1a1225",
        "surface-card": "rgba(30, 25, 45, 0.6)",
        "surface-text": "#e8e4f0",
        "surface-text-muted": "#a89ec9",
        "surface-text-strong": "#ffffff",
        "surface-pill-border": "rgba(255,255,255,0.25)",
        "surface-pill-hover": "rgba(255,255,255,0.08)",
        "surface-watermark": "rgba(180, 160, 220, 0.08)",
        "surface-accent-cyan": "#22d3ee",
        "surface-accent-magenta": "#e879f9",
        "surface-accent-blue": "#60a5fa",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "hero-gradient":
          "linear-gradient(180deg, var(--tw-gradient-from) 0%, var(--tw-gradient-to) 100%)",
        "iridescent":
          "linear-gradient(135deg, #22d3ee 0%, #a78bfa 35%, #e879f9 65%, #60a5fa 100%)",
      },
      animation: {
        "float": "float 8s ease-in-out infinite",
        "shimmer": "shimmer 3s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
          "50%": { transform: "translateY(-12px) rotate(2deg)" },
        },
        shimmer: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.85" },
        },
      },
      boxShadow: {
        "glow": "0 0 40px rgba(136, 58, 234, 0.25)",
        "glow-cyan": "0 0 30px rgba(34, 211, 238, 0.2)",
        "glow-magenta": "0 0 30px rgba(232, 121, 249, 0.2)",
      },
    },
  },
  plugins: [],
};
