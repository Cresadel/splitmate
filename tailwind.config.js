export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary)',
        'primary-hover': 'var(--primary-hover)',
        'primary-soft': 'var(--primary-soft)',
        'primary-alt': 'var(--primary-alt)',
        bg: 'var(--bg)',
        card: 'var(--card)',
        header: 'var(--header)',
        ink: 'var(--text)',
        muted: 'var(--muted)',
        line: 'var(--border)',
        bad: '#DC2626',
      },
      boxShadow: { card: 'var(--shadow-card)' },
    },
  },
}
