/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        graphite: {
          DEFAULT: '#161B22',
          surface: '#1D2430',
          border: '#2A3341',
        },
        signal: {
          green: '#00C853',
          glow: '#69F0AE',
          mint: '#E8FDF0',
        },
      }
    },
  },
  plugins: [],
}
