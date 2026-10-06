import Badge from '../common/Badge'

const tierColors = { 1: '#a6e3a1', 2: '#f9e2af', 3: '#6c7086' }

export default function ConceptPicker({ label, concepts, selected, onSelect, multiple = false }) {
  const handleClick = (concept) => {
    if (multiple) {
      // Toggle in/out of array
      const ids = selected.map((s) => s.id)
      if (ids.includes(concept.id)) {
        onSelect(selected.filter((s) => s.id !== concept.id))
      } else {
        onSelect([...selected, concept])
      }
    } else {
      onSelect(selected?.id === concept.id ? null : concept)
    }
  }

  const isSelected = (concept) => {
    if (multiple) return selected.some((s) => s.id === concept.id)
    return selected?.id === concept.id
  }

  // Group by category if props
  const grouped = concepts.reduce((acc, c) => {
    const key = c.category || 'general'
    if (!acc[key]) acc[key] = []
    acc[key].push(c)
    return acc
  }, {})
  const hasCategories = Object.keys(grouped).length > 1

  const renderConcept = (concept) => (
    <button
      key={concept.id}
      onClick={() => handleClick(concept)}
      className="px-3 py-2 rounded-lg text-sm text-left transition-all cursor-pointer border"
      style={{
        backgroundColor: isSelected(concept) ? 'var(--color-primary)' : 'var(--color-surface)',
        color: isSelected(concept) ? '#fff' : 'var(--color-text)',
        borderColor: isSelected(concept) ? 'var(--color-primary)' : 'var(--color-border)',
      }}
    >
      <div className="font-medium">{concept.name}</div>
      <div className="text-xs mt-0.5 opacity-70 truncate">{concept.value}</div>
    </button>
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{label}</label>
        {multiple && (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            ({selected.length} selected)
          </span>
        )}
      </div>

      {hasCategories ? (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <p className="text-xs mb-1 capitalize" style={{ color: 'var(--color-text-muted)' }}>{category.replace('_', ' ')}</p>
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {items.map(renderConcept)}
            </div>
          </div>
        ))
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {concepts.map(renderConcept)}
        </div>
      )}
    </div>
  )
}
