/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./js/**/*.js"],
  theme: {
    extend: {
      colors: {
        primary: "#0A56C6",
        "primary-dark": "#011963",
        "text-light": "#f4f4f4",
        "negro-astrolab": "#262626",
        astrolab: {
          indigo: "#011963",
          atlantico: "#0744A8",
          cobalto: "#0A56C6",
          cielo: "#B9D6FE",
          "cielo-claro": "#D5EAFD",
          selva: "#03894C",
          menta: "#04A45A",
          esmeralda: "#00492C",
          terracota: "#E05D2E",
          coral: "#F66D3A",
          oxido: "#881F00",
          rojo: "#E22028",
          neblina: "#F3B1D7",
          pastel: "#FDF48B",
          hueso: "#F0F2DA",
          blanco: "#FFFFFF",
          negro: "#262626",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        sofia: ["Sofia Sans", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
        mozilla: ["Mozilla Text", "sans-serif"],
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
