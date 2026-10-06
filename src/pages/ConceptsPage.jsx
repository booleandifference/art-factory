import { useState, useMemo } from 'react'
import PageHeader from '../components/common/PageHeader'
import Button from '../components/common/Button'
import ConceptForm from '../components/ConceptLibrary/ConceptForm'
import ConceptTable from '../components/ConceptLibrary/ConceptTable'
import { useCollection, useFirestoreCrud } from '../hooks/useFirestore'
import { seedDatabase, seedMissingConcepts, backfillImageCategories } from '../lib/seedData'

const TYPES = ['all', 'camera', 'theme', 'prop', 'text', 'bodyType', 'chaosLevel', 'style', 'cameraMockup', 'mockupRoom', 'mockupFrame', 'mockupSize', 'mockupLighting', 'etsyTags']

export default function ConceptsPage() {
  const { documents: concepts, loading } = useCollection('concepts', [], 'createdAt')
  const { add, update, remove } = useFirestoreCrud('concepts')
  const [filterType, setFilterType] = useState('all')
  const [editing, setEditing] = useState(null) // null = closed, {} = new, {id,...} = editing
  const [search, setSearch] = useState('')
  const [seeding, setSeeding] = useState(false)

  const handleSeed = async () => {
    if (!window.confirm('Seed the database with all concepts and killer combo prompts?')) return
    setSeeding(true)
    try {
      const result = await seedDatabase()
      alert(`Seeded ${result.concepts} concepts and ${result.prompts} killer combo prompts!`)
    } catch (err) {
      alert(`Seed error: ${err.message}`)
    } finally {
      setSeeding(false)
    }
  }

  const handleSeedMissing = async () => {
    setSeeding(true)
    try {
      const result = await seedMissingConcepts()
      alert(`Added ${result.added} new concepts (${result.skipped} already existed)`)
    } catch (err) {
      alert(`Error: ${err.message}`)
    } finally {
      setSeeding(false)
    }
  }

  const filtered = useMemo(() => {
    let result = concepts
    if (filterType !== 'all') {
      result = result.filter((c) => c.type === filterType)
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.value?.toLowerCase().includes(q) ||
          c.tags?.some((t) => t.toLowerCase().includes(q))
      )
    }
    return result
  }, [concepts, filterType, search])

  const handleSave = async (data) => {
    if (editing?.id) {
      await update(editing.id, data)
    } else {
      await add(data)
    }
    setEditing(null)
  }

  const handleDelete = async (id) => {
    if (window.confirm('Delete this concept?')) {
      await remove(id)
    }
  }

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(concepts, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'concepts-backup.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      const text = await file.text()
      const data = JSON.parse(text)
      for (const item of data) {
        const { id, createdAt, updatedAt, ...rest } = item
        await add(rest)
      }
    }
    input.click()
  }

  // Count by type
  const counts = useMemo(() => {
    const map = { all: concepts.length }
    for (const c of concepts) {
      map[c.type] = (map[c.type] || 0) + 1
    }
    return map
  }, [concepts])

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Concept Library"
        description={`${concepts.length} building blocks`}
        actions={
          <>
            {concepts.length === 0 && (
              <Button variant="secondary" size="sm" onClick={handleSeed} disabled={seeding}>
                {seeding ? 'Seeding...' : 'Seed Database'}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={handleSeedMissing} disabled={seeding}>
              {seeding ? 'Adding...' : '+ Add Missing Concepts'}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExport}>Export JSON</Button>
            <Button variant="ghost" size="sm" onClick={handleImport}>Import JSON</Button>
            <Button variant="ghost" size="sm" onClick={async () => {
              try {
                const result = await backfillImageCategories()
                alert(`Updated ${result.updated} of ${result.total} images with category field`)
              } catch (err) {
                alert(`Error: ${err.message}`)
              }
            }}>Fix Categories</Button>
            <Button size="sm" onClick={() => setEditing({})}>+ Add Concept</Button>
          </>
        }
      />

      {/* Filters */}
      <div className="px-6 py-3 flex items-center gap-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex gap-1">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className="px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer"
              style={{
                backgroundColor: filterType === t ? 'var(--color-primary)' : 'transparent',
                color: filterType === t ? '#fff' : 'var(--color-text-muted)',
              }}
            >
              {t === 'all' ? 'All' : t} ({counts[t] || 0})
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search concepts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto px-3 py-1.5 rounded-lg text-sm w-56"
          style={{
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
          }}
        />
      </div>

      {/* Form */}
      {editing !== null && (
        <div className="px-6 py-3">
          <ConceptForm
            concept={editing}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading concepts...</p>
        ) : (
          <ConceptTable concepts={filtered} onEdit={setEditing} onDelete={handleDelete} />
        )}
      </div>
    </div>
  )
}
