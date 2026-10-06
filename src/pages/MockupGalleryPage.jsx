import { useState, useEffect, useMemo, useCallback } from 'react'
import PageHeader from '../components/common/PageHeader'
import Button from '../components/common/Button'
import { usePaginatedCollection, useFirestoreCrud } from '../hooks/useFirestore'
import { RATING_COLORS, RATING_KEYS } from '../lib/imageUtils'

const PAGE_SIZE = 12

export default function MockupGalleryPage() {
  const { documents: images, loading, loadingMore, hasMore, loadMore, totalLoaded } = usePaginatedCollection(
    'images',
    [{ field: 'category', op: '==', value: 'mockup' }],
    'createdAt',
    PAGE_SIZE
  )
  const { update, remove } = useFirestoreCrud('images')

  const [filterRating, setFilterRating] = useState('all')
  const [selectedId, setSelectedId] = useState(null)

  const filtered = useMemo(() => {
    if (filterRating === 'all') return images
    return images.filter((img) => img.rating === filterRating)
  }, [images, filterRating])

  const selectedImage = useMemo(
    () => images.find((img) => img.id === selectedId),
    [images, selectedId]
  )

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e) => {
      if (!selectedImage) return
      const rating = RATING_KEYS[e.key]
      if (rating) {
        update(selectedImage.id, { rating })
        const idx = filtered.findIndex((img) => img.id === selectedImage.id)
        if (idx < filtered.length - 1) setSelectedId(filtered[idx + 1].id)
      }
      if (e.key === 'f') {
        update(selectedImage.id, { favorite: !selectedImage.favorite })
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
    [selectedImage, filtered, update]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const ratingCounts = useMemo(() => {
    const counts = { all: images.length, unrated: 0, keep: 0, maybe: 0, reject: 0 }
    for (const img of images) counts[img.rating || 'unrated']++
    return counts
  }, [images])

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Mockup Gallery"
        description={`${images.length} mockup scenes`}
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

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Keys: 1=keep 2=maybe 3=reject F=fav Space=next
          </span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Grid */}
        <div className={`${selectedImage ? 'w-2/3' : 'w-full'} overflow-auto p-4`}>
          {loading ? (
            <p className="text-sm p-6" style={{ color: 'var(--color-text-muted)' }}>Loading mockups...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm p-6" style={{ color: 'var(--color-text-muted)' }}>
              No mockup images yet. Generate some from the Mockup Builder.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {filtered.map((img) => (
                <div
                  key={img.id}
                  className="relative rounded-lg overflow-hidden cursor-pointer group"
                  style={{
                    aspectRatio: '1/1',
                    border: selectedId === img.id
                      ? '2px solid var(--color-primary)'
                      : '2px solid transparent',
                  }}
                  onClick={() => setSelectedId(img.id)}
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
                  {/* Hover overlay with prompt */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3"
                    style={{ background: 'linear-gradient(transparent 30%, rgba(0,0,0,0.85))' }}
                  >
                    <p className="text-xs text-white leading-relaxed line-clamp-3 mb-1">
                      {img.promptText || '—'}
                    </p>
                    <span className="text-[10px] text-gray-400">
                      {img.metadata?.model || 'Unknown model'} · seed {img.metadata?.seed || '—'}
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
              All {totalLoaded} mockups loaded
            </p>
          )}
        </div>

        {/* Detail panel */}
        {selectedImage && (
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

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => update(selectedImage.id, { favorite: !selectedImage.favorite })}
              >
                {selectedImage.favorite ? 'Unfavorite' : 'Favorite'}
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
                  Download Mockup
                </a>
              )}
            </div>

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
                ['Size', `${selectedImage.width}×${selectedImage.height}`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-xs">
                  <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                  <span style={{ color: 'var(--color-text)' }}>{value || '—'}</span>
                </div>
              ))}
            </div>

            {/* Delete mockup */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (window.confirm('Delete this mockup?')) {
                  remove(selectedImage.id)
                  setSelectedId(null)
                }
              }}
              style={{ color: '#ef4444', marginTop: 'auto' }}
            >
              Delete Mockup
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
