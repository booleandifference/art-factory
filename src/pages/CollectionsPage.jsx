import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/common/PageHeader'
import Button from '../components/common/Button'
import { useCollection as useFirestoreCollection, useDocument, useFirestoreCrud } from '../hooks/useFirestore'
import { useCollections } from '../hooks/useCollections'

export default function CollectionsPage() {
  const { documents: images, loading: imagesLoading, error: imagesError } = useFirestoreCollection('images', [], 'createdAt')
  const { collections: COLLECTIONS, loading: collectionsLoading, error: collectionsError, addCollection, updateCollection, removeCollection } = useCollections()
  const [selectedCollection, setSelectedCollection] = useState(null)
  const [showGelatoSetup, setShowGelatoSetup] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTagline, setNewTagline] = useState('')
  const [newMood, setNewMood] = useState('')
  const [editingCollection, setEditingCollection] = useState(null)
  const [gelatoStoreId, setGelatoStoreId] = useState('')
  const [gelatoTemplateId, setGelatoTemplateId] = useState('')
  const [syncing, setSyncing] = useState(false)
  const navigate = useNavigate()
  const loading = imagesLoading || collectionsLoading

  const { document: gelatoConfig } = useDocument('config', 'gelato')
  const gelatoSyncCrud = useFirestoreCrud('gelatoSync')

  // Group images by collection
  const collectionData = useMemo(() => {
    const artImages = images.filter((img) => !img.category || img.category !== 'mockup')
    return COLLECTIONS.map((col) => {
      const colImages = artImages.filter((img) => img.collection === col.slug)
      return { ...col, images: colImages, count: colImages.length }
    })
  }, [images, COLLECTIONS])

  const uncollected = useMemo(() => {
    return images.filter((img) => (!img.category || img.category !== 'mockup') && !img.collection)
  }, [images])

  const handleAddCollection = async () => {
    if (!newName.trim()) return
    await addCollection({ name: newName.trim(), tagline: newTagline.trim(), mood: newMood.trim() })
    setNewName('')
    setNewTagline('')
    setNewMood('')
    setShowNewForm(false)
  }

  const handleDeleteCollection = async (slug, e) => {
    e.stopPropagation()
    if (!window.confirm(`Delete collection "${slug}"? Images won't be deleted, just unlinked.`)) return
    await removeCollection(slug)
  }

  const handleStartEdit = (col, e) => {
    e.stopPropagation()
    setEditingCollection({ slug: col.slug, name: col.name, tagline: col.tagline || '', mood: col.mood || '' })
  }

  const handleSaveEdit = async () => {
    if (!editingCollection || !editingCollection.name.trim()) return
    await updateCollection(editingCollection.slug, {
      name: editingCollection.name.trim(),
      tagline: editingCollection.tagline.trim(),
      mood: editingCollection.mood.trim(),
    })
    setEditingCollection(null)
  }

  const handleCancelEdit = (e) => {
    if (e) e.stopPropagation()
    setEditingCollection(null)
  }

  const selected = selectedCollection
    ? collectionData.find((c) => c.slug === selectedCollection)
    : null


  const dataError = imagesError || collectionsError

  if (dataError) {
    return (
      <div className="p-6 space-y-2">
        <p className="text-sm font-medium" style={{ color: '#ef4444' }}>Failed to load collections</p>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{dataError.message || String(dataError)}</p>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Check the browser console for details.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading collections...</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Collections"
        description={`${COLLECTIONS.length} collections · ${uncollected.length} uncollected`}
        actions={
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowNewForm(!showNewForm)}
            >
              {showNewForm ? 'Cancel' : '+ New Collection'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowGelatoSetup(!showGelatoSetup)}
            >
              {showGelatoSetup ? 'Hide Setup' : 'Gelato Setup'}
            </Button>
          </div>
        }
      />

      {/* Gelato Setup Panel */}
      {showGelatoSetup && (
        <div className="px-6 py-4 border-b space-y-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          <h3 className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>Gelato API Configuration</h3>
          {gelatoConfig ? (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <span style={{ color: 'var(--color-text-muted)' }}>Store ID: </span>
                  <span style={{ color: 'var(--color-text)' }}>{gelatoConfig.storeId}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)' }}>Template: </span>
                  <span style={{ color: 'var(--color-text)' }}>{gelatoConfig.templateTitle || gelatoConfig.templateId}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)' }}>Variants: </span>
                  <span style={{ color: 'var(--color-text)' }}>{gelatoConfig.variants?.length || 0}</span>
                </div>
              </div>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                Last synced: {gelatoConfig.lastSynced?.toDate?.()?.toLocaleString() || 'Unknown'}
              </p>
              <Button variant="ghost" size="sm" onClick={async () => {
                setSyncing(true)
                await gelatoSyncCrud.add({ storeId: gelatoConfig.storeId, templateId: gelatoConfig.templateId, status: 'queued' })
                setTimeout(() => setSyncing(false), 3000)
              }} disabled={syncing}>
                {syncing ? 'Syncing...' : 'Re-sync Template'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Connect your Gelato store to enable one-click publishing to Etsy.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--color-text-muted)' }}>Store ID</label>
                  <input
                    type="text"
                    value={gelatoStoreId}
                    onChange={(e) => setGelatoStoreId(e.target.value)}
                    placeholder="From Gelato dashboard"
                    className="w-full px-3 py-1.5 rounded-lg text-xs"
                    style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--color-text-muted)' }}>Template ID</label>
                  <input
                    type="text"
                    value={gelatoTemplateId}
                    onChange={(e) => setGelatoTemplateId(e.target.value)}
                    placeholder="Framed poster template ID"
                    className="w-full px-3 py-1.5 rounded-lg text-xs"
                    style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                  />
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                disabled={!gelatoStoreId.trim() || !gelatoTemplateId.trim() || syncing}
                onClick={async () => {
                  setSyncing(true)
                  await gelatoSyncCrud.add({
                    storeId: gelatoStoreId.trim(),
                    templateId: gelatoTemplateId.trim(),
                    status: 'queued',
                  })
                  setTimeout(() => setSyncing(false), 5000)
                }}
              >
                {syncing ? 'Syncing Template...' : 'Connect & Sync Template'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* New Collection Form */}
      {showNewForm && (
        <div className="px-6 py-4 border-b space-y-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          <h3 className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>New Collection</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--color-text-muted)' }}>Name *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Neon District"
                className="w-full px-3 py-1.5 rounded-lg text-xs"
                style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCollection()}
              />
            </div>
            <div>
              <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--color-text-muted)' }}>Tagline</label>
              <input
                type="text"
                value={newTagline}
                onChange={(e) => setNewTagline(e.target.value)}
                placeholder="e.g., Neon lights, dark streets"
                className="w-full px-3 py-1.5 rounded-lg text-xs"
                style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCollection()}
              />
            </div>
            <div>
              <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--color-text-muted)' }}>Mood / Visual Cues</label>
              <input
                type="text"
                value={newMood}
                onChange={(e) => setNewMood(e.target.value)}
                placeholder="e.g., Cyberpunk, rain, neon signs"
                className="w-full px-3 py-1.5 rounded-lg text-xs"
                style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCollection()}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleAddCollection} disabled={!newName.trim()}>
              Create Collection
            </Button>
            <span className="text-[10px] self-center" style={{ color: 'var(--color-text-muted)' }}>
              Slug will be auto-generated from name
            </span>
          </div>
        </div>
      )}

      {!selected ? (
        // Collection cards grid
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-3 gap-4">
            {collectionData.map((col) => (
              <div
                key={col.slug}
                onClick={() => col.count > 0 && setSelectedCollection(col.slug)}
                className="rounded-xl overflow-hidden cursor-pointer group transition-all"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  opacity: col.count === 0 ? 0.5 : 1,
                }}
              >
                {/* Preview grid — show up to 4 thumbnails */}
                <div className="aspect-video relative overflow-hidden" style={{ backgroundColor: 'var(--color-bg)' }}>
                  {col.images.length > 0 ? (
                    <div className="grid grid-cols-2 h-full">
                      {col.images.slice(0, 4).map((img, i) => (
                        <img
                          key={img.id}
                          src={img.url || img.thumbnailPath}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Empty</span>
                    </div>
                  )}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)' }}
                  />
                </div>
                {editingCollection?.slug === col.slug ? (
                  <div className="p-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editingCollection.name}
                      onChange={(e) => setEditingCollection({ ...editingCollection, name: e.target.value })}
                      className="w-full px-2 py-1 rounded text-xs"
                      style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                      placeholder="Name"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') handleCancelEdit(); }}
                    />
                    <input
                      type="text"
                      value={editingCollection.tagline}
                      onChange={(e) => setEditingCollection({ ...editingCollection, tagline: e.target.value })}
                      className="w-full px-2 py-1 rounded text-xs"
                      style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                      placeholder="Tagline"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') handleCancelEdit(); }}
                    />
                    <input
                      type="text"
                      value={editingCollection.mood}
                      onChange={(e) => setEditingCollection({ ...editingCollection, mood: e.target.value })}
                      className="w-full px-2 py-1 rounded text-xs"
                      style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                      placeholder="Mood / Visual Cues"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') handleCancelEdit(); }}
                    />
                    <div className="flex gap-1">
                      <button onClick={handleSaveEdit} className="text-[10px] px-2 py-0.5 rounded cursor-pointer" style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}>Save</button>
                      <button onClick={handleCancelEdit} className="text-[10px] px-2 py-0.5 rounded cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 flex justify-between items-start">
                    <div>
                      <h3 className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                        {col.name}
                      </h3>
                      {col.tagline && (
                        <p className="text-[10px] italic mt-0.5" style={{ color: 'var(--color-primary)' }}>
                          "{col.tagline}"
                        </p>
                      )}
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        {col.count} {col.count === 1 ? 'image' : 'images'}
                      </p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleStartEdit(col, e)}
                        className="text-[10px] px-1.5 py-0.5 rounded cursor-pointer"
                        style={{ color: 'var(--color-text-muted)', backgroundColor: 'var(--color-bg)' }}
                        title="Edit collection"
                      >
                        edit
                      </button>
                      {col.count === 0 && (
                        <button
                          onClick={(e) => handleDeleteCollection(col.slug, e)}
                          className="text-[10px] px-1.5 py-0.5 rounded cursor-pointer"
                          style={{ color: 'var(--color-text-muted)', backgroundColor: 'var(--color-bg)' }}
                          title="Delete empty collection"
                        >
                          x
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Uncollected card */}
            {uncollected.length > 0 && (
              <div
                onClick={() => navigate('/gallery')}
                className="rounded-xl overflow-hidden cursor-pointer group transition-all"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px dashed var(--color-border)',
                }}
              >
                <div className="aspect-video relative overflow-hidden" style={{ backgroundColor: 'var(--color-bg)' }}>
                  <div className="grid grid-cols-2 h-full">
                    {uncollected.slice(0, 4).map((img) => (
                      <img
                        key={img.id}
                        src={img.url || img.thumbnailPath}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ))}
                  </div>
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
                    Uncollected
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {uncollected.length} images — go to Gallery to assign
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        // Selected collection detail view
        <div className="flex-1 overflow-auto">
          <div className="px-6 py-3 flex items-center gap-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <button
              onClick={() => setSelectedCollection(null)}
              className="px-3 py-1 rounded-md text-xs font-medium cursor-pointer"
              style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
            >
              Back
            </button>
            <h3 className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {selected.name}
            </h3>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {selected.count} images
            </span>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-4 gap-3">
              {selected.images.map((img) => (
                <div
                  key={img.id}
                  className="relative rounded-lg overflow-hidden group cursor-pointer"
                  style={{ aspectRatio: '2/3' }}
                  onClick={() => navigate(`/gallery?collection=${selected.slug}&imageId=${img.id}`)}
                >
                  <img
                    src={img.url || img.thumbnailPath}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    style={{ backgroundColor: 'var(--color-surface)' }}
                  />
                  {img.videoUrl && (
                    <div className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
                      <span className="text-white text-[10px]">▶</span>
                    </div>
                  )}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2"
                    style={{ background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.8))' }}
                  >
                    <p className="text-[10px] text-white line-clamp-2">{img.promptText || '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
