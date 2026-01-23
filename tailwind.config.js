/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './js/**/*.js'],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb', // El "azul bueno" de tus botones (blue-600)
        'primary-dark': '#021963', // El azul oscuro que elegiste para el sidebar y títulos
        'text-light': '#f4f4f4', // El color de texto para fondos oscuros
        'negro-astrolab': '#262626',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
