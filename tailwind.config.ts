import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ── SchoolCo Harmony Color System ─────────────────────────────────
      colors: {
        // Brand primaries
        "sc-teal": {
          DEFAULT: "#046264",
          50:  "#E6F4F4",
          100: "#C0E3E4",
          200: "#8FCBCC",
          300: "#5EB3B4",
          400: "#2D9B9D",
          500: "#046264", // base
          600: "#035355",
          700: "#024446",
          800: "#013536",
          900: "#002627",
        },
        "sc-navy": {
          DEFAULT: "#0B1747",
          50:  "#E8EAF3",
          100: "#C5CBE2",
          200: "#8E99C9",
          300: "#5767AF",
          400: "#2E3F96",
          500: "#0B1747", // base
          600: "#09143C",
          700: "#071131",
          800: "#050D26",
          900: "#030A1B",
        },
        "sc-rose": {
          DEFAULT: "#E64E72",
          50:  "#FDF0F3",
          100: "#FAD7E0",
          200: "#F5AFC1",
          300: "#EF87A2",
          400: "#EA6088",
          500: "#E64E72", // base
          600: "#D43860",
          700: "#B22B50",
          800: "#911E40",
          900: "#701130",
        },
        "sc-green": {
          DEFAULT: "#436B2E",
          50:  "#EFF5EB",
          100: "#D3E6C9",
          200: "#AECFA0",
          300: "#88B877",
          400: "#63A14F",
          500: "#436B2E", // base
          600: "#385A27",
          700: "#2D4920",
          800: "#223819",
          900: "#172712",
        },
        "sc-gold": {
          DEFAULT: "#C8970A",
          50:  "#FDF8E7",
          100: "#FAECBA",
          200: "#F5D97B",
          300: "#F0C63C",
          400: "#DEB01B",
          500: "#C8970A", // base
          600: "#A87D08",
          700: "#886307",
          800: "#674905",
          900: "#463004",
        },
        // Neutrals
        "sc-cream": "#F8F7F4",
        "sc-gray": {
          DEFAULT: "#6B7280",
          50:  "#F9FAFB",
          100: "#F3F4F6",
          200: "#E5E7EB",
          300: "#D1D5DB",
          400: "#9CA3AF",
          500: "#6B7280",
          600: "#4B5563",
          700: "#374151",
          800: "#1F2937",
          900: "#111827",
        },
        // Semantic aliases (used by shadcn/ui)
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      // ── Typography ────────────────────────────────────────────────────
      fontFamily: {
        serif: ["var(--font-playfair)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-1": ["3rem", { lineHeight: "1.1", fontWeight: "700" }],
        "display-2": ["2.25rem", { lineHeight: "1.15", fontWeight: "700" }],
        "heading-1": ["1.875rem", { lineHeight: "1.2", fontWeight: "600" }],
        "heading-2": ["1.5rem", { lineHeight: "1.25", fontWeight: "600" }],
        "heading-3": ["1.25rem", { lineHeight: "1.3", fontWeight: "600" }],
        "body-lg": ["1.0625rem", { lineHeight: "1.6" }],
        "body-md": ["0.9375rem", { lineHeight: "1.6" }],
        "body-sm": ["0.8125rem", { lineHeight: "1.5" }],
        "label-md": ["0.875rem", { lineHeight: "1.4", fontWeight: "500" }],
        "label-sm": ["0.75rem", { lineHeight: "1.4", fontWeight: "500" }],
      },
      // ── Border Radius ─────────────────────────────────────────────────
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      // ── Box Shadow ────────────────────────────────────────────────────
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
        "card-hover": "0 4px 12px 0 rgb(0 0 0 / 0.10), 0 2px 4px -1px rgb(0 0 0 / 0.06)",
        modal: "0 20px 60px -10px rgb(0 0 0 / 0.25)",
        "input-focus": "0 0 0 3px rgb(4 98 100 / 0.15)",
      },
      // ── Animation ─────────────────────────────────────────────────────
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out",
        shimmer: "shimmer 1.5s infinite linear",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
