import type { Config } from 'tailwindcss'

export default {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // New design system (Claude Design)
        'primary': '#880069',
        'primary-container': '#ff71ce',
        'on-primary': '#ffffff',
        'on-primary-container': '#3b002c',
        'primary-fixed': '#ffd8eb',
        'primary-fixed-dim': '#ffaedd',
        'secondary': '#636109',
        'secondary-container': '#e7e482',
        'on-secondary-container': '#67650f',
        'tertiary': '#005231',
        'tertiary-container': '#00bd76',
        'on-tertiary-container': '#93ecb5',
        'tertiary-fixed': '#9cf5be',
        'surface': '#f9f9f7',
        'surface-container': '#eeeeec',
        'surface-container-low': '#f4f4f2',
        'surface-container-high': '#e8e8e6',
        'surface-container-lowest': '#ffffff',
        'on-surface': '#1a1c1b',
        'on-surface-variant': '#54414b',
        'outline': '#87717c',
        'outline-variant': '#dabfcc',
      },
      fontFamily: {
        'display': ['Quicksand', 'sans-serif'],
        'body': ['Plus Jakarta Sans', 'sans-serif'],
      },
      boxShadow: {
        'neo': '4px 4px 0px 0px #1a1c1b',
        'neo-lg': '8px 8px 0px 0px #1a1c1b',
      },
    },
  },
  plugins: [],
} satisfies Config
