/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Colores corporativos oficiales basados en IP Adjusting Group (Celeste / Ocean Blue oficial)
        maroon: {
          50: '#f0f9fb',
          100: '#e7f3f7',
          200: '#c5e5ee',
          300: '#92d1e0',
          400: '#419fbb',
          500: '#1da8cf',
          600: '#1498be',
          700: '#0f7b9b',
          800: '#1187aa', // Color celeste principal de la marca (reemplaza el vino en toda la app)
          900: '#0c6079', // Versión hover oscura
          950: '#074253',
        },
        celeste: {
          50: '#f0f9fb',
          100: '#e7f3f7',
          200: '#c5e5ee',
          300: '#92d1e0',
          400: '#419fbb',
          500: '#1187aa',
          600: '#0f7b9b',
          700: '#0c6079',
          800: '#094a5e',
          900: '#05313b',
        },
        tealBrand: {
          50: '#effcfd',
          100: '#c7f4f8',
          200: '#95e9f1',
          300: '#55d7e6',
          400: '#1fc0d4',
          500: '#0E849E',
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
