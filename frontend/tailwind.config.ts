import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontSize: {
        'senior': ['1.25rem', { lineHeight: '1.6' }],
        'senior-lg': ['1.5rem', { lineHeight: '1.5' }],
        'senior-xl': ['1.875rem', { lineHeight: '1.4' }],
        'senior-2xl': ['2.25rem', { lineHeight: '1.3' }],
      },
    },
  },
  plugins: [],
};

export default config;
