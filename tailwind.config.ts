import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#FFFFFF",
        foreground: "#0F172A",
        surface: {
          DEFAULT: "#F8FAFC",
          elevated: "#FFFFFF",
        },
        line: "#E2E8F0",
        primary: {
          DEFAULT: "#2563EB",
          deep: "#1E3A8A",
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D4ED8",
          800: "#1E40AF",
          900: "#1E3A8A",
        },
        accent: {
          DEFAULT: "#14B8A6",
          soft: "#CCFBF1",
          100: "#CCFBF1",
          200: "#99F6E4",
          300: "#5EEAD4",
          400: "#2DD4BF",
          500: "#14B8A6",
        },
        muted: {
          DEFAULT: "#64748B",
          // slate-500: 4.6:1 on white — passes WCAG AA for normal text.
          // Reserve lighter grays only for large text or non-text decoration.
          foreground: "#475569",
        },
        success: "#10B981",
        error: "#EF4444",
        // Distinct from accent (#14B8A6 teal): warm amber — a warning state
        // should still read as attention-grabbing even in a cool palette.
        warning: "#D97706",
        glass: "rgba(255,255,255,0.92)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["'SF Mono'", "'JetBrains Mono'", "Monaco", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["11px", { lineHeight: "16px" }],
      },
      letterSpacing: {
        tightest: "-0.8px",
        tight2: "-1.6px",
      },
      borderRadius: {
        card: "22px",
        panel: "24px",
        control: "13px",
        btn2: "14px",
        pill: "100px",
      },
      boxShadow: {
        card: "0 2px 8px rgba(0,0,0,0.03)",
        "card-hover": "0 16px 48px rgba(15,23,42,0.10)",
        "btn-primary": "0 2px 8px rgba(37,99,235,0.20)",
        "btn-primary-hover": "0 6px 20px rgba(37,99,235,0.30)",
        "panel-float": "0 12px 40px rgba(0,0,0,0.08)",
        "ring-pulse": "0 0 0 0 rgba(37,99,235,0.35)",
      },
      transitionTimingFunction: {
        apple: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      animation: {
        shimmer: "shimmer 2.5s linear infinite",
        "fade-up": "fadeUp 0.5s cubic-bezier(0.4,0,0.2,1) both",
        "pulse-ring": "pulseRing 1.8s cubic-bezier(0.4,0,0.2,1) infinite",
        "float-orbit": "floatOrbit 14s ease-in-out infinite",
        "draw-dash": "drawDash 3s cubic-bezier(0.4,0,0.2,1) infinite",
        "progress-grow": "progressGrow 0.8s cubic-bezier(0.4,0,0.2,1) both",
        "gradient-x": "gradientX 6s ease infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseRing: {
          "0%": { boxShadow: "0 0 0 0 rgba(16,185,129,0.45)" },
          "70%": { boxShadow: "0 0 0 8px rgba(16,185,129,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(16,185,129,0)" },
        },
        floatOrbit: {
          "0%,100%": { transform: "translate(0,0) scale(1)" },
          "33%": { transform: "translate(24px,-32px) scale(1.05)" },
          "66%": { transform: "translate(-20px,24px) scale(0.97)" },
        },
        drawDash: {
          "0%": { strokeDashoffset: "600" },
          "100%": { strokeDashoffset: "0" },
        },
        progressGrow: {
          "0%": { width: "0%" },
        },
        gradientX: {
          "0%,100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;