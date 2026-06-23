/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],

  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          violet: '#7c3aed',
          purple: '#a78bfa',
          cyan: '#22d3ee',
        },
      },
    },
  },

  plugins: [
    require("@tailwindcss/typography"),
  ],
}