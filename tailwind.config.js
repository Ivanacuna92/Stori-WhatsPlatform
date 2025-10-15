/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/web/react/index.html",
    "./src/web/react/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'navetec': {
          'primary': '#00CC7B',
          'primary-dark': '#009958',
          'primary-medium': '#00CC7B',
          'primary-light': '#33D98F',
          'secondary-1': '#00B36D',
          'secondary-2': '#00E689',
          'secondary-3': '#66E5A8',
          'secondary-4': '#99EFC1',
        }
      },
      fontFamily: {
        'merriweather': ['Merriweather Sans', 'sans-serif'],
        'futura': ['Futura PT', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}