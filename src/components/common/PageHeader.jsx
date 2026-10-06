export default function PageHeader({ title, description, actions }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{title}</h2>
        {description && (
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
