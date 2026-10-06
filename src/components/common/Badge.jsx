export default function Badge({ children, color = 'var(--color-text-muted)' }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {children}
    </span>
  )
}
