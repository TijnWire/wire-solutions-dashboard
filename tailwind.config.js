/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      colors: {
        // TOEGANKELIJKHEID: brand-600/700 zijn iets donkerder dan het standaard Tailwind-oranje, zodat
        // witte tekst op een oranje knop (en oranje tekst op wit) de 4,5:1-contrastnorm haalt. Dat is
        // het verschil tussen "goed leesbaar" en "moet ik turen" — vooral buiten in fel zonlicht.
        brand: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#cf4509",
          700: "#b13b0a",
          800: "#9a3412",
          900: "#7c2d12",
        },
        // Zelfde reden voor de gewone Tailwind-kleuren waar de app witte tekst op zet of gekleurde
        // tekst op wit: de standaardtinten halen daar het minimale contrast niet.
        orange: { 600: "#cf4509", 700: "#b13b0a" },
        green: { 600: "#15803d", 700: "#166534" },
        red: { 500: "#dc2626" },
        emerald: { 600: "#047857", 700: "#065f46" },
        amber: { 600: "#b45309" },
        sky: { 600: "#0369a1" },
        // ink-400/500 (grijze hulptekst) lagen op 2,6:1 en 4,3:1 — te flets voor wie niet scherp ziet.
        // Nu 5:1 of hoger. ink-300 blijft licht: dat is bedoeld voor randjes en decoratieve iconen.
        ink: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#5b6b80",
          500: "#526176",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
          950: "#020617",
        },
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(15 23 42 / 0.04), 0 1px 2px -1px rgb(15 23 42 / 0.06)",
        cardhover:
          "0 10px 30px -12px rgb(15 23 42 / 0.18), 0 2px 6px -2px rgb(15 23 42 / 0.08)",
      },
      keyframes: {
        slideInRight: {
          "0%": { transform: "translateX(6%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        slideInLeft: {
          "0%": { transform: "translateX(-6%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
      },
      // LET OP: fill-mode is bewust "backwards" en niet "both". Met "both" blijft na afloop
      // transform: translateX(0) op het element staan, en een element mét transform wordt een
      // containing block — dan gedraagt position:fixed (modals!) zich als absolute t.o.v. de
      // pagina i.p.v. het scherm. Met "backwards" is de transform na de animatie weer weg.
      animation: {
        "slide-in-right": "slideInRight 0.28s ease-out backwards",
        "slide-in-left": "slideInLeft 0.28s ease-out backwards",
      },
    },
  },
  plugins: [],
};
