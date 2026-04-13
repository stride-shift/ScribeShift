/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Map Tailwind color utilities onto the CSS variables defined in src/styles/app.css.
        // This keeps Tailwind-built views in sync with the existing light/dark theme.
        bg: {
          DEFAULT: 'var(--bg-body)',
          body: 'var(--bg-body)',
          card: 'var(--bg-card)',
          'card-hover': 'var(--bg-card-hover)',
          input: 'var(--bg-input)',
          raised: 'var(--bg-raised)',
          sidebar: 'var(--bg-sidebar)',
          main: 'var(--bg-main)',
          navbar: 'var(--bg-navbar)',
        },
        border: {
          DEFAULT: 'var(--border)',
          hover: 'var(--border-hover)',
          active: 'var(--border-active)',
        },
        text: {
          DEFAULT: 'var(--text)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          'on-primary': 'var(--text-on-primary)',
        },
        brand: {
          DEFAULT: 'var(--primary)',
          dark: 'var(--primary-dark)',
          light: 'var(--primary-light)',
        },
        success: {
          DEFAULT: 'var(--success)',
          bg: 'var(--success-bg)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          bg: 'var(--warning-bg)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          bg: 'var(--danger-bg)',
        },
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        DEFAULT: 'var(--radius)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        lg: 'var(--shadow-lg)',
        glow: 'var(--shadow-glow)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
};
