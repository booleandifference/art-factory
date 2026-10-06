import Badge from '../common/Badge'

const tierColors = {
  1: '#a6e3a1',
  2: '#f9e2af',
  3: '#6c7086',
}

export default function ConceptTable({ concepts, onEdit, onDelete }) {
  if (concepts.length === 0) {
    return (
      <p className="text-sm p-6" style={{ color: 'var(--color-text-muted)' }}>
        No concepts found. Add some to get started.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
            {['Name', 'Prompt Fragment', 'Type', 'Tier', 'Category', 'Tags', ''].map((h) => (
              <th key={h} className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {concepts.map((c) => (
            <tr
              key={c.id}
              className="transition-colors cursor-pointer"
              style={{ borderBottom: '1px solid var(--color-border)' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              onClick={() => onEdit(c)}
            >
              <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--color-text)' }}>{c.name}</td>
              <td className="px-4 py-2.5 max-w-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{c.value}</td>
              <td className="px-4 py-2.5"><Badge>{c.type}</Badge></td>
              <td className="px-4 py-2.5"><Badge color={tierColors[c.tier]}>T{c.tier}</Badge></td>
              <td className="px-4 py-2.5" style={{ color: 'var(--color-text-muted)' }}>{c.category || '—'}</td>
              <td className="px-4 py-2.5">
                <div className="flex gap-1 flex-wrap">
                  {(c.tags || []).slice(0, 3).map((tag) => (
                    <Badge key={tag} color="var(--color-primary)">{tag}</Badge>
                  ))}
                  {(c.tags || []).length > 3 && (
                    <Badge>+{c.tags.length - 3}</Badge>
                  )}
                </div>
              </td>
              <td className="px-4 py-2.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(c.id)
                  }}
                  className="text-xs cursor-pointer hover:underline"
                  style={{ color: 'var(--color-reject)' }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
