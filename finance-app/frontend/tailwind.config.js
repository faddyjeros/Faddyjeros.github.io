/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f4ff",
          500: "#4361ee",
          600: "#3451d1",
          700: "#2740b3",
        },
      },
    },
  },
  plugins: [],
};
