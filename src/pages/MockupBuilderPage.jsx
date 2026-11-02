import { useState, useMemo } from 'react'
import toast from 'react-hot-toast'
import PageHeader from '../components/common/PageHeader'
import Button from '../components/common/Button'
import ConceptPicker from '../components/PromptBuilder/ConceptPicker'
import { useCollection, useFirestoreCrud } from '../hooks/useFirestore'
import { useCollections } from '../hooks/useCollections'
import {
  assembleMockupPrompt,
  generateMockupPromptName,
  FAL_MODELS,
  DEFAULT_MODEL_PARAMS,
  isNanoBanana,
  NANO_RESOLUTIONS,
} from '../lib/promptAssembler'

// Artwork photos sent to nano-banana-2/edit (fal.ai allows more, but quality drops past a handful)
const MAX_ARTWORKS = 5
const EDIT_MODEL = 'fal-ai/nano-banana-2/edit'

// Prefix that tells the edit model to place the attached artwork, untouched, into the scene
function artworkInstruction(count) {
  const what = count === 1
    ? 'the provided artwork image as a framed print'
    : `the ${count} provided artwork images as framed prints, one frame per image`
  return `Create a photorealistic interior photo that shows ${what}, placed as the scene describes. Reproduce the artwork exactly as given: do not redraw, recolor, crop or add anything to it. Scene: `
}

export default function MockupBuilderPage() {
  const { documents: concepts } = useCollection('concepts', [], 'createdAt')
  const { documents: savedPrompts } = useCollection('prompts', [{ field: 'category', op: '==', value: 'mockup' }], 'createdAt')
  const promptsCrud = useFirestoreCrud('prompts')
  const jobsCrud = useFirestoreCrud('jobs')

  // Selections (no frame — Etsy handles framing)
  const [camera, setCamera] = useState(null)
  const [mockupRoom, setMockupRoom] = useState(null)
  const [mockupSize, setMockupSize] = useState(null)
  const [mockupLighting, setMockupLighting] = useState(null)
  const [etsyTags, setEtsyTags] = useState([])
  const [model, setModel] = useState('fal-ai/flux/dev')
  const [resolution, setResolution] = useState('2K')
  const [negativePrompt, setNegativePrompt] = useState('blurry, low quality, cartoon, illustration, painting')
  const [tab, setTab] = useState('build') // 'build' | 'saved'
  const [artworks, setArtworks] = useState([]) // selected images: { id, url }
  const [isSubmitting, setIsSubmitting] = useState(false)
  const usesArtwork = artworks.length > 0

  // Group concepts by type
  const byType = useMemo(() => {
    const map = {}
    for (const c of concepts) {
      if (!map[c.type]) map[c.type] = []
      map[c.type].push(c)
    }
    return map
  }, [concepts])

  const selections = { camera, mockupRoom, mockupSize, mockupLighting }

  const scenePrompt = useMemo(
    () => assembleMockupPrompt(selections),
    [camera, mockupRoom, mockupSize, mockupLighting]
  )
  const nanoPrompt = usesArtwork ? artworkInstruction(artworks.length) + scenePrompt : scenePrompt

  const toggleArtwork = (img) => {
    setArtworks((prev) => {
      if (prev.some((a) => a.id === img.id)) return prev.filter((a) => a.id !== img.id)
      if (prev.length >= MAX_ARTWORKS) {
        toast.error(`Up to ${MAX_ARTWORKS} artworks per mockup`)
        return prev
      }
      return [...prev, { id: img.id, url: img.url }]
    })
  }

  const promptName = useMemo(() => generateMockupPromptName(selections), [mockupRoom, mockupSize])

  // Collect etsy tags as comma-separated string
  const etsyTagString = useMemo(() => {
    return etsyTags.map(t => t.value).join(', ')
  }, [etsyTags])

  const handleSavePrompt = async () => {
    await promptsCrud.add({
      name: promptName,
      nanoPrompt,
      category: 'mockup',
      conceptRefs: {
        camera: camera?.id || null,
        mockupRoom: mockupRoom?.id || null,
        mockupSize: mockupSize?.id || null,
        mockupLighting: mockupLighting?.id || null,
        etsyTags: etsyTags.map((t) => t.id),
      },
      etsyTags: etsyTagString,
      formatParams: { aspectRatio: '1:1', orientation: 'square', size: 'mockup' },
      model,
      negativePrompt,
      generationCount: 0,
      bestImageId: null,
      status: 'active',
    })
  }

  const handleGenerate = async (variants = 1) => {
    setIsSubmitting(true)
    try {
      await submitJob(variants)
      toast.success(`Mockup${variants > 1 ? 's' : ''} queued — results land in Mockup Gallery`)
    } catch (err) {
      toast.error(`Could not queue mockup: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitJob = async (variants) => {
    const jobModel = usesArtwork ? EDIT_MODEL : model
    const promptId = await promptsCrud.add({
      name: promptName,
      nanoPrompt,
      category: 'mockup',
      conceptRefs: {
        camera: camera?.id || null,
        mockupRoom: mockupRoom?.id || null,
        mockupSize: mockupSize?.id || null,
        mockupLighting: mockupLighting?.id || null,
        etsyTags: etsyTags.map((t) => t.id),
      },
      etsyTags: etsyTagString,
      formatParams: { aspectRatio: '1:1', orientation: 'square', size: 'mockup' },
      model: jobModel,
      negativePrompt,
      referenceImageIds: artworks.map((a) => a.id),
      generationCount: 0,
      bestImageId: null,
      status: 'active',
    })

    await jobsCrud.add({
      promptId,
      promptText: nanoPrompt,
      category: 'mockup',
      model: jobModel,
      referenceImageIds: artworks.map((a) => a.id),
      modelParams: { ...DEFAULT_MODEL_PARAMS, aspectRatio: '1:1', resolution, width: 1024, height: 1024 },
      variants,
      status: 'queued',
      error: null,
      imageIds: [],
      cost: 0,
      startedAt: null,
      completedAt: null,
    })
  }

  const handleLoadPrompt = (prompt) => {
    const findConcept = (id) => concepts.find((c) => c.id === id) || null
    setCamera(findConcept(prompt.conceptRefs?.camera))
    setMockupRoom(findConcept(prompt.conceptRefs?.mockupRoom))
    setMockupSize(findConcept(prompt.conceptRefs?.mockupSize))
    setMockupLighting(findConcept(prompt.conceptRefs?.mockupLighting))
    setEtsyTags((prompt.conceptRefs?.etsyTags || []).map(findConcept).filter(Boolean))
    if (prompt.model) setModel(prompt.model)
    if (prompt.negativePrompt) setNegativePrompt(prompt.negativePrompt)
    setTab('build')
  }

  const inputStyle = {
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Mockup Builder" description="Create room scenes for Etsy listings — framing handled by Etsy" />

      {/* Tabs */}
      <div className="flex border-b px-6" style={{ borderColor: 'var(--color-border)' }}>
        {['build', 'saved'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2.5 text-sm font-medium capitalize cursor-pointer border-b-2 transition-colors"
            style={{
              borderColor: tab === t ? 'var(--color-primary)' : 'transparent',
              color: tab === t ? 'var(--color-primary)' : 'var(--color-text-muted)',
            }}
          >
            {t === 'saved' ? `Saved Mockups (${savedPrompts.length})` : 'Build Mockup'}
          </button>
        ))}
      </div>

      {tab === 'build' ? (
        <div className="flex-1 overflow-auto flex">
          {/* Left: pickers */}
          <div className="w-2/3 p-6 space-y-5 overflow-auto border-r" style={{ borderColor: 'var(--color-border)' }}>
            <ArtworkPicker selected={artworks} onToggle={toggleArtwork} onClear={() => setArtworks([])} />
            <ConceptPicker label="Camera - Mockup" concepts={byType.cameraMockup || []} selected={camera} onSelect={setCamera} />
            <ConceptPicker label="Room Scene" concepts={byType.mockupRoom || []} selected={mockupRoom} onSelect={setMockupRoom} />
            <ConceptPicker label="Size Display" concepts={byType.mockupSize || []} selected={mockupSize} onSelect={setMockupSize} />
            <ConceptPicker label="Lighting" concepts={byType.mockupLighting || []} selected={mockupLighting} onSelect={setMockupLighting} />
            <ConceptPicker label="Etsy Tags (metadata — not in prompt)" concepts={byType.etsyTags || []} selected={etsyTags} onSelect={setEtsyTags} multiple />
          </div>

          {/* Right: preview + actions */}
          <div className="w-1/3 p-6 flex flex-col gap-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Mockup Name</label>
              <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{promptName}</p>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Assembled Prompt</label>
              <div className="p-3 rounded-lg text-sm whitespace-pre-wrap min-h-24" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}>
                {nanoPrompt || 'Select mockup concepts to build a prompt...'}
              </div>
            </div>

            {etsyTagString && (
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Etsy Tags (saved as metadata)</label>
                <div className="p-3 rounded-lg text-xs" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-muted)' }}>
                  {etsyTagString}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Model</label>
              {usesArtwork ? (
                <p className="px-3 py-2 rounded-lg text-sm" style={inputStyle}>
                  Nano Banana 2 Edit — places your {artworks.length} artwork{artworks.length > 1 ? 's' : ''} in the room
                </p>
              ) : (
                <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle}>
                  {FAL_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} — {m.description}</option>
                  ))}
                </select>
              )}
            </div>

            {(usesArtwork || isNanoBanana(model)) && (
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Resolution</label>
                <select value={resolution} onChange={(e) => setResolution(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle}>
                  {NANO_RESOLUTIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            )}

            {!usesArtwork && <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Negative Prompt</label>
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                rows={2}
                placeholder="Things to avoid..."
                className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                style={inputStyle}
              />
            </div>}

            <div className="flex flex-col gap-2 mt-auto">
              <Button onClick={() => handleGenerate(1)} disabled={!mockupRoom || isSubmitting}>
                {isSubmitting ? 'Sending…' : 'Generate 1 Mockup'}
              </Button>
              <Button variant="secondary" onClick={() => handleGenerate(4)} disabled={!mockupRoom || isSubmitting}>
                Generate 4 Variants
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSavePrompt} disabled={!mockupRoom}>
                Save Mockup Prompt
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Saved mockup prompts */
        <div className="flex-1 overflow-auto p-6">
          {savedPrompts.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No saved mockup prompts yet.</p>
          ) : (
            <div className="space-y-2">
              {savedPrompts.map((p) => (
                <div
                  key={p.id}
                  className="p-4 rounded-lg border flex items-start justify-between cursor-pointer transition-colors"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderColor: 'var(--color-border)',
                  }}
                  onClick={() => handleLoadPrompt(p)}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface)')}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm" style={{ color: 'var(--color-text)' }}>{p.name}</p>
                    <p className="text-xs mt-1 truncate" style={{ color: 'var(--color-text-muted)' }}>{p.nanoPrompt}</p>
                    {p.etsyTags && (
                      <p className="text-[10px] mt-1 truncate" style={{ color: 'var(--color-primary)' }}>Tags: {p.etsyTags}</p>
                    )}
                  </div>
                  <span className="text-xs ml-4 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                    {p.generationCount || 0} runs
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Pick approved ("keep") images from a collection to place in the mockup
function ArtworkPicker({ selected, onToggle, onClear }) {
  const { collections } = useCollections()
  const [collectionSlug, setCollectionSlug] = useState('')

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          Artwork <span style={{ color: 'var(--color-text-muted)' }}>· optional, up to {MAX_ARTWORKS} · {selected.length} selected</span>
        </h3>
        {selected.length > 0 && (
          <button onClick={onClear} className="text-xs cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>Clear</button>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex gap-2 mb-3">
          {selected.map((a, i) => (
            <button key={a.id} onClick={() => onToggle(a)} title="Remove" className="relative w-16 h-16 rounded overflow-hidden cursor-pointer border-2" style={{ borderColor: 'var(--color-primary)' }}>
              <img src={a.url} alt="" className="w-full h-full object-cover" />
              <span className="absolute top-0.5 left-0.5 text-[10px] px-1 rounded" style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>{i + 1}</span>
            </button>
          ))}
        </div>
      )}

      <select
        value={collectionSlug}
        onChange={(e) => setCollectionSlug(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm"
        style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
      >
        <option value="">Choose a collection to pick approved images…</option>
        {collections.map((c) => (
          <option key={c.slug || c.id} value={c.slug || c.id}>{c.name}</option>
        ))}
      </select>

      {collectionSlug && <ApprovedImageGrid collectionSlug={collectionSlug} selected={selected} onToggle={onToggle} />}
    </div>
  )
}

// Mounted only once a collection is chosen, so we never subscribe to every image
function ApprovedImageGrid({ collectionSlug, selected, onToggle }) {
  const { documents: images, loading } = useCollection(
    'images',
    [{ field: 'collection', op: '==', value: collectionSlug }, { field: 'rating', op: '==', value: 'keep' }],
    null
  )

  if (loading) return <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
  if (images.length === 0) return <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>No approved images in this collection.</p>

  return (
    <div className="grid grid-cols-6 gap-2 mt-2 max-h-72 overflow-auto">
      {images.map((img) => {
        const index = selected.findIndex((a) => a.id === img.id)
        return (
          <button
            key={img.id}
            onClick={() => onToggle(img)}
            className="relative aspect-[3/4] rounded overflow-hidden cursor-pointer border-2"
            style={{ borderColor: index >= 0 ? 'var(--color-primary)' : 'transparent' }}
          >
            <img src={img.url} alt="" loading="lazy" className="w-full h-full object-cover" />
            {index >= 0 && (
              <span className="absolute top-1 left-1 text-[10px] px-1.5 rounded" style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>{index + 1}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
