import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../components/common/PageHeader'
import Button from '../components/common/Button'
import Badge from '../components/common/Badge'
import { usePaginatedCollection, useFirestoreCrud } from '../hooks/useFirestore'
import { RATING_COLORS, RATING_KEYS } from '../lib/imageUtils'
import { useCollections } from '../hooks/useCollections'
import VideoGenerationPanel from '../components/VideoGenerationPanel'
import ListingPanel from '../components/ListingPanel'
import ImageEditPanel from '../components/ImageEditPanel'

const PAGE_SIZE = 10

export default function GalleryPage() {
  const [searchParams] = useSearchParams()
  const { collections: COLLECTIONS } = useCollections()
  const { update } = useFirestoreCrud('images')
  const upscaleJobsCrud = useFirestoreCrud('upscaleJobs')

  const [filterRating, setFilterRating] = useState('all')
  const [filterUpscaled, setFilterUpscaled] = useState('all') // 'all' | 'original' | 'upscaled'
  const [filterCollection, setFilterCollection] = useState(searchParams.get('collection') || 'all')
  const [selectedId, setSelectedId] = useState(searchParams.get('imageId') || null)

  // Apply URL params when navigating from Collections page
  useEffect(() => {
    const col = searchParams.get('collection')
    const imgId = searchParams.get('imageId')
    if (col) setFilterCollection(col)
    if (imgId) setSelectedId(imgId)
  }, [searchParams])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [batchMode, setBatchMode] = useState(false)
  const [upscaling, setUpscaling] = useState(new Set()) // track which images are being upscaled
  const [videoPanel, setVideoPanel] = useState(null) // image object to show video panel for
  const [listingPanel, setListingPanel] = useState(null) // image object to show listing panel for
  const [editPanel, setEditPanel] = useState(null) // image object to show edit panel for

  // Build Firestore-level filters so pagination works correctly with filters
  const firestoreFilters = useMemo(() => {
    const filters = []
    if (filterRating !== 'all') {
      filters.push({ field: 'rating', op: '==', value: filterRating })
    }
    if (filterUpscaled === 'upscaled') {
      filters.push({ field: 'upscaled', op: '==', value: true })
    } else if (filterUpscaled === 'original') {
      filters.push({ field: 'upscaled', op: '==', value: false })
    }
    if (filterCollection !== 'all' && filterCollection !== 'none') {
      filters.push({ field: 'collection', op: '==', value: filterCollection })
    }
    return filters
  }, [filterRating, filterUpscaled, filterCollection])

  const { documents: images, loading, loadingMore, hasMore, loadMore, totalLoaded } = usePaginatedCollection('images', firestoreFilters, 'createdAt', PAGE_SIZE)

  // Client-side filtering only for things Firestore can't handle (mockups, "none" collection)
  const filtered = useMemo(() => {
    let result = images.filter((img) => !img.category || img.category !== 'mockup')
    if (filterCollection === 'none') {
      result = result.filter((img) => !img.collection)
    }
    return result
  }, [images, filterCollection])

  const selectedImage = useMemo(
    () => images.find((img) => img.id === selectedId),
    [images, selectedId]
  )

  const upscaledCount = useMemo(() => images.filter((img) => img.upscaled).length, [images])

  // Upscale handler — writes to upscaleJobs collection, Firestore trigger picks it up
  const handleUpscale = async (imageId) => {
    if (upscaling.has(imageId)) return
    setUpscaling((prev) => new Set([...prev, imageId]))

    try {
      await upscaleJobsCrud.add({
        imageId,
        status: 'queued',
        error: null,
        startedAt: null,
        completedAt: null,
      })
      console.log('Upscale job queued for image:', imageId)
    } catch (error) {
      console.error('Upscale failed:', error)
      alert(`Upscale failed: ${error.message}`)
      setUpscaling((prev) => {
        const next = new Set(prev)
        next.delete(imageId)
        return next
      })
    }
  }

  // Watch for upscale completion — when image.upscaled becomes true, remove from upscaling set
  useEffect(() => {
    for (const imageId of upscaling) {
      const img = images.find((i) => i.id === imageId)
      if (img?.upscaled) {
        setUpscaling((prev) => {
          const next = new Set(prev)
          next.delete(imageId)
          return next
        })
      }
    }
  }, [images, upscaling])

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e) => {
      if (!selectedImage) return
      // Don't intercept keys when typing in an input/textarea/select
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return
      const rating = RATING_KEYS[e.key]
      if (rating) {
        update(selectedImage.id, { rating })
        // Move to next
        const idx = filtered.findIndex((img) => img.id === selectedImage.id)
        if (idx < filtered.length - 1) setSelectedId(filtered[idx + 1].id)
      }
      if (e.key === 'f') {
        update(selectedImage.id, { favorite: !selectedImage.favorite })
      }
      if (e.key === 'u' && !selectedImage.upscaled) {
        handleUpscale(selectedImage.id)
      }
      if (e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault()
        const idx = filtered.findIndex((img) => img.id === selectedImage.id)
        if (idx < filtered.length - 1) setSelectedId(filtered[idx + 1].id)
      }
      if (e.key === 'ArrowLeft') {
        const idx = filtered.findIndex((img) => img.id === selectedImage.id)
        if (idx > 0) setSelectedId(filtered[idx - 1].id)
      }
      if (e.key === 'Escape') {
        setSelectedId(null)
      }
    },
    [selectedImage, filtered, update, upscaling]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleBatchRate = async (rating) => {
    for (const id of selectedIds) {
      await update(id, { rating })
    }
    setSelectedIds(new Set())
    setBatchMode(false)
  }

  const toggleBatchSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const ratingCounts = useMemo(() => {
    const counts = { all: images.length, unrated: 0, keep: 0, maybe: 0, reject: 0 }
    for (const img of images) counts[img.rating || 'unrated']++
    return counts
  }, [images])

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Art Gallery"
        description={`${images.length} images · ${upscaledCount} upscaled`}
        actions={
          <Button
            variant={batchMode ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()) }}
          >
            {batchMode ? `Batch (${selectedIds.size})` : 'Batch Mode'}
          </Button>
        }
      />

      {/* Filter bar */}
      <div className="px-6 py-3 flex items-center gap-2 border-b flex-wrap" style={{ borderColor: 'var(--color-border)' }}>
        {['all', 'unrated', 'keep', 'maybe', 'reject'].map((r) => (
          <button
            key={r}
            onClick={() => setFilterRating(r)}
            className="px-3 py-1 rounded-md text-xs font-medium cursor-pointer capitalize"
            style={{
              backgroundColor: filterRating === r ? (RATING_COLORS[r] || 'var(--color-primary)') : 'transparent',
              color: filterRating === r ? '#1e1e2e' : 'var(--color-text-muted)',
            }}
          >
            {r} ({ratingCounts[r] || 0})
          </button>
        ))}

        <span className="text-xs mx-2" style={{ color: 'var(--color-border)' }}>|</span>

        {['all', 'original', 'upscaled'].map((f) => (
          <button
            key={f}
            onClick={() => setFilterUpscaled(f)}
            className="px-3 py-1 rounded-md text-xs font-medium cursor-pointer capitalize"
            style={{
              backgroundColor: filterUpscaled === f ? 'var(--color-primary)' : 'transparent',
              color: filterUpscaled === f ? '#1e1e2e' : 'var(--color-text-muted)',
            }}
          >
            {f === 'all' ? 'All' : f === 'upscaled' ? `Upscaled (${upscaledCount})` : `Original (${images.length - upscaledCount})`}
          </button>
        ))}

        <span className="text-xs mx-2" style={{ color: 'var(--color-border)' }}>|</span>

        <select
          value={filterCollection}
          onChange={(e) => setFilterCollection(e.target.value)}
          className="px-2 py-1 rounded-md text-xs font-medium cursor-pointer"
          style={{
            backgroundColor: filterCollection !== 'all' ? 'var(--color-primary)' : 'var(--color-surface)',
            color: filterCollection !== 'all' ? '#1e1e2e' : 'var(--color-text-muted)',
            border: '1px solid var(--color-border)',
          }}
        >
          <option value="all">All Collections</option>
          <option value="none">Uncollected</option>
          {COLLECTIONS.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>

        {batchMode && selectedIds.size > 0 && (
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => handleBatchRate('keep')} style={{ backgroundColor: RATING_COLORS.keep, color: '#1e1e2e' }}>
              Keep All
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleBatchRate('maybe')}>Maybe All</Button>
            <Button size="sm" variant="danger" onClick={() => handleBatchRate('reject')}>Reject All</Button>
          </div>
        )}

        {!batchMode && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Keys: 1=keep 2=maybe 3=reject F=fav U=upscale Space=next
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Grid */}
        <div className={`${selectedImage ? 'w-2/3' : 'w-full'} overflow-auto p-4`}>
          {loading ? (
            <p className="text-sm p-6" style={{ color: 'var(--color-text-muted)' }}>Loading images...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm p-6" style={{ color: 'var(--color-text-muted)' }}>
              No images yet. Generate some from the Builder.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {filtered.map((img) => (
                <div
                  key={img.id}
                  className="relative rounded-lg overflow-hidden cursor-pointer group"
                  style={{
                    aspectRatio: '2/3',
                    border: selectedId === img.id
                      ? '2px solid var(--color-primary)'
                      : selectedIds.has(img.id)
                      ? '2px solid var(--color-keep)'
                      : '2px solid transparent',
                  }}
                  onClick={() => batchMode ? toggleBatchSelect(img.id) : setSelectedId(img.id)}
                >
                  <img
                    src={img.url || img.thumbnailPath}
                    alt=""
                    className="w-full h-full object-cover"
                    style={{ backgroundColor: 'var(--color-surface)' }}
                    loading="lazy"
                  />
                  {/* Rating indicator */}
                  <div
                    className="absolute top-2 right-2 w-3 h-3 rounded-full"
                    style={{ backgroundColor: RATING_COLORS[img.rating || 'unrated'] }}
                  />
                  {img.favorite && (
                    <div className="absolute top-2 left-2 text-xs">*</div>
                  )}
                  {/* Video indicator */}
                  {img.videoUrl && (
                    <div className="absolute bottom-2 left-2 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
                      <span className="text-white text-[8px] ml-0.5">▶</span>
                    </div>
                  )}
                  {/* Upscaled badge */}
                  {img.upscaled && (
                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold"
                      style={{ backgroundColor: 'rgba(168, 85, 247, 0.9)', color: '#fff' }}>
                      {img.upscaleScale || 4}x
                    </div>
                  )}
                  {/* Upscaling spinner */}
                  {upscaling.has(img.id) && (
                    <div className="absolute inset-0 flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
                      <span className="text-xs text-white animate-pulse">Upscaling...</span>
                    </div>
                  )}
                  {/* Hover overlay with prompt */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3"
                    style={{ background: 'linear-gradient(transparent 30%, rgba(0,0,0,0.85))' }}
                  >
                    <p className="text-xs text-white leading-relaxed line-clamp-4 mb-1">
                      {img.promptText || '—'}
                    </p>
                    <span className="text-[10px] text-gray-400">
                      {img.metadata?.model || 'Unknown model'} · seed {img.metadata?.seed || '—'}
                      {img.upscaled ? ' · 4x upscaled' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Load More */}
          {hasMore && !loading && (
            <div className="flex justify-center py-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading...' : `Load More (showing ${totalLoaded})`}
              </Button>
            </div>
          )}
          {!hasMore && filtered.length > 0 && (
            <p className="text-center text-xs py-3" style={{ color: 'var(--color-text-muted)' }}>
              All {totalLoaded} images loaded
            </p>
          )}
        </div>

        {/* Detail panel */}
        {selectedImage && !batchMode && (
          <div
            className="w-1/3 border-l overflow-auto p-4 flex flex-col gap-4"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <img
              src={selectedImage.url}
              alt=""
              className="w-full rounded-lg"
              style={{ backgroundColor: 'var(--color-surface)' }}
            />

            {/* Rating buttons */}
            <div className="flex gap-2">
              {['keep', 'maybe', 'reject'].map((r) => (
                <button
                  key={r}
                  onClick={() => update(selectedImage.id, { rating: r })}
                  className="flex-1 py-2 rounded-lg text-xs font-medium capitalize cursor-pointer transition-opacity"
                  style={{
                    backgroundColor: selectedImage.rating === r ? RATING_COLORS[r] : 'var(--color-surface)',
                    color: selectedImage.rating === r ? '#1e1e2e' : 'var(--color-text-muted)',
                    border: `1px solid ${RATING_COLORS[r]}`,
                  }}
                >
                  {r}
                </button>
              ))}
            </div>

            {/* Collection assignment */}
            <div>
              <h4 className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Collection</h4>
              <select
                value={selectedImage.collection || ''}
                onChange={(e) => {
                  const slug = e.target.value
                  const col = COLLECTIONS.find((c) => c.slug === slug)
                  update(selectedImage.id, {
                    collection: slug || null,
                    collectionDisplayName: col ? col.name : null,
                  })
                }}
                className="w-full px-3 py-2 rounded-lg text-xs cursor-pointer"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <option value="">No collection</option>
                {COLLECTIONS.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Actions — right after rating for quick access */}
            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => update(selectedImage.id, { favorite: !selectedImage.favorite })}
              >
                {selectedImage.favorite ? 'Unfavorite' : 'Favorite'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditPanel(selectedImage)}
              >
                Edit Image
              </Button>
              {!selectedImage.upscaled ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleUpscale(selectedImage.id)}
                  disabled={upscaling.has(selectedImage.id)}
                >
                  {upscaling.has(selectedImage.id) ? 'Upscaling...' : 'Upscale for Print'}
                </Button>
              ) : (
                <div className="px-4 py-2 rounded-lg text-xs font-medium text-center"
                  style={{ backgroundColor: 'rgba(168, 85, 247, 0.15)', color: '#a855f7', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                  Upscaled {selectedImage.upscaleScale || 4}x — Print Ready
                </div>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleUpscale(selectedImage.id)}
                disabled={upscaling.has(selectedImage.id)}
              >
                {upscaling.has(selectedImage.id) ? '4x Upscaling...' : '4x Upscale'}
              </Button>
              {selectedImage.url && (
                <a
                  href={selectedImage.url}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-lg text-sm font-medium text-center transition-opacity"
                  style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                >
                  {selectedImage.upscaled ? 'Download Upscaled' : 'Download Original'}
                </a>
              )}
              {selectedImage.urlPrint && (
                <a
                  href={selectedImage.urlPrint}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-lg text-sm font-medium text-center transition-opacity"
                  style={{ backgroundColor: 'rgba(168, 85, 247, 0.15)', color: '#a855f7', border: '1px solid rgba(168, 85, 247, 0.3)' }}
                >
                  Download Print Version ☀️
                </a>
              )}
              {selectedImage.upscaled && !selectedImage.urlPrint && (
                <span className="text-[10px] text-center" style={{ color: 'var(--color-text-muted)' }}>
                  Upscaled before print optimization — re-upscale for print version
                </span>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setVideoPanel(selectedImage)}
              >
                {selectedImage.videoUrl ? 'View Video' : selectedImage.videoStatus === 'generating' ? 'Video Generating...' : 'Generate Video'}
              </Button>
              <Button
                variant={selectedImage.listing?.status === 'published' ? 'ghost' : 'primary'}
                size="sm"
                onClick={() => setListingPanel(selectedImage)}
              >
                {selectedImage.listing?.status === 'published'
                  ? 'Published ✓'
                  : selectedImage.listing?.status === 'ready' || selectedImage.listing?.status === 'draft'
                  ? 'Edit Listing'
                  : 'Prepare Listing'}
              </Button>
            </div>

            {/* Video preview */}
            {selectedImage.videoUrl && (
              <div>
                <h4 className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Video</h4>
                <video
                  src={selectedImage.videoUrl}
                  controls
                  loop
                  muted
                  className="w-full rounded-lg"
                  style={{ backgroundColor: 'var(--color-bg)' }}
                />
              </div>
            )}

            {/* Prompt */}
            {selectedImage.promptText && (
              <div>
                <h4 className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Prompt</h4>
                <p className="text-xs leading-relaxed p-2 rounded-lg" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}>
                  {selectedImage.promptText}
                </p>
              </div>
            )}

            {/* Metadata */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Metadata</h4>
              {[
                ['Model', selectedImage.metadata?.model],
                ['Seed', selectedImage.metadata?.seed],
                ['Steps', selectedImage.metadata?.inferenceSteps],
                ['Guidance', selectedImage.metadata?.guidanceScale],
                ['Size', `${selectedImage.width}×${selectedImage.height}`],
                ['Print', (() => {
                  const w = selectedImage.width || 0
                  const h = selectedImage.height || 0
                  const longEdge = Math.max(w, h)
                  if (longEdge >= 4961) return 'A3+ @ 300 DPI ✓'
                  if (longEdge >= 3508) return 'A4 @ 300 DPI ✓'
                  if (longEdge >= 2480) return 'A4 @ 200 DPI'
                  return 'Needs upscale'
                })()],
                ['Status', selectedImage.upscaled ? `Upscaled ${selectedImage.upscaleScale || ''}x` : 'Original'],
                ...(selectedImage.upscaled ? [['Upscaled Res', `${selectedImage.upscaledWidth || '?'}×${selectedImage.upscaledHeight || '?'}`]] : []),
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-xs">
                  <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                  <span style={{ color: 'var(--color-text)' }}>{value || '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Video generation modal */}
      {videoPanel && (
        <VideoGenerationPanel
          image={images.find((img) => img.id === videoPanel.id) || videoPanel}
          onClose={() => setVideoPanel(null)}
        />
      )}

      {/* Listing preparation modal — use live image data from real-time subscription */}
      {listingPanel && (
        <ListingPanel
          image={images.find((img) => img.id === listingPanel.id) || listingPanel}
          onClose={() => setListingPanel(null)}
        />
      )}

      {editPanel && (
        <ImageEditPanel
          image={images.find((img) => img.id === editPanel.id) || editPanel}
          onClose={() => setEditPanel(null)}
        />
      )}
    </div>
  )
}
