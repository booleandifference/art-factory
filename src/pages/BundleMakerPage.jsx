import { useState, useMemo, useCallback } from 'react'
import { useCollection as useFirestoreCollection, useDocument, useFirestoreCrud } from '../hooks/useFirestore'
import { useCollections } from '../hooks/useCollections'
import { generateBundleListing } from '../lib/bundleAi'
import PageHeader from '../components/common/PageHeader'
import Button from '../components/common/Button'

const STEP_ORDER = ['creating', 'zipping', 'uploadingZip', 'uploadingImages', 'activating', 'done']
const STEP_LABELS = {
  creating: 'Creating Etsy listing…',
  zipping: 'Generating zip file…',
  uploadingZip: 'Uploading bundle files…',
  uploadingImages: 'Uploading listing images…',
  activating: 'Activating listing…',
  done: 'Published!',
}

function StepRow({ step, jobStep, status, link, suffix }) {
  const reached = STEP_ORDER.indexOf(jobStep || '') >= STEP_ORDER.indexOf(step)
  const isCurrent = jobStep === step && status !== 'completed'
  const isFailed = status === 'failed' && isCurrent
  let mark = '○'
  let color = 'var(--color-text-muted)'
  if (status === 'completed' || (reached && !isCurrent)) { mark = '✓'; color = '#a6e3a1' }
  else if (isFailed) { mark = '✗'; color = '#f38ba8' }
  else if (isCurrent) { mark = '…'; color = 'var(--color-primary)' }
  return (
    <div className="flex items-center gap-2 text-xs" style={{ color }}>
      <span className="w-4">{mark}</span>
      <span>{STEP_LABELS[step]}{suffix ? ` ${suffix}` : ''}</span>
      {step === 'done' && link && (
        <a href={link} target="_blank" rel="noreferrer" className="underline ml-2">
          View on Etsy →
        </a>
      )}
    </div>
  )
}

export default function BundleMakerPage() {
  const { collections: COLLECTIONS } = useCollections()
  const { documents: allImages, loading: imagesLoading } = useFirestoreCollection('images', [], 'createdAt')
  const { document: etsyConfig } = useDocument('config', 'etsy')
  const jobsCrud = useFirestoreCrud('bundlePublishJobs')

  const [selectedCollection, setSelectedCollection] = useState('')
  const [bundleItems, setBundleItems] = useState([])
  const [name, setName] = useState('')
  const [price, setPrice] = useState('14.99')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState([])
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiGenerated, setAiGenerated] = useState(false)
  const [error, setError] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [reorderTarget, setReorderTarget] = useState(null)
  const [activeJobId, setActiveJobId] = useState(null)

  const { document: activeJob } = useDocument('bundlePublishJobs', activeJobId)
  const publishing = !!activeJob && activeJob.status !== 'completed' && activeJob.status !== 'failed'

  const eligibleImages = useMemo(() => {
    if (!selectedCollection) return []
    return allImages.filter(
      (img) =>
        img.collection === selectedCollection &&
        img.rating === 'keep' &&
        !!img.storagePathUpscaled &&
        (!img.category || img.category !== 'mockup')
    )
  }, [allImages, selectedCollection])

  const bundleIds = useMemo(() => new Set(bundleItems.map((i) => i.id)), [bundleItems])

  const collectionNames = useMemo(() => {
    const slugs = [...new Set(bundleItems.map((i) => i.collection).filter(Boolean))]
    return slugs.map((s) => COLLECTIONS.find((c) => c.slug === s)?.name || s)
  }, [bundleItems, COLLECTIONS])

  const handleAddImage = useCallback((img) => {
    setBundleItems((prev) => (prev.some((p) => p.id === img.id) ? prev : [...prev, img]))
  }, [])

  const handleRemoveImage = useCallback((id) => {
    setBundleItems((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const handleDragStartFromBrowser = (e, img) => {
    e.dataTransfer.setData('application/x-image-id', img.id)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleCanvasDrop = (e) => {
    e.preventDefault()
    const imgId = e.dataTransfer.getData('application/x-image-id')
    if (imgId) {
      const img = allImages.find((i) => i.id === imgId)
      if (img) handleAddImage(img)
    }
  }

  const handleReorderDragStart = (e, id) => {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-reorder-id', id)
  }

  const handleReorderDragOver = (e, overId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (overId !== reorderTarget) setReorderTarget(overId)
  }

  const handleReorderDrop = (e, overId) => {
    e.preventDefault()
    const fromId = e.dataTransfer.getData('application/x-reorder-id') || draggingId
    setReorderTarget(null)
    setDraggingId(null)
    if (!fromId || fromId === overId) return
    setBundleItems((prev) => {
      const next = [...prev]
      const fromIdx = next.findIndex((i) => i.id === fromId)
      const toIdx = next.findIndex((i) => i.id === overId)
      if (fromIdx === -1 || toIdx === -1) return prev
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }

  const canGenerate = bundleItems.length >= 3 && name.trim().length > 0 && !aiGenerating
  const canPublish =
    aiGenerated &&
    bundleItems.length >= 3 &&
    title.trim() &&
    description.trim() &&
    tags.length > 0 &&
    !publishing &&
    !!etsyConfig?.accessToken

  const handleGenerateAi = async () => {
    setError(null)
    setAiGenerating(true)
    try {
      const imageTitles = bundleItems.map((i) => i.listing?.title).filter(Boolean)
      const result = await generateBundleListing({
        bundleName: name.trim(),
        collectionNames,
        imageCount: bundleItems.length,
        imageTitles,
      })
      setTitle((result.title || '').slice(0, 140))
      setDescription(result.description || '')
      setTags(Array.isArray(result.tags) ? result.tags.slice(0, 13) : [])
      setAiGenerated(true)
    } catch (err) {
      console.error(err)
      setError(`AI generation failed: ${err.message}`)
    } finally {
      setAiGenerating(false)
    }
  }

  const handlePublish = async () => {
    setError(null)
    try {
      const jobId = await jobsCrud.add({
        status: 'queued',
        step: null,
        name: name.trim(),
        price: parseFloat(price) || 14.99,
        title: title.trim(),
        description: description.trim(),
        tags,
        imageIds: bundleItems.map((i) => i.id),
      })
      setActiveJobId(jobId)
    } catch (err) {
      console.error(err)
      setError(`Could not queue bundle publish: ${err.message}`)
    }
  }

  const handleResetForNew = () => {
    setBundleItems([])
    setName('')
    setPrice('14.99')
    setTitle('')
    setDescription('')
    setTags([])
    setAiGenerated(false)
    setActiveJobId(null)
    setError(null)
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Bundle Maker"
        description="Build digital download bundles and publish directly to Etsy"
      />

      <div className="flex-1 grid overflow-hidden" style={{ gridTemplateColumns: '40% 60%' }}>
        {/* LEFT — Collection Browser */}
        <div className="border-r flex flex-col overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
          <div className="p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Collection
            </label>
            <select
              value={selectedCollection}
              onChange={(e) => setSelectedCollection(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
              }}
            >
              <option value="">Select a collection…</option>
              {COLLECTIONS.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
            {selectedCollection && (
              <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
                {eligibleImages.length} keep-rated, upscaled images
              </p>
            )}
          </div>

          <div className="flex-1 overflow-auto p-3">
            {!selectedCollection ? (
              <div className="text-xs py-6 text-center" style={{ color: 'var(--color-text-muted)' }}>
                Pick a collection to see eligible images.
              </div>
            ) : imagesLoading ? (
              <div className="text-xs py-6 text-center" style={{ color: 'var(--color-text-muted)' }}>
                Loading…
              </div>
            ) : eligibleImages.length === 0 ? (
              <div className="text-xs py-6 text-center" style={{ color: 'var(--color-text-muted)' }}>
                No keep-rated upscaled images in this collection yet.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {eligibleImages.map((img) => {
                  const inBundle = bundleIds.has(img.id)
                  return (
                    <div
                      key={img.id}
                      draggable
                      onDragStart={(e) => handleDragStartFromBrowser(e, img)}
                      onDoubleClick={() => handleAddImage(img)}
                      className="relative rounded-md overflow-hidden cursor-grab active:cursor-grabbing"
                      style={{
                        aspectRatio: '2/3',
                        backgroundColor: 'var(--color-surface)',
                        border: inBundle ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      }}
                      title={img.listing?.title || img.promptText || ''}
                    >
                      <img
                        src={img.urlPrint || img.url || img.thumbnailPath}
                        alt=""
                        className="w-full h-full object-cover pointer-events-none"
                        loading="lazy"
                      />
                      {inBundle && (
                        <div
                          className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-medium"
                          style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
                        >
                          ✓ in bundle
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Bundle Canvas */}
        <div className="flex flex-col overflow-hidden">
          <div className="p-4 border-b space-y-3" style={{ borderColor: 'var(--color-border)' }}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  Bundle Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Cyberpunk Gamer Bundle"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                  }}
                />
              </div>
              <div>
                <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  Price (USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                  Etsy Title {aiGenerated && `(${title.length}/140)`}
                </label>
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="(generated by AI)"
                maxLength={140}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                }}
              />
            </div>

            <div>
              <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--color-text-muted)' }}>
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="(generated by AI — 200-250 words, edit before publishing)"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                }}
              />
            </div>

            <div>
              <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--color-text-muted)' }}>
                Tags (13)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {tags.length === 0 ? (
                  <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    (generated by AI)
                  </span>
                ) : (
                  tags.map((t, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded text-[10px]"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-text)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      {t}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleCanvasDrop}
            className="flex-1 overflow-auto p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {bundleItems.length} {bundleItems.length === 1 ? 'image' : 'images'} selected
                {bundleItems.length > 0 && bundleItems.length < 3 && ' — minimum 3 required'}
              </p>
              {bundleItems.length > 0 && (
                <button
                  onClick={handleResetForNew}
                  className="text-[10px] underline cursor-pointer"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Clear bundle
                </button>
              )}
            </div>

            {bundleItems.length === 0 ? (
              <div
                className="rounded-lg flex items-center justify-center text-xs"
                style={{
                  height: '200px',
                  border: '2px dashed var(--color-border)',
                  color: 'var(--color-text-muted)',
                }}
              >
                Drag images here from the left panel
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {bundleItems.map((img, idx) => (
                  <div
                    key={img.id}
                    draggable
                    onDragStart={(e) => handleReorderDragStart(e, img.id)}
                    onDragOver={(e) => handleReorderDragOver(e, img.id)}
                    onDrop={(e) => handleReorderDrop(e, img.id)}
                    onDragEnd={() => { setDraggingId(null); setReorderTarget(null) }}
                    className="relative rounded-md overflow-hidden group cursor-grab active:cursor-grabbing"
                    style={{
                      aspectRatio: '2/3',
                      backgroundColor: 'var(--color-surface)',
                      border: reorderTarget === img.id
                        ? '2px solid var(--color-primary)'
                        : '1px solid var(--color-border)',
                      opacity: draggingId === img.id ? 0.5 : 1,
                    }}
                  >
                    <img
                      src={img.urlPrint || img.url || img.thumbnailPath}
                      alt=""
                      className="w-full h-full object-cover pointer-events-none"
                      loading="lazy"
                    />
                    {idx === 0 && (
                      <div
                        className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-medium"
                        style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
                      >
                        Cover
                      </div>
                    )}
                    <button
                      onClick={() => handleRemoveImage(img.id)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] cursor-pointer opacity-0 group-hover:opacity-100"
                      style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: 'white' }}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action bar */}
          <div className="border-t p-4 space-y-3" style={{ borderColor: 'var(--color-border)' }}>
            {error && (
              <div
                className="p-2 rounded text-xs"
                style={{ backgroundColor: 'rgba(243,139,168,0.1)', color: '#f38ba8', border: '1px solid rgba(243,139,168,0.3)' }}
              >
                {error}
              </div>
            )}

            {activeJob && (
              <div className="space-y-1 p-2 rounded" style={{ backgroundColor: 'var(--color-surface)' }}>
                {STEP_ORDER.map((s) => (
                  <StepRow
                    key={s}
                    step={s}
                    jobStep={activeJob.step}
                    status={activeJob.status}
                    link={activeJob.etsyListingUrl}
                    suffix={
                      s === 'uploadingImages' && activeJob.uploadedImages != null
                        ? `(${activeJob.uploadedImages}/${Math.min(bundleItems.length, 10)})`
                        : s === 'uploadingZip' && activeJob.totalZips
                          ? `(${activeJob.uploadedZips || 0}/${activeJob.totalZips})`
                          : ''
                    }
                  />
                ))}
                {activeJob.status === 'failed' && (
                  <div className="text-xs mt-2" style={{ color: '#f38ba8' }}>
                    {activeJob.error || 'Publish failed'}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 items-center">
              <Button variant="secondary" size="sm" disabled={!canGenerate} onClick={handleGenerateAi}>
                {aiGenerating ? 'Generating…' : aiGenerated ? 'Regenerate AI Listing' : 'Generate AI Listing'}
              </Button>
              <Button variant="primary" size="sm" disabled={!canPublish} onClick={handlePublish}>
                {publishing ? 'Publishing…' : 'Publish to Etsy'}
              </Button>
              {!etsyConfig?.accessToken && (
                <span className="text-[10px]" style={{ color: '#f38ba8' }}>
                  Etsy not connected — go to Etsy settings.
                </span>
              )}
              {(activeJob?.status === 'completed' || activeJob?.status === 'failed') && (
                <Button variant="ghost" size="sm" onClick={handleResetForNew}>
                  New bundle
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
