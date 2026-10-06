import { useState, useMemo, useEffect } from 'react'
import { useCollection } from '../hooks/useFirestore'
import Button from '../components/common/Button'
import ManualVideoPromptForm from '../components/ManualVideoPromptForm'

export default function VideoGalleryPage() {
  const [filterCollection, setFilterCollection] = useState('all')
  const [selectedImageId, setSelectedImageId] = useState(null)
  const [videoJobMap, setVideoJobMap] = useState({}) // imageId -> [jobs]
  const [showAllImages, setShowAllImages] = useState(false)
  const [manualPrompt, setManualPrompt] = useState(null) // { image, initialPrompt }

  // Load all images that have at least one video-related field
  const { documents: allImages, loading: imagesLoading } = useCollection('images', [], 'createdAt')
  const { documents: allVideoJobs, loading: jobsLoading } = useCollection('videoJobs', [], 'createdAt')

  // Build a map of imageId -> videoJobs (sorted newest first)
  useEffect(() => {
    const map = {}
    for (const job of allVideoJobs) {
      const imgId = job.imageId
      if (!imgId) continue
      if (!map[imgId]) map[imgId] = []
      map[imgId].push(job)
    }
    // Sort each list: newest first
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => {
        const ta = a.createdAt?.toDate?.() || a.createdAt?.seconds ? new Date(a.createdAt.seconds * 1000) : new Date(a.createdAt || 0)
        const tb = b.createdAt?.toDate?.() || b.createdAt?.seconds ? new Date(b.createdAt.seconds * 1000) : new Date(b.createdAt || 0)
        return tb - ta
      })
    }
    setVideoJobMap(map)
  }, [allVideoJobs])

  // Images that have video jobs
  const imagesWithVideos = useMemo(() => {
    const jobImageIds = new Set(Object.keys(videoJobMap))
    return allImages.filter(img => jobImageIds.has(img.id) || img.videoUrl || img.videoStatus)
  }, [allImages, videoJobMap])

  // When "show all" is on, include images that have no video jobs yet so they
  // can be given a manual prompt.
  const browsableImages = showAllImages ? allImages : imagesWithVideos

  // Get unique collections from those images
  const collections = useMemo(() => {
    const set = new Set()
    browsableImages.forEach(img => {
      if (img.collection) set.add(img.collection)
    })
    return [...set].sort()
  }, [browsableImages])

  // Filter by collection
  const filteredImages = useMemo(() => {
    if (filterCollection === 'all') return browsableImages
    return browsableImages.filter(img => img.collection === filterCollection)
  }, [browsableImages, filterCollection])

  // Selected image data
  const selectedImage = useMemo(() => {
    if (!selectedImageId) return null
    return allImages.find(img => img.id === selectedImageId)
  }, [selectedImageId, allImages])

  const selectedJobs = selectedImageId ? (videoJobMap[selectedImageId] || []) : []

  const loading = imagesLoading || jobsLoading

  // Count stats per collection
  const collectionStats = useMemo(() => {
    const stats = {}
    browsableImages.forEach(img => {
      const col = img.collection || '(none)'
      if (!stats[col]) stats[col] = { total: 0, completed: 0, generating: 0, failed: 0 }
      stats[col].total++
      const jobs = videoJobMap[img.id] || []
      const hasCompleted = jobs.some(j => j.status === 'completed') || img.videoStatus === 'completed'
      const hasGenerating = jobs.some(j => j.status === 'generating')
      const hasFailed = jobs.some(j => j.status === 'failed')
      if (hasCompleted) stats[col].completed++
      if (hasGenerating) stats[col].generating++
      if (hasFailed && !hasCompleted) stats[col].failed++
    })
    return stats
  }, [browsableImages, videoJobMap])

  return (
    <div className="h-full flex flex-col" style={{ color: 'var(--color-text)' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>Video Gallery</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            {imagesWithVideos.length} images with videos across {collections.length} collections
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Collection:</span>
        <button
          className="px-2 py-1 rounded text-xs cursor-pointer"
          style={{
            backgroundColor: filterCollection === 'all' ? 'var(--color-primary)' : 'var(--color-bg)',
            color: filterCollection === 'all' ? '#fff' : 'var(--color-text-muted)',
          }}
          onClick={() => setFilterCollection('all')}
        >
          All ({browsableImages.length})
        </button>
        {collections.map(col => (
          <button
            key={col}
            className="px-2 py-1 rounded text-xs cursor-pointer"
            style={{
              backgroundColor: filterCollection === col ? 'var(--color-primary)' : 'var(--color-bg)',
              color: filterCollection === col ? '#fff' : 'var(--color-text-muted)',
            }}
            onClick={() => setFilterCollection(col)}
          >
            {col.replace(/-/g, ' ')} ({collectionStats[col]?.total || 0})
          </button>
        ))}

        {/* Include images that have no video yet, so they can get a manual prompt */}
        <label
          className="ml-auto flex items-center gap-1.5 text-xs cursor-pointer select-none"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <input
            type="checkbox"
            checked={showAllImages}
            onChange={(e) => setShowAllImages(e.target.checked)}
          />
          Show images without videos
        </label>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm animate-pulse" style={{ color: 'var(--color-text-muted)' }}>Loading videos...</p>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Grid */}
          <div className={`overflow-auto p-4 ${selectedImageId ? 'w-2/3' : 'w-full'}`}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredImages.map(img => {
                const jobs = videoJobMap[img.id] || []
                const completedCount = jobs.filter(j => j.status === 'completed').length
                const latestStatus = jobs[0]?.status || img.videoStatus || 'no video'
                const isSelected = selectedImageId === img.id

                return (
                  <div
                    key={img.id}
                    className="relative rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-[1.02]"
                    style={{
                      border: isSelected ? '2px solid var(--color-primary)' : '2px solid transparent',
                      backgroundColor: 'var(--color-bg)',
                    }}
                    onClick={() => setSelectedImageId(isSelected ? null : img.id)}
                  >
                    <img
                      src={img.thumbnailPath ? undefined : img.url}
                      alt=""
                      className="w-full"
                      style={{ aspectRatio: '2/3', objectFit: 'cover' }}
                      loading="lazy"
                    />
                    {/* Video count badge */}
                    <div
                      className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold"
                      style={{
                        backgroundColor: completedCount > 1 ? '#8b5cf6' : completedCount === 1 ? 'var(--color-keep)' : 'var(--color-text-muted)',
                        color: '#fff',
                      }}
                    >
                      {completedCount > 0 ? `${completedCount} video${completedCount > 1 ? 's' : ''}` : latestStatus}
                    </div>
                    {/* Collection label */}
                    <div
                      className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] truncate"
                      style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff' }}
                    >
                      {(img.collectionDisplayName || img.collection || '').replace(/-/g, ' ')}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Detail panel */}
          {selectedImage && (
            <div
              className="w-1/3 border-l overflow-auto flex flex-col"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
            >
              {/* Close button */}
              <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <h3 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                  Video History ({selectedJobs.length} job{selectedJobs.length !== 1 ? 's' : ''})
                </h3>
                <button
                  onClick={() => setSelectedImageId(null)}
                  className="text-xs cursor-pointer px-2 py-1 rounded"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Close
                </button>
              </div>

              {/* Source image info */}
              <div className="p-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <p className="text-[10px] font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  Source Image
                </p>
                <div className="flex gap-2">
                  <img
                    src={selectedImage.url}
                    alt=""
                    className="w-20 rounded flex-shrink-0"
                    style={{ aspectRatio: '2/3', objectFit: 'cover', backgroundColor: 'var(--color-bg)' }}
                  />
                  <div className="text-[10px] space-y-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    <p>{selectedImage.collection?.replace(/-/g, ' ')}</p>
                    <p>{selectedImage.width}x{selectedImage.height}</p>
                    <p>Rating: {selectedImage.rating || '—'}</p>
                    <p className="mt-1 leading-relaxed line-clamp-4">{selectedImage.promptText}</p>
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  className="w-full mt-3"
                  onClick={() => setManualPrompt({ image: selectedImage, initialPrompt: '' })}
                >
                  Write Manual Video Prompt
                </Button>
              </div>

              {/* All video jobs for this image */}
              <div className="p-3 flex-1">
                <p className="text-[10px] font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
                  All Video Jobs
                </p>
                <div className="space-y-2">
                  {selectedJobs.length === 0 && (
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>No video jobs found</p>
                  )}
                  {selectedJobs.map((job, i) => (
                    <VideoJobCard
                      key={job.id}
                      job={job}
                      index={i}
                      totalJobs={selectedJobs.length}
                      onReusePrompt={(prompt) =>
                        setManualPrompt({ image: selectedImage, initialPrompt: prompt })
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual prompt window */}
      {manualPrompt && (
        <ManualVideoPromptModal
          image={manualPrompt.image}
          initialPrompt={manualPrompt.initialPrompt}
          onClose={() => setManualPrompt(null)}
          onSubmitted={(imageId) => {
            setManualPrompt(null)
            setSelectedImageId(imageId)
          }}
        />
      )}
    </div>
  )
}

/**
 * Modal wrapper around the shared manual prompt form.
 */
function ManualVideoPromptModal({ image, initialPrompt = '', onClose, onSubmitted }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-[640px] max-h-[85vh] rounded-xl overflow-auto"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
            Manual Video Prompt
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
          {/* Source image */}
          <div className="flex gap-4">
            <img
              src={image.url}
              alt=""
              className="w-32 rounded-lg flex-shrink-0"
              style={{ aspectRatio: '2/3', objectFit: 'cover', backgroundColor: 'var(--color-bg)' }}
            />
            <div className="flex-1 space-y-2">
              <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'var(--color-text-muted)' }}>
                {image.promptText || 'No prompt'}
              </p>
              <div className="text-[10px] space-y-0.5" style={{ color: 'var(--color-text-muted)' }}>
                <p>{(image.collectionDisplayName || image.collection || '').replace(/-/g, ' ')}</p>
                <p>Size: {image.width}x{image.height}</p>
              </div>
            </div>
          </div>

          <ManualVideoPromptForm
            image={image}
            initialPrompt={initialPrompt}
            onCancel={onClose}
            onSubmitted={(videoJobId, imageId) => onSubmitted(imageId)}
          />
        </div>
      </div>
    </div>
  )
}

function VideoJobCard({ job, index, totalJobs, onReusePrompt }) {
  const [expanded, setExpanded] = useState(index === 0) // expand latest by default

  const statusColors = {
    completed: 'var(--color-keep)',
    generating: 'var(--color-primary)',
    failed: 'var(--color-reject)',
    awaiting_selection: '#f9e2af',
    manual: '#f9e2af',
    queued: 'var(--color-text-muted)',
    analyzing: 'var(--color-primary)',
  }

  const statusColor = statusColors[job.status] || 'var(--color-text-muted)'

  const createdAt = job.createdAt?.toDate?.()
    ? job.createdAt.toDate()
    : job.createdAt?.seconds
      ? new Date(job.createdAt.seconds * 1000)
      : null

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}
    >
      {/* Job header */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: statusColor }}
          />
          <span className="text-[10px] font-medium" style={{ color: 'var(--color-text)' }}>
            Job #{totalJobs - index}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ backgroundColor: statusColor + '22', color: statusColor }}
          >
            {job.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {createdAt && (
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              {createdAt.toLocaleDateString()} {createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            {expanded ? '−' : '+'}
          </span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
          {/* Video player for completed jobs */}
          {job.status === 'completed' && job.videoUrl && (
            <div className="mt-2">
              <video
                src={job.videoUrl}
                controls
                loop
                autoPlay
                muted
                className="w-full rounded-lg"
                style={{ backgroundColor: 'var(--color-bg)' }}
              />
              <a
                href={job.videoUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center mt-2 px-3 py-1.5 rounded-lg text-[10px] font-medium"
                style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
              >
                Download
              </a>
            </div>
          )}

          {/* Final prompt used */}
          {job.prompt && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-0.5">
                <p className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                  Prompt used{job.manual ? ' (manual)' : ''}
                </p>
                {onReusePrompt && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onReusePrompt(job.prompt)
                    }}
                    className="text-[10px] cursor-pointer px-1.5 py-0.5 rounded"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    Edit &amp; re-run
                  </button>
                )}
              </div>
              <p className="text-[10px] leading-relaxed p-2 rounded" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}>
                {job.prompt}
              </p>
            </div>
          )}

          {/* Suggested prompts from Claude analysis */}
          {job.suggestedPrompts && job.suggestedPrompts.length > 0 && (
            <div>
              <p className="text-[10px] font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                Claude suggestions
              </p>
              {job.suggestedPrompts.map((prompt, pi) => (
                <div key={pi} className="mb-1.5">
                  <p className="text-[10px] font-medium" style={{ color: 'var(--color-primary)' }}>
                    {['Subtle / Atmospheric', 'Medium / Animated', 'Dramatic / Effects'][pi] || `Option ${pi + 1}`}
                  </p>
                  <p className="text-[10px] leading-relaxed p-1.5 rounded" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-muted)' }}>
                    {prompt}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* User direction if any */}
          {job.userDirection && (
            <div>
              <p className="text-[10px] font-medium mb-0.5" style={{ color: 'var(--color-text-muted)' }}>User direction</p>
              <p className="text-[10px] italic p-1.5 rounded" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}>
                {job.userDirection}
              </p>
            </div>
          )}

          {/* Job metadata */}
          <div className="text-[10px] space-y-0.5 pt-1" style={{ color: 'var(--color-text-muted)' }}>
            {job.model && <p>Model: {job.model}</p>}
            {job.resolution && <p>Resolution: {job.resolution}</p>}
            {job.videoDuration && <p>Duration: {job.videoDuration}s</p>}
            {job.videoStoragePath && <p>Path: {job.videoStoragePath}</p>}
            {job.error && (
              <p style={{ color: 'var(--color-reject)' }}>Error: {job.error}</p>
            )}
            <p className="font-mono opacity-60">ID: {job.id}</p>
          </div>
        </div>
      )}
    </div>
  )
}
