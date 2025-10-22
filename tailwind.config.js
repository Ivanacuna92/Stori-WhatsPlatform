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
          'primary': '#f7c06f',
          'primary-dark': '#e5a84d',
          'primary-medium': '#f7c06f',
          'primary-light': '#f9d091',
          'text': '#2f5168',
          'text-dark': '#1f3544',
          'text-medium': '#2f5168',
          'text-light': '#4a6b82',
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