/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './js/**/*.js'],
  theme: {
    extend: {
      colors: {
        primary: '#0F766E',
        'primary-dark': '#115E59',
        'text-light': '#FFFDF8',
        'negro-astrolab': '#1F2937',
        brand: {
          50: '#DDF7F2',
          100: '#C4EFE7',
          500: '#0F766E',
          600: '#115E59',
          900: '#12312F',
        },
        slateui: {
          bg: '#F4EFE7',
          surface: '#FFFDF8',
          soft: '#E8F1EC',
          border: '#D5CCC0',
          text: '#1F2937',
          muted: '#52606D',
        },
        accent: {
          gold: '#C98B2E',
          success: '#2F855A',
          warning: '#C27A1A',
          danger: '#C2414B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        sofia: ['Sofia Sans', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
        mozilla: ['Mozilla Text', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
