/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Archivo', 'system-ui', 'sans-serif'],
        sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Deep chakra-blue ink scale for the dark UI
        ink: { 950: '#060a1a', 900: '#0a1128', 800: '#101a3a', 700: '#18244d' },
        saffron: { DEFAULT: '#ff9933', soft: '#ffb866' },
        india: '#138808',
        pass: '#34d399',
        fail: '#fb4a6a',
        chakra: '#6f86ff',
      },
    },
  },
  plugins: [],
};
