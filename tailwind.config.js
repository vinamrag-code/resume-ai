/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#effaf6', 100: '#d7f3e8', 200: '#b1e6d4', 300: '#7fd2b9', 400: '#4bb89c',
          500: '#2a9d83', 600: '#1e7e69', 700: '#1a6556', 800: '#175046', 900: '#14423a',
        },
        ink: { 50: '#f6f7f9', 100: '#eceef2', 200: '#d5d9e0', 300: '#b0b7c3', 400: '#8791a1', 500: '#667085', 600: '#4d5667', 700: '#3b4352', 800: '#262c38', 900: '#171b24', 950: '#0f1219' },
        spark: { 400: '#f6b24a', 500: '#ee9a1f', 600: '#cf7d0f' },
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(14px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'modal-in': { '0%': { opacity: '0', transform: 'translateY(12px) scale(0.96)' }, '100%': { opacity: '1', transform: 'translateY(0) scale(1)' } },
        'backdrop-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        float: { '0%, 100%': { transform: 'translateY(0) rotate(-2deg)' }, '50%': { transform: 'translateY(-10px) rotate(-1deg)' } },
      },
      animation: {
        'fade-up': 'fade-up 0.6s ease-out both',
        'modal-in': 'modal-in 0.28s cubic-bezier(0.16, 1, 0.3, 1) both',
        'backdrop-in': 'backdrop-in 0.2s ease-out both',
        float: 'float 6s ease-in-out infinite',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
