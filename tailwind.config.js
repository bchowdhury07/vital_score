/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        vital: {
          900: "#54030d",
          800: "#8b0018",
          700: "#a30820",
          600: "#c81e32",
          500: "#e52e4d",
          400: "#ff5166",
          100: "#ffe4e8",
          50: "#fff1f3",
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
