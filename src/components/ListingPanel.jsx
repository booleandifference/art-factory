import { useState, useEffect } from 'react'
import Button from './common/Button'
import { useDocument, useFirestoreCrud } from '../hooks/useFirestore'
import { useCollections } from '../hooks/useCollections'

export default function ListingPanel({ image, onClose, onUpdate }) {
  const { collections: COLLECTIONS } = useCollections()
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState(null)
  const [tagInput, setTagInput] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishingDigital, setPublishingDigital] = useState(false)
  const [mugTemplate, setMugTemplate] = useState(image.mugTemplate || 'floor')

  const listingJobsCrud = useFirestoreCrud('listingJobs')
  const publishJobsCrud = useFirestoreCrud('publishJobs')
  const digitalPublishCrud = useFirestoreCrud('digitalPublishJobs')
  const templateSyncCrud = useFirestoreCrud('gelatoTemplateSync')
  const imagesCrud = useFirestoreCrud('images')
  const { document: etsyConfig } = useDocument('config', 'etsy')
  const { document: gelatoConfig } = useDocument('config', 'gelato')
  const { document: gelatoTemplatesDoc } = useDocument('config', 'gelatoTemplates')
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [syncingTemplates, setSyncingTemplates] = useState(false)

  // Hardcoded templates — manually managed, rarely changes
  const GELATO_TEMPLATES = [
    {
      id: '66042703-bc08-422f-9940-850a973bf988',
      title: 'Original (All sizes, all frame colors)',
      variantCount: 20,
    },
    {
      id: '7c887511-86fa-4548-9fe9-d5a83b11b48d',
      title: 'A3 & A4 White Frame',
      variantCount: 2,
    },
    {
      id: '39a0defa-6b54-4f5a-99a8-e9a6eff1e6a9',
      title: 'A3 & A4 Black & White Frame',
      variantCount: 20,
    },
    {
      id: '909c3af5-6a40-4437-b04f-c3919d86a9a5',
      title: 'The Hero Within - White - A3/A4 with Passepartout',
      variantCount: 2,
    },
  ]

  // Merge: use Firestore templates if available, otherwise hardcoded
  const gelatoTemplates = (gelatoTemplatesDoc?.templates?.length > 0)
    ? gelatoTemplatesDoc.templates
    : GELATO_TEMPLATES

  // Default to current Gelato template if no selection yet
  useEffect(() => {
    if (!selectedTemplateId && gelatoConfig?.templateId) {
      setSelectedTemplateId(gelatoConfig.templateId)
    }
  }, [gelatoConfig?.templateId, selectedTemplateId])

  const handleSyncTemplates = async () => {
    setSyncingTemplates(true)
    try {
      await templateSyncCrud.add({ status: 'queued' })
      // Wait a bit for the function to complete
      setTimeout(() => setSyncingTemplates(false), 5000)
    } catch (err) {
      console.error('Template sync failed:', err)
      setSyncingTemplates(false)
    }
  }

  // Track active listing job
  const [listingJobId, setListingJobId] = useState(null)
  const { document: listingJob } = useDocument('listingJobs', listingJobId)

  const listing = image.listing || null
  const listingStatus = listing?.status || 'none'

  // When job completes, clear the job ID tracker
  useEffect(() => {
    if (listingJob?.status === 'completed' || listingJob?.status === 'failed') {
      // Small delay to let Firestore update propagate to image doc
      setTimeout(() => setListingJobId(null), listingJob?.status === 'failed' ? 10000 : 1000)
    }
  }, [listingJob?.status])

  // Generate listing data via Claude, tagged with store
  const handlePrepareListing = async (store) => {
    await imagesCrud.update(image.id, { store })
    const jobId = await listingJobsCrud.add({
      imageId: image.id,
      store,
      status: 'queued',
      error: null,
      completedAt: null,
    })
    setListingJobId(jobId)
  }

  // Start editing
  const handleEdit = () => {
    setEditData({
      title: listing.title || '',
      tags: [...(listing.tags || [])],
      description: listing.description || '',
      collection: listing.collection || '',
    })
    setEditing(true)
  }

  // Save edits
  const handleSave = async () => {
    const col = COLLECTIONS.find((c) => c.slug === editData.collection)
    await imagesCrud.update(image.id, {
      collection: editData.collection || null,
      collectionDisplayName: col ? col.name : null,
      'listing.title': editData.title,
      'listing.tags': editData.tags,
      'listing.description': editData.description,
      'listing.collection': editData.collection,
      'listing.collectionDisplayName': col ? col.name : null,
      'listing.editedAt': new Date(),
      'listing.status': 'ready',
    })
    setEditing(false)
    setEditData(null)
  }

  // Add tag
  const handleAddTag = () => {
    if (!tagInput.trim() || !editData) return
    if (editData.tags.length >= 13) return
    setEditData({ ...editData, tags: [...editData.tags, tagInput.trim()] })
    setTagInput('')
  }

  // Remove tag
  const handleRemoveTag = (index) => {
    if (!editData) return
    setEditData({ ...editData, tags: editData.tags.filter((_, i) => i !== index) })
  }

  // Publish to Gelato/Etsy
  const handlePublish = async () => {
    setPublishing(true)
    const isMug = image.store === 'shop-a-mug'
    try {
      await publishJobsCrud.add({
        imageId: image.id,
        store: image.store || 'hoodie-gamer',
        templateId: isMug ? null : (selectedTemplateId || gelatoConfig?.templateId || null),
        mugTemplate: isMug ? mugTemplate : null,
        status: 'queued',
        error: null,
        gelatoProductId: null,
        etsyListingId: null,
        completedAt: null,
      })
    } catch (err) {
      alert(`Publish failed: ${err.message}`)
    }
    setPublishing(false)
  }

  // Publish as digital download directly to Etsy
  const handlePublishDigital = async () => {
    setPublishingDigital(true)
    try {
      await digitalPublishCrud.add({
        imageId: image.id,
        status: 'queued',
        error: null,
        etsyListingId: null,
        etsyListingUrl: null,
        completedAt: null,
      })
    } catch (err) {
      alert(`Digital publish failed: ${err.message}`)
    }
    setPublishingDigital(false)
  }

  const etsyConnected = !!etsyConfig?.accessToken

  // Pre-publish checklist
  const checks = {
    printReady: !!image.urlPrint,
    title: !!(listing?.title && listing.title.length <= 140),
    tags: listing?.tags?.length === 13,
    description: !!listing?.description,
    collection: !!listing?.collection,
  }
  const allChecks = Object.values(checks).every(Boolean)

  const isAnalyzing = listingJob?.status === 'queued' || listingJob?.status === 'analyzing'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-[720px] max-h-[90vh] rounded-xl overflow-auto"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
            Prepare Listing
            {listingStatus !== 'none' && (
              <span
                className="ml-2 px-2 py-0.5 rounded text-[10px] uppercase font-bold"
                style={{
                  backgroundColor: listingStatus === 'published' ? 'rgba(166,227,161,0.2)' : listingStatus === 'ready' ? 'rgba(168,85,247,0.2)' : 'rgba(249,226,175,0.2)',
                  color: listingStatus === 'published' ? '#a6e3a1' : listingStatus === 'ready' ? '#a855f7' : '#f9e2af',
                }}
              >
                {listingStatus}
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="text-xs cursor-pointer px-2 py-1 rounded"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Close
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Source image preview */}
          <div className="flex gap-4">
            <img
              src={image.url}
              alt=""
              className="w-28 rounded-lg flex-shrink-0"
              style={{ aspectRatio: '2/3', objectFit: 'cover', backgroundColor: 'var(--color-bg)' }}
            />
            <div className="flex-1">
              {!listing && !isAnalyzing && (
                <div className="space-y-3">
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Choose which shop to generate a listing for.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="primary" size="sm" onClick={() => handlePrepareListing('hoodie-gamer')}>
                      Prepare — Hoodie Gamer
                    </Button>
                    <button
                      onClick={() => handlePrepareListing('shop-a-mug')}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                      style={{ backgroundColor: 'rgba(20,184,166,0.15)', color: '#14b8a6', border: '1px solid rgba(20,184,166,0.4)' }}
                    >
                      Prepare — Shop A Mug
                    </button>
                  </div>
                </div>
              )}
              {isAnalyzing && (
                <div className="text-center py-4">
                  <p className="text-sm animate-pulse" style={{ color: 'var(--color-primary)' }}>
                    Analyzing artwork...
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Claude is studying the image and writing your Etsy listing
                  </p>
                </div>
              )}
              {listingJob?.status === 'failed' && (
                <div className="space-y-2">
                  <p className="text-xs" style={{ color: '#f38ba8' }}>
                    Analysis failed: {listingJob.error}
                  </p>
                  <Button variant="secondary" size="sm" onClick={() => handlePrepareListing(image.store || 'hoodie-gamer')}>
                    Try Again
                  </Button>
                </div>
              )}
              {listing && !editing && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold" style={{ color: 'var(--color-primary)' }}>
                    {listing.collectionDisplayName || 'No collection'}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {listing.artStyle} · {listing.mood} · {listing.gamerType}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button variant="secondary" size="sm" onClick={handleEdit}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => handlePrepareListing(image.store || 'hoodie-gamer')}>Regenerate</Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Listing Preview / Edit */}
          {listing && !editing && (
            <div className="space-y-4">
              {/* Title */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Title</h4>
                  <span className="text-[10px]" style={{ color: listing.title.length > 140 ? '#f38ba8' : 'var(--color-text-muted)' }}>
                    {listing.title.length}/140
                  </span>
                </div>
                <p className="text-xs p-2 rounded-lg leading-relaxed" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
                  {listing.title}
                </p>
              </div>

              {/* Tags */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Tags</h4>
                  <span className="text-[10px]" style={{ color: listing.tags?.length === 13 ? 'var(--color-text-muted)' : '#f38ba8' }}>
                    {listing.tags?.length || 0}/13
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(listing.tags || []).map((tag, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded text-[10px]"
                      style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <h4 className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Description</h4>
                <pre className="text-xs p-3 rounded-lg leading-relaxed whitespace-pre-wrap font-sans" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', maxHeight: '200px', overflow: 'auto' }}>
                  {listing.description}
                </pre>
              </div>
            </div>
          )}

          {/* Edit Mode */}
          {editing && editData && (
            <div className="space-y-4">
              {/* Collection */}
              <div>
                <h4 className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Collection</h4>
                <select
                  value={editData.collection}
                  onChange={(e) => setEditData({ ...editData, collection: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-xs"
                  style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                >
                  <option value="">No collection</option>
                  {COLLECTIONS.map((c) => (
                    <option key={c.slug} value={c.slug}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Title</h4>
                  <span className="text-[10px]" style={{ color: editData.title.length > 140 ? '#f38ba8' : 'var(--color-text-muted)' }}>
                    {editData.title.length}/140
                  </span>
                </div>
                <input
                  type="text"
                  value={editData.title}
                  onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-xs"
                  style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                />
              </div>

              {/* Tags */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Tags</h4>
                  <span className="text-[10px]" style={{ color: editData.tags.length === 13 ? 'var(--color-text-muted)' : '#f38ba8' }}>
                    {editData.tags.length}/13
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {editData.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded text-[10px] cursor-pointer hover:line-through"
                      style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                      onClick={() => handleRemoveTag(i)}
                      title="Click to remove"
                    >
                      {tag} ×
                    </span>
                  ))}
                </div>
                {editData.tags.length < 13 && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                      placeholder="Add tag..."
                      className="flex-1 px-3 py-1 rounded-lg text-xs"
                      style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                    />
                    <Button variant="ghost" size="sm" onClick={handleAddTag}>Add</Button>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <h4 className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Description</h4>
                <textarea
                  value={editData.description}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  rows={10}
                  className="w-full px-3 py-2 rounded-lg text-xs font-sans leading-relaxed"
                  style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)', resize: 'vertical' }}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={handleSave}>Save Changes</Button>
                <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setEditData(null) }}>Cancel</Button>
              </div>
            </div>
          )}

          {/* Publish Section */}
          {listing && !editing && (
            <div className="border-t pt-4 space-y-3" style={{ borderColor: 'var(--color-border)' }}>
              <h4 className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>Publish Checklist</h4>

              <div className="space-y-1">
                {[
                  [checks.printReady, 'Print-ready version created'],
                  [checks.title, 'Listing title set (max 140 chars)'],
                  [checks.tags, '13 tags set'],
                  [checks.description, 'Description set'],
                  [checks.collection, 'Collection assigned'],
                ].map(([ok, label]) => (
                  <div key={label} className="flex items-center gap-2 text-xs">
                    <span style={{ color: ok ? '#a6e3a1' : '#f38ba8' }}>
                      {ok ? '✓' : '✗'}
                    </span>
                    <span style={{ color: ok ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              {listing.status === 'published' ? (
                <div className="space-y-2">
                  <div className="p-3 rounded-lg space-y-1" style={{ backgroundColor: 'rgba(166,227,161,0.1)', border: '1px solid rgba(166,227,161,0.3)' }}>
                    <p className="text-xs font-medium" style={{ color: '#a6e3a1' }}>Published to Etsy via Gelato</p>
                    {listing.gelatoProductId && (
                      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        Gelato ID: {listing.gelatoProductId}
                      </p>
                    )}
                    {listing.etsyListingId && (
                      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        Etsy ID: {listing.etsyListingId}
                      </p>
                    )}
                  </div>
                  {/* Template picker for republishing */}
                  <div>
                    <label className="text-[10px] font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>Gelato Template</label>
                    <select
                      value={selectedTemplateId || ''}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg text-xs"
                      style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                    >
                      {gelatoTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title} ({t.variantCount} variants)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handlePublish}
                      disabled={publishing}
                      style={{ flex: 1 }}
                    >
                      {publishing ? 'Publishing...' : 'Republish to Gelato'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await imagesCrud.update(image.id, {
                          'listing.status': 'ready',
                          'listing.gelatoProductId': null,
                          'listing.etsyListingId': null,
                          'listing.publishedAt': null,
                        })
                        if (onUpdate) onUpdate()
                      }}
                      style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}
                    >
                      Reset to Draft
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {image.store === 'shop-a-mug' ? (
                    /* Mug template selector */
                    <div>
                      <label className="text-[10px] font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>Mug template</label>
                      <div className="flex gap-3">
                        {[['floor', 'Floor pose (cross-legged)'], ['stool', 'Stool pose (upper body)']].map(([val, label]) => (
                          <label key={val} className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--color-text)' }}>
                            <input
                              type="radio"
                              name="mugTemplate"
                              value={val}
                              checked={mugTemplate === val}
                              onChange={async () => {
                                setMugTemplate(val)
                                await imagesCrud.update(image.id, { mugTemplate: val })
                              }}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* Frame template picker — hoodie-gamer only */
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Gelato Template</label>
                        <button
                          onClick={handleSyncTemplates}
                          disabled={syncingTemplates}
                          className="text-[10px] px-1.5 py-0.5 rounded cursor-pointer"
                          style={{ color: 'var(--color-primary)', backgroundColor: 'transparent' }}
                        >
                          {syncingTemplates ? 'Syncing...' : gelatoTemplates.length > 0 ? 'Refresh' : 'Load Templates'}
                        </button>
                      </div>
                      <select
                        value={selectedTemplateId || ''}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg text-xs"
                        style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                      >
                        {gelatoTemplates.length > 0 ? (
                          gelatoTemplates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title} ({t.variantCount} variants)
                            </option>
                          ))
                        ) : (
                          <option value={gelatoConfig?.templateId || ''}>
                            {gelatoConfig?.templateTitle || 'Default template'} ({gelatoConfig?.variants?.length || 0} variants)
                          </option>
                        )}
                      </select>
                    </div>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handlePublish}
                    disabled={!allChecks || publishing || (image.store !== 'shop-a-mug' && !selectedTemplateId)}
                    style={{ width: '100%' }}
                  >
                    {publishing ? 'Publishing...' : allChecks ? 'Publish to Etsy via Gelato' : 'Complete checklist to publish'}
                  </Button>
                </div>
              )}

              {/* Digital Download Section */}
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                  Digital Download
                </p>

                {listing.digitalStatus === 'published' ? (
                  <div className="space-y-2">
                    <div className="p-2 rounded" style={{ backgroundColor: 'rgba(166,227,161,0.1)', border: '1px solid rgba(166,227,161,0.3)' }}>
                      <p className="text-xs font-medium" style={{ color: '#a6e3a1' }}>
                        Digital listing live on Etsy
                      </p>
                      {listing.etsyDigitalListingId && (
                        <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                          Listing ID: {listing.etsyDigitalListingId}
                        </p>
                      )}
                      {listing.etsyDigitalListingUrl && (
                        <a
                          href={listing.etsyDigitalListingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] underline"
                          style={{ color: 'var(--color-primary)' }}
                        >
                          View on Etsy
                        </a>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePublishDigital}
                      disabled={publishingDigital}
                      style={{ width: '100%', fontSize: '10px' }}
                    >
                      {publishingDigital ? 'Publishing...' : 'Republish Digital'}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handlePublishDigital}
                    disabled={!allChecks || publishingDigital || !etsyConnected}
                    style={{ width: '100%', border: '1px solid var(--color-border)' }}
                  >
                    {publishingDigital
                      ? 'Publishing...'
                      : !etsyConnected
                        ? 'Connect Etsy first (Settings)'
                        : allChecks
                          ? 'Publish as Digital Download'
                          : 'Complete checklist first'}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
