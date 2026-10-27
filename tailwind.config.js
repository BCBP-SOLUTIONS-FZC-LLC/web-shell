/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist Sans"', 'Geist', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          pink: '#d92672',
          'pink-bright': '#d92672',
          navy: '#090a0f',
        },
        aura: {
          canvas: 'var(--aura-canvas)',
          surface: 'var(--aura-surface)',
          'surface-elevated': 'var(--aura-surface-elevated)',
          border: 'var(--aura-border)',
          text: 'var(--aura-text)',
          muted: 'var(--aura-text-muted)',
          primary: 'var(--aura-primary)',
          'primary-soft': 'var(--aura-primary-soft)',
          secondary: 'var(--aura-secondary)',
          'secondary-soft': 'var(--aura-secondary-soft)',
          tertiary: 'var(--aura-tertiary)',
          'tertiary-soft': 'var(--aura-tertiary-soft)',
          'accent-coral': 'var(--aura-accent-coral)',
          'accent-coral-soft': 'var(--aura-accent-coral-soft)',
          'accent-amber': 'var(--aura-accent-amber)',
          'accent-amber-soft': 'var(--aura-accent-amber-soft)',
          hover: 'var(--aura-hover)',
          input: 'var(--aura-input)',
        },
      },
      boxShadow: {
        'login-card': '0 16px 48px rgba(0, 0, 0, 0.2), 0 4px 14px rgba(0, 0, 0, 0.08)',
        'login-btn': '0 4px 16px rgba(217, 38, 114, 0.38)',
        dash: '0 1px 3px var(--aura-shadow)',
      },
    },
  },
  plugins: [],
}
