import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { gf: { accent: '#673ab7', accentDark: '#5e35b1', bg: '#f1f3f4', border: '#dadce0', text: '#202124', muted: '#5f6368', error: '#d93025' } },
      fontFamily: { sans: ['Roboto', '"Segoe UI"', 'system-ui', '-apple-system', 'Arial', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
