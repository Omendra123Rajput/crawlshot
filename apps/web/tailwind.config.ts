import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
      },
      colors: {
        'bg-base': 'var(--bg-base)',
        'bg-surface': 'var(--bg-surface)',
        'bg-elevated': 'var(--bg-elevated)',
        'accent-primary': 'var(--accent-primary)',
        'accent-muted': 'var(--accent-muted)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        'text-muted': 'var(--text-muted)',
        'text-faint': 'var(--text-faint)',
        success: 'var(--success)',
        error: 'var(--error)',
        warning: 'var(--warning)',
      },
      animation: {
        'fade-up': 'fade-up 0.5s var(--ease-out-expo) forwards',
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
        shimmer: 'shimmer 2s ease-in-out infinite',
        'skeleton-pulse': 'skeleton-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
