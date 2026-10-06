import { useState, useEffect } from 'react'
import Button from '../common/Button'

const CONCEPT_TYPES = ['camera', 'theme', 'prop', 'text', 'bodyType', 'chaosLevel', 'style', 'cameraMockup', 'mockupRoom', 'mockupFrame', 'mockupSize', 'mockupLighting', 'etsyTags']
const TIERS = [1, 2, 3]

const EMPTY_CONCEPT = {
  type: 'theme',
  name: '',
  value: '',
  tier: 1,
  tags: '',
  category: '',
  notes: '',
}

export default function ConceptForm({ concept, onSave, onCancel }) {
  const [form, setForm] = useState(EMPTY_CONCEPT)

  useEffect(() => {
    if (concept?.id) {
      setForm({
        ...EMPTY_CONCEPT,
        ...concept,
        tags: Array.isArray(concept.tags) ? concept.tags.join(', ') : concept.tags || '',
      })
    } else {
      setForm(EMPTY_CONCEPT)
    }
  }, [concept])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...form,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      tier: Number(form.tier),
    })
  }

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const inputStyle = {
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 rounded-lg" style={{ backgroundColor: 'var(--color-surface)' }}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Type</label>
          <select value={form.type} onChange={set('type')} className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle}>
            {CONCEPT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Tier</label>
          <select value={form.tier} onChange={set('tier')} className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle}>
            {TIERS.map((t) => (
              <option key={t} value={t}>Tier {t}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Name</label>
        <input value={form.name} onChange={set('name')} required placeholder="e.g., Cyberpunk" className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} />
      </div>

      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Prompt fragment</label>
        <textarea value={form.value} onChange={set('value')} required rows={5} placeholder="e.g., cyberpunk illustration" className="w-full px-3 py-2 rounded-lg text-sm resize-y" style={{ ...inputStyle, minHeight: '100px' }} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Category</label>
          <input value={form.category} onChange={set('category')} placeholder="e.g., food_drink" className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Tags (comma-separated)</label>
          <input value={form.tags} onChange={set('tags')} placeholder="dark, neon, sci-fi" className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} />
        </div>
      </div>

      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Notes</label>
        <input value={form.notes} onChange={set('notes')} placeholder="Internal notes..." className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="submit">{concept?.id ? 'Update' : 'Add Concept'}</Button>
      </div>
    </form>
  )
}
