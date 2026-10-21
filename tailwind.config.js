/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa',
          500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a',
        },
        ink: { 50: '#f5f8fd', 100: '#eaf0f9', 200: '#d4dcec', 300: '#aab6cf', 400: '#7f8ca8', 500: '#5f6c88', 600: '#46526d', 700: '#25314f', 800: '#141d36', 900: '#0b1122', 950: '#050813' },
        spark: { 400: '#f6b24a', 500: '#ee9a1f', 600: '#cf7d0f' },
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(14px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'modal-in': { '0%': { opacity: '0', transform: 'translateY(12px) scale(0.96)' }, '100%': { opacity: '1', transform: 'translateY(0) scale(1)' } },
        'backdrop-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        glow: { '0%, 100%': { opacity: '0.55' }, '50%': { opacity: '0.9' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        float: { '0%, 100%': { transform: 'translateY(0) rotate(-2deg)' }, '50%': { transform: 'translateY(-10px) rotate(-1deg)' } },
      },
      animation: {
        'fade-up': 'fade-up 0.6s ease-out both',
        'modal-in': 'modal-in 0.28s cubic-bezier(0.16, 1, 0.3, 1) both',
        'backdrop-in': 'backdrop-in 0.2s ease-out both',
        glow: 'glow 6s ease-in-out infinite',
        marquee: 'marquee 40s linear infinite',
        float: 'float 6s ease-in-out infinite',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
