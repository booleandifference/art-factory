const variants = {
  primary: {
    backgroundColor: 'var(--color-primary)',
    color: '#fff',
  },
  secondary: {
    backgroundColor: 'var(--color-surface-hover)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
  },
  danger: {
    backgroundColor: 'var(--color-reject)',
    color: '#1e1e2e',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: 'var(--color-text-muted)',
  },
}

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  type = 'button',
  className = '',
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg font-medium transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${sizes[size]} ${className}`}
      style={variants[variant]}
    >
      {children}
    </button>
  )
}
