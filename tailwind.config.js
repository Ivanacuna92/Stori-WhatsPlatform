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
          DEFAULT: '#FD6144',
          'dark': '#FD3244',
          'medium': '#FD6144',
          'light': '#FF8A70',
        },
        'accent': {
          DEFAULT: '#AE3A8D',
          'dark': '#8B2E71',
          'light': '#C94FA5',
        }
      },
      fontFamily: {
        'sans': ['Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}