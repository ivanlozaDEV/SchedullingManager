/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Colores corporativos basados en el logo IP Adjusters (Sólidos, sin degradados)
        maroon: {
          50: '#fdf2f4',
          100: '#fae4e8',
          200: '#f6cad2',
          300: '#ef9faf',
          400: '#e56c85',
          500: '#d13f61',
          600: '#b12447',
          700: '#8c1935',
          800: '#5B1024', // Color base principal de la marca (Vino/Granate)
          900: '#460C1B', // Versión oscura
          950: '#2A050F',
        },
        tealBrand: {
          50: '#effcfd',
          100: '#c7f4f8',
          200: '#95e9f1',
          300: '#55d7e6',
          400: '#1fc0d4',
          500: '#0E849E', // Color teal/cian del techo y tornado en el logo
          600: '#0B6D82',
          700: '#095768',
          800: '#07424F',
          900: '#05313B',
        }
      }
    },
  },
  plugins: [],
};
