/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/web/react/index.html",
    "./src/web/react/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary': {
          DEFAULT: '#f7c06f',
          'dark': '#e5a84d',
          'medium': '#f7c06f',
          'light': '#f9d091',
        }
      },
      fontFamily: {
        'sans': ['Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}