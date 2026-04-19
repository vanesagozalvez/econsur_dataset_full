/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          950: '#0a0a0f',
          900: '#111118',
          800: '#1a1a24',
          700: '#24243a',
          600: '#32324e',
          500: '#44446a',
        },
        gold: {
          400: '#f0c060',
          500: '#e8a820',
          600: '#c88c10',
        },
        teal: {
          400: '#38d9c0',
          500: '#20c4ab',
        },
        coral: {
          400: '#ff7c7c',
          500: '#ff5454',
        }
      },
    },
  },
  plugins: [],
}
