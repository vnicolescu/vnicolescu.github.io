/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary': '#262626',        // Dark Matter Black
        'background': '#F9FAFB',     // Stellar Canvas
        'text-base': '#E5E7EB',      // Nebula Gray (Note: Tailwind uses 'text' prefix, but we define the base color)
        'accent-1': '#6366F1',        // Indigo Flame
        'accent-2': '#F59E0B',        // Solar Amber
        'hover-glow': 'rgba(99,102,241,0.15)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],        // Body text
        heading: ['Poppins', 'sans-serif'],    // Headings
        serif: ['"EB Garamond"', 'serif'], // Updated to EB Garamond
      },
      boxShadow: {
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', // Example card shadow
      },
      borderRadius: {
        'component': '0.5rem', // Example component radius
      },
      transitionProperty: {
        'height': 'height',
        'spacing': 'margin, padding',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.6s ease-out forwards',
      },
      transitionDelay: {
        '0': '0ms',
        '100': '100ms',
        '200': '200ms',
        '300': '300ms',
        '400': '400ms',
        '500': '500ms',
      },
      animationDelay: {
        '300': '300ms',
      },
    },
  },
  plugins: [],
}
