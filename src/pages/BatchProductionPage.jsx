// Mug Batch Production Dashboard.
//
// Pipeline note:
//   Personas are NOT defined in code. They are the keep-rated images inside a
//   chosen "mug" collection (e.g. "Mug watercolor #1"). Each persona image is
//   used as a reference image for fal-ai/nano-banana-2/edit — the existing
//   `editJobs` Firestore trigger (see functions/index.js → processImageEdit)
//   handles the actual generation.
//
// Parallelism: Cloud Functions scale horizontally — each editJobs doc creation
// fires an independent function instance. We write jobs in chunks of 25 via
// writeBatch to let the user abort mid-dispatch if needed.
//
// Cost: Nano Banana 2 is ~$0.02/image.

import { useState, useMemo, useEffect } from 'react'
import { collection as fsCollection, doc, setDoc, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import PageHeader from '../components/common/PageHeader'
import Button from '../components/common/Button'
import Badge from '../components/common/Badge'
import ListingPanel from '../components/ListingPanel'
import { useCollection, useFirestoreCrud } from '../hooks/useFirestore'
import { useCollections } from '../hooks/useCollections'
import { RATING_KEYS, RATING_COLORS } from '../lib/imageUtils'
import {
  DEFAULT_STYLE_MODIFIERS,
  STYLE_LABELS,
  GENDER_LABELS,
  CLOTHING_OPTIONS,
  CLOTHING_COLORS,
  HEADWEAR_OPTIONS,
  HAIR_STYLES,
  HAIR_COLORS,
  SKIN_TONES,
  assembleMugEditPrompt,
} from '../lib/mugPromptAssembler'

const COST_PER_IMAGE = 0.02
const WRITE_CHUNK_SIZE = 25
const BATCH_WARNING_THRESHOLD = 200

const STYLE_KEYS = ['watercolor', 'pencil', 'bold', 'pixel']
const GENDER_KEYS = ['original', 'female', 'male']
const CLOTHING_KEYS = Object.keys(CLOTHING_OPTIONS)
const CLOTHING_COLOR_KEYS = Object.keys(CLOTHING_COLORS)
const HAIR_STYLE_KEYS = Object.keys(HAIR_STYLES)
const HAIR_COLOR_KEYS = Object.keys(HAIR_COLORS)
const SKIN_TONE_KEYS = Object.keys(SKIN_TONES)
const HEADWEAR_KEYS = Object.keys(HEADWEAR_OPTIONS)

function newBatchId() {
  const d = new Date()
  const iso = d.toISOString().slice(0, 10)
  const rand = Math.random().toString(36).slice(2, 6)
  return `batch_${iso}_${rand}`
}

// Treat empty selection as "no variation on this axis" — 1 factor.
function orSingle(set) {
  return set.size === 0 ? 1 : set.size
}

export default function BatchProductionPage() {
  const { collections } = useCollections()

  const defaultCollectionSlug = useMemo(() => {
    if (!collections.length) return ''
    const mug = collections.find((c) => /mug/i.test(c.name || c.slug || ''))
    return (mug || collections[0]).slug
  }, [collections])

  const [collectionSlug, setCollectionSlug] = useState('')
  useEffect(() => {
    if (!collectionSlug && defaultCollectionSlug) setCollectionSlug(defaultCollectionSlug)
  }, [defaultCollectionSlug, collectionSlug])

  const personaFilters = useMemo(
    () =>
      collectionSlug
        ? [
            { field: 'collection', op: '==', value: collectionSlug },
            { field: 'rating', op: '==', value: 'keep' },
          ]
        : [{ field: 'collection', op: '==', value: '__none__' }],
    [collectionSlug]
  )
  const { documents: personas, loading: personasLoading } = useCollection(
    'images',
    personaFilters,
    'createdAt'
  )

  // Matrix state
  const [selectedPersonaIds, setSelectedPersonaIds] = useState(new Set())
  const [selectedStyles, setSelectedStyles] = useState(new Set(['pencil', 'bold']))
  const [selectedGenders, setSelectedGenders] = useState(new Set(['original']))
  const [selectedClothing, setSelectedClothing] = useState(new Set(['smart-casual']))
  const [selectedClothingColors, setSelectedClothingColors] = useState(new Set(['neutral']))
  const [selectedHairStyles, setSelectedHairStyles] = useState(new Set(['messy-bun']))
  const [selectedHairColors, setSelectedHairColors] = useState(new Set(['brown']))
  const [selectedSkinTones, setSelectedSkinTones] = useState(new Set(['default']))
  const [selectedHeadwear, setSelectedHeadwear] = useState(new Set(['none']))
  const [styleModifiers, setStyleModifiers] = useState(DEFAULT_STYLE_MODIFIERS)

  useEffect(() => {
    setSelectedPersonaIds(new Set())
  }, [collectionSlug])

  const hairCombos = orSingle(selectedHairStyles) * orSingle(selectedHairColors)
  const totalJobs =
    selectedPersonaIds.size *
    orSingle(selectedGenders) *
    orSingle(selectedStyles) *
    orSingle(selectedClothing) *
    orSingle(selectedClothingColors) *
    hairCombos *
    orSingle(selectedSkinTones) *
    orSingle(selectedHeadwear)
  const totalCost = (totalJobs * COST_PER_IMAGE).toFixed(2)

  const [dispatching, setDispatching] = useState(false)
  const [activeBatchId, setActiveBatchId] = useState(null)
  const [dispatchProgress, setDispatchProgress] = useState({ written: 0, total: 0 })

  const upscaleJobsCrud = useFirestoreCrud('upscaleJobs')
  const [personaUpscaling, setPersonaUpscaling] = useState(new Set())
  const [personaListingImage, setPersonaListingImage] = useState(null)

  const handlePersonaUpscale = async (imageId) => {
    if (personaUpscaling.has(imageId)) return
    setPersonaUpscaling((prev) => new Set([...prev, imageId]))
    try {
      await upscaleJobsCrud.add({
        imageId,
        status: 'queued',
        error: null,
        startedAt: null,
        completedAt: null,
      })
    } catch (err) {
      alert(`Upscale failed: ${err.message}`)
      setPersonaUpscaling((prev) => {
        const next = new Set(prev)
        next.delete(imageId)
        return next
      })
    }
  }

  useEffect(() => {
    for (const imageId of personaUpscaling) {
      const p = personas.find((x) => x.id === imageId)
      if (p?.upscaled) {
        setPersonaUpscaling((prev) => {
          const next = new Set(prev)
          next.delete(imageId)
          return next
        })
      }
    }
  }, [personas, personaUpscaling])

  const handleToggle = (set, setter, value) => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    setter(next)
  }

  const handleSelectAllPersonas = () => {
    setSelectedPersonaIds(new Set(personas.map((p) => p.id)))
  }

  const handleClearPersonas = () => setSelectedPersonaIds(new Set())

  const handleGenerate = async () => {
    if (totalJobs === 0 || dispatching) return
    const confirmed = window.confirm(
      `Generate ${totalJobs} images for ~$${totalCost}?`
    )
    if (!confirmed) return

    setDispatching(true)
    const batchId = newBatchId()
    setDispatchProgress({ written: 0, total: totalJobs })

    // Helper: expand a set to its array, or [null] if empty.
    const axis = (set) => (set.size ? [...set] : [null])

    const personaDocs = personas.filter((p) => selectedPersonaIds.has(p.id))
    const collectionDoc = collections.find((c) => c.slug === collectionSlug)
    const jobs = []

    for (const persona of personaDocs) {
      for (const gender of axis(selectedGenders)) {
        for (const style of axis(selectedStyles)) {
          for (const clothing of axis(selectedClothing)) {
            for (const clothingColor of axis(selectedClothingColors)) {
              for (const hairStyle of axis(selectedHairStyles)) {
                for (const hairColor of axis(selectedHairColors)) {
                  for (const skinTone of axis(selectedSkinTones)) {
                    for (const headwear of axis(selectedHeadwear)) {
                      const styleModifier = style ? styleModifiers[style] : ''
                      const prompt = assembleMugEditPrompt({
                        styleModifier,
                        gender: gender || 'original',
                        clothing,
                        clothingColor,
                        hairStyle,
                        hairColor,
                        skinTone,
                        headwear,
                      })
                      jobs.push({
                        imageId: persona.id,
                        prompt,
                        numImages: 1,
                        resolution: '1K',
                        status: 'queued',
                        batchId,
                        personaId: persona.id,
                        personaName:
                          persona.personaName ||
                          persona.promptText?.slice(0, 60) ||
                          `Persona ${persona.id.slice(0, 6)}`,
                        style,
                        gender: gender || 'original',
                        clothing,
                        clothingColor,
                        hairStyle,
                        hairColor,
                        skinTone,
                        headwear,
                        store: 'shop-a-mug',
                        sourceCollectionSlug: collectionSlug,
                      })
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    const batchRef = doc(fsCollection(db, 'mugBatches'), batchId)
    const batchDoc = {
      label: `${collectionDoc?.name || collectionSlug} — ${[...selectedStyles].join(', ') || '—'}`,
      collectionSlug,
      collectionName: collectionDoc?.name || collectionSlug,
      personaCount: personaDocs.length,
      styles: [...selectedStyles],
      genders: [...selectedGenders],
      clothing: [...selectedClothing],
      clothingColors: [...selectedClothingColors],
      hairStyles: [...selectedHairStyles],
      hairColors: [...selectedHairColors],
      skinTones: [...selectedSkinTones],
      headwear: [...selectedHeadwear],
      totalJobs,
      store: 'shop-a-mug',
      createdAt: serverTimestamp(),
    }

    try {
      await setDoc(batchRef, batchDoc)

      // Sequential addDoc avoids the writeBatch path in firebase-js-sdk 11.10.0
      // which has a known b815 internal-assertion regression on retry.
      let written = 0
      for (const job of jobs) {
        await addDoc(fsCollection(db, 'editJobs'), {
          ...job,
          createdAt: serverTimestamp(),
        })
        written += 1
        if (written % 5 === 0 || written === jobs.length) {
          setDispatchProgress({ written, total: jobs.length })
        }
      }
      // Only attach listeners (progress + curation) AFTER all writes land.
      setActiveBatchId(batchId)
    } catch (err) {
      console.error('Batch dispatch failed:', err)
      alert(`Batch dispatch failed: ${err.message}`)
    } finally {
      setDispatching(false)
    }
  }

  const breakdown = {
    Personas: selectedPersonaIds.size,
    Genders: orSingle(selectedGenders),
    Styles: orSingle(selectedStyles),
    Clothing: orSingle(selectedClothing),
    'Clothing color': orSingle(selectedClothingColors),
    'Hair combos': hairCombos,
    'Skin tones': orSingle(selectedSkinTones),
    Headwear: orSingle(selectedHeadwear),
  }

  // Preview = the first combination in the matrix.
  const samplePrompt = useMemo(() => {
    const first = (set) => (set.size ? [...set][0] : null)
    const style = first(selectedStyles)
    const styleModifier = style ? styleModifiers[style] : ''
    return assembleMugEditPrompt({
      styleModifier,
      gender: first(selectedGenders) || 'original',
      clothing: first(selectedClothing),
      clothingColor: first(selectedClothingColors),
      hairStyle: first(selectedHairStyles),
      hairColor: first(selectedHairColors),
      skinTone: first(selectedSkinTones),
      headwear: first(selectedHeadwear),
    })
  }, [
    selectedStyles,
    selectedGenders,
    selectedClothing,
    selectedClothingColors,
    selectedHairStyles,
    selectedHairColors,
    selectedSkinTones,
    selectedHeadwear,
    styleModifiers,
  ])

  return (
    <div>
      <PageHeader
        title="Mug Batch Production"
        description="Generate style + appearance variants from approved personas via Nano Banana 2 edit"
      />
      <div className="p-6 space-y-8 max-w-7xl">
        <ConfigPanel
          collections={collections}
          collectionSlug={collectionSlug}
          onCollectionChange={setCollectionSlug}
          personas={personas}
          personasLoading={personasLoading}
          selectedPersonaIds={selectedPersonaIds}
          onTogglePersona={(id) => handleToggle(selectedPersonaIds, setSelectedPersonaIds, id)}
          onSelectAllPersonas={handleSelectAllPersonas}
          onClearPersonas={handleClearPersonas}
          upscaling={personaUpscaling}
          onUpscale={handlePersonaUpscale}
          onOpenListing={setPersonaListingImage}
          selectedStyles={selectedStyles}
          onToggleStyle={(s) => handleToggle(selectedStyles, setSelectedStyles, s)}
          selectedGenders={selectedGenders}
          onToggleGender={(g) => handleToggle(selectedGenders, setSelectedGenders, g)}
          selectedClothing={selectedClothing}
          onToggleClothing={(c) => handleToggle(selectedClothing, setSelectedClothing, c)}
          selectedClothingColors={selectedClothingColors}
          onToggleClothingColor={(c) =>
            handleToggle(selectedClothingColors, setSelectedClothingColors, c)
          }
          selectedHairStyles={selectedHairStyles}
          onToggleHairStyle={(h) => handleToggle(selectedHairStyles, setSelectedHairStyles, h)}
          selectedHairColors={selectedHairColors}
          onToggleHairColor={(h) => handleToggle(selectedHairColors, setSelectedHairColors, h)}
          selectedSkinTones={selectedSkinTones}
          onToggleSkinTone={(s) => handleToggle(selectedSkinTones, setSelectedSkinTones, s)}
          selectedHeadwear={selectedHeadwear}
          onToggleHeadwear={(h) => handleToggle(selectedHeadwear, setSelectedHeadwear, h)}
          styleModifiers={styleModifiers}
          onStyleModifierChange={(style, value) =>
            setStyleModifiers((prev) => ({ ...prev, [style]: value }))
          }
          breakdown={breakdown}
          samplePrompt={samplePrompt}
          totalJobs={totalJobs}
          totalCost={totalCost}
          onGenerate={handleGenerate}
          dispatching={dispatching}
          dispatchProgress={dispatchProgress}
        />

        <BatchList activeBatchId={activeBatchId} onSelectBatch={setActiveBatchId} />

        {activeBatchId && <BatchProgress batchId={activeBatchId} />}

        {activeBatchId && <CurationGallery batchId={activeBatchId} />}
      </div>

      {personaListingImage && (
        <ListingPanel
          image={
            personas.find((p) => p.id === personaListingImage.id) || personaListingImage
          }
          onClose={() => setPersonaListingImage(null)}
        />
      )}
    </div>
  )
}

// ─── Config Panel ───────────────────────────────────────────────────────────

function ConfigPanel({
  collections,
  collectionSlug,
  onCollectionChange,
  personas,
  personasLoading,
  selectedPersonaIds,
  onTogglePersona,
  onSelectAllPersonas,
  onClearPersonas,
  upscaling,
  onUpscale,
  onOpenListing,
  selectedStyles,
  onToggleStyle,
  selectedGenders,
  onToggleGender,
  selectedClothing,
  onToggleClothing,
  selectedClothingColors,
  onToggleClothingColor,
  selectedHairStyles,
  onToggleHairStyle,
  selectedHairColors,
  onToggleHairColor,
  selectedSkinTones,
  onToggleSkinTone,
  selectedHeadwear,
  onToggleHeadwear,
  styleModifiers,
  onStyleModifierChange,
  breakdown,
  samplePrompt,
  totalJobs,
  totalCost,
  onGenerate,
  dispatching,
  dispatchProgress,
}) {
  const overThreshold = totalJobs > BATCH_WARNING_THRESHOLD

  return (
    <section
      className="rounded-lg p-6 space-y-6"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <SectionHeading>1 · Source Collection</SectionHeading>
      <select
        value={collectionSlug}
        onChange={(e) => onCollectionChange(e.target.value)}
        className="w-full max-w-md rounded px-3 py-2 text-sm"
        style={{
          backgroundColor: 'var(--color-bg)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
        }}
      >
        {collections.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>

      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionHeading>
            2 · Personas ({selectedPersonaIds.size}/{personas.length} selected)
          </SectionHeading>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={onSelectAllPersonas}>
              Select all
            </Button>
            <Button size="sm" variant="ghost" onClick={onClearPersonas}>
              Clear
            </Button>
          </div>
        </div>
        {personasLoading ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Loading personas…</p>
        ) : personas.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>
            No approved (keep-rated) images in this collection yet. Rate some images as "keep" in
            the gallery to use them as personas.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {personas.map((p) => {
              const selected = selectedPersonaIds.has(p.id)
              const isUpscaling = upscaling.has(p.id)
              return (
                <div
                  key={p.id}
                  className="rounded overflow-hidden transition-opacity"
                  style={{
                    border: selected
                      ? '3px solid var(--color-primary)'
                      : '1px solid var(--color-border)',
                    opacity: selected ? 1 : 0.75,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onTogglePersona(p.id)}
                    className="relative block w-full aspect-square cursor-pointer"
                    style={{ padding: 0, border: 0, background: 'transparent' }}
                  >
                    <img
                      src={p.url}
                      alt={p.id}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {selected && (
                      <div
                        className="absolute top-1 right-1 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
                      >
                        ✓
                      </div>
                    )}
                  </button>
                  <div className="flex gap-1 p-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!p.upscaled) onUpscale(p.id)
                      }}
                      disabled={p.upscaled || isUpscaling}
                      className="flex-1 rounded text-[10px] py-1 cursor-pointer disabled:cursor-default"
                      style={{
                        backgroundColor: p.upscaled
                          ? 'rgba(168, 85, 247, 0.15)'
                          : 'var(--color-bg)',
                        color: p.upscaled ? '#a855f7' : 'var(--color-text)',
                        border: `1px solid ${p.upscaled ? 'rgba(168, 85, 247, 0.4)' : 'var(--color-border)'}`,
                      }}
                    >
                      {p.upscaled
                        ? `Up ${p.upscaleScale || 4}x`
                        : isUpscaling
                        ? 'Upscaling…'
                        : 'Upscale'}
                    </button>
                    {p.upscaled && (p.urlPrint || p.url) && (
                      <a
                        href={p.urlPrint || p.url}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title={p.urlPrint ? 'Download print version' : 'Download upscaled'}
                        className="rounded text-[10px] py-1 px-2 cursor-pointer text-center"
                        style={{
                          backgroundColor: 'rgba(168, 85, 247, 0.15)',
                          color: '#a855f7',
                          border: '1px solid rgba(168, 85, 247, 0.4)',
                        }}
                      >
                        ↓
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenListing(p)
                      }}
                      className="flex-1 rounded text-[10px] py-1 cursor-pointer"
                      style={{
                        backgroundColor:
                          p.listing?.status === 'published'
                            ? 'rgba(166, 227, 161, 0.15)'
                            : 'var(--color-primary)',
                        color: p.listing?.status === 'published' ? '#a6e3a1' : '#fff',
                        border:
                          p.listing?.status === 'published'
                            ? '1px solid rgba(166, 227, 161, 0.4)'
                            : '1px solid var(--color-primary)',
                      }}
                    >
                      {p.listing?.status === 'published'
                        ? 'Published ✓'
                        : p.listing?.status === 'ready' || p.listing?.status === 'draft'
                        ? 'Edit Listing'
                        : 'Listing'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <SectionHeading>3 · Styles</SectionHeading>
        <div className="flex flex-wrap gap-2 mb-4">
          {STYLE_KEYS.map((s) => (
            <Checkbox
              key={s}
              label={STYLE_LABELS[s]}
              checked={selectedStyles.has(s)}
              onChange={() => onToggleStyle(s)}
            />
          ))}
        </div>
        <div className="space-y-3">
          {[...selectedStyles].map((s) => (
            <div key={s}>
              <label
                className="block text-xs mb-1 font-mono"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {STYLE_LABELS[s]} modifier
              </label>
              <textarea
                value={styleModifiers[s]}
                onChange={(e) => onStyleModifierChange(s, e.target.value)}
                rows={2}
                className="w-full rounded px-3 py-2 text-sm font-mono"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionHeading>4 · Gender variants</SectionHeading>
        <div className="flex flex-wrap gap-2">
          {GENDER_KEYS.map((g) => (
            <Checkbox
              key={g}
              label={GENDER_LABELS[g]}
              checked={selectedGenders.has(g)}
              onChange={() => onToggleGender(g)}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionHeading>5 · Clothing style</SectionHeading>
        <div className="flex flex-wrap gap-2">
          {CLOTHING_KEYS.map((c) => (
            <Checkbox
              key={c}
              label={CLOTHING_OPTIONS[c].label}
              checked={selectedClothing.has(c)}
              onChange={() => onToggleClothing(c)}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionHeading>6 · Clothing color</SectionHeading>
        <div className="flex flex-wrap gap-2">
          {CLOTHING_COLOR_KEYS.map((c) => (
            <Checkbox
              key={c}
              label={CLOTHING_COLORS[c].label}
              checked={selectedClothingColors.has(c)}
              onChange={() => onToggleClothingColor(c)}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionHeading>7 · Hair</SectionHeading>
        <p className="text-xs mb-2 font-mono" style={{ color: 'var(--color-text-muted)' }}>
          Length / style
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {HAIR_STYLE_KEYS.map((h) => (
            <Checkbox
              key={h}
              label={HAIR_STYLES[h].label}
              checked={selectedHairStyles.has(h)}
              onChange={() => onToggleHairStyle(h)}
            />
          ))}
        </div>
        <p className="text-xs mb-2 font-mono" style={{ color: 'var(--color-text-muted)' }}>
          Color
        </p>
        <div className="flex flex-wrap gap-2">
          {HAIR_COLOR_KEYS.map((h) => (
            <Checkbox
              key={h}
              label={HAIR_COLORS[h].label}
              checked={selectedHairColors.has(h)}
              onChange={() => onToggleHairColor(h)}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionHeading>8 · Skin tone</SectionHeading>
        <div className="flex flex-wrap gap-2">
          {SKIN_TONE_KEYS.map((s) => (
            <Checkbox
              key={s}
              label={SKIN_TONES[s].label}
              checked={selectedSkinTones.has(s)}
              onChange={() => onToggleSkinTone(s)}
            />
          ))}
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
          "Default" keeps whatever tone the model picks, giving you an unspecified baseline
          alongside explicitly selected tones.
        </p>
      </div>

      <div>
        <SectionHeading>9 · Headwear</SectionHeading>
        <div className="flex flex-wrap gap-2">
          {HEADWEAR_KEYS.map((h) => (
            <Checkbox
              key={h}
              label={HEADWEAR_OPTIONS[h].label}
              checked={selectedHeadwear.has(h)}
              onChange={() => onToggleHeadwear(h)}
            />
          ))}
        </div>
      </div>

      <div
        className="pt-4 space-y-3"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        <div>
          <p className="text-xs font-mono mb-2" style={{ color: 'var(--color-text-muted)' }}>
            Matrix breakdown
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
            {Object.entries(breakdown).map(([k, v]) => (
              <span key={k} style={{ color: 'var(--color-text-muted)' }}>
                {k}: <span style={{ color: 'var(--color-text)' }}>{v}</span>
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-mono mb-2" style={{ color: 'var(--color-text-muted)' }}>
            Sample prompt (first matrix combination)
          </p>
          <pre
            className="text-xs rounded px-3 py-2 font-mono whitespace-pre-wrap"
            style={{
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            {samplePrompt}
          </pre>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Model: <span className="font-mono">fal-ai/nano-banana-2/edit</span>
            </p>
            <p className="text-lg font-semibold mt-1" style={{ color: 'var(--color-text)' }}>
              {totalJobs} images · ~${totalCost}
            </p>
            {dispatching && (
              <p className="text-xs mt-1" style={{ color: 'var(--color-primary)' }}>
                Dispatching {dispatchProgress.written}/{dispatchProgress.total}…
              </p>
            )}
          </div>
          <Button size="lg" onClick={onGenerate} disabled={totalJobs === 0 || dispatching}>
            {dispatching ? 'Dispatching…' : `Generate ${totalJobs || 0} images`}
          </Button>
        </div>

        {overThreshold && (
          <div
            className="rounded px-3 py-2 text-xs"
            style={{
              backgroundColor: 'rgba(249, 226, 175, 0.15)',
              border: '1px solid rgba(249, 226, 175, 0.5)',
              color: '#f9e2af',
            }}
          >
            ⚠️ Large batch ({totalJobs} images). Consider narrowing personas or reducing variation
            axes — curating 200+ images quickly becomes slow.
          </div>
        )}
      </div>
    </section>
  )
}

// ─── Batch list ─────────────────────────────────────────────────────────────

function BatchList({ activeBatchId, onSelectBatch }) {
  const { documents: batches } = useCollection('mugBatches', [], 'createdAt')
  if (!batches.length) return null
  return (
    <section>
      <SectionHeading>Recent batches</SectionHeading>
      <div className="flex flex-wrap gap-2">
        {batches.map((b) => {
          const selected = b.id === activeBatchId
          return (
            <button
              key={b.id}
              onClick={() => onSelectBatch(b.id)}
              className="rounded px-3 py-2 text-left text-xs cursor-pointer"
              style={{
                backgroundColor: selected
                  ? 'var(--color-surface-hover)'
                  : 'var(--color-surface)',
                border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                color: 'var(--color-text)',
                minWidth: 200,
              }}
            >
              <div className="font-semibold">{b.label || b.id}</div>
              <div className="font-mono mt-1" style={{ color: 'var(--color-text-muted)' }}>
                {b.totalJobs} jobs · {(b.styles || []).join(', ')}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ─── Progress tracker ───────────────────────────────────────────────────────

function BatchProgress({ batchId }) {
  const filters = useMemo(() => [{ field: 'batchId', op: '==', value: batchId }], [batchId])
  const { documents: jobs } = useCollection('editJobs', filters, 'createdAt')

  const counts = useMemo(() => {
    const c = { queued: 0, processing: 0, completed: 0, failed: 0 }
    for (const j of jobs) {
      if (c[j.status] !== undefined) c[j.status]++
    }
    return c
  }, [jobs])

  const total = jobs.length
  const done = counts.completed + counts.failed
  const pct = total ? Math.round((done / total) * 100) : 0

  return (
    <section
      className="rounded-lg p-4"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <SectionHeading>Progress · {batchId}</SectionHeading>
        <span className="text-sm font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {done}/{total} · {pct}%
        </span>
      </div>
      <div
        className="w-full rounded-full h-2 overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg)' }}
      >
        <div
          className="h-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: 'var(--color-primary)',
          }}
        />
      </div>
      <div className="flex gap-4 mt-3 text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
        <span>✅ {counts.completed} done</span>
        <span>🔄 {counts.processing} processing</span>
        <span>⏳ {counts.queued} queued</span>
        <span style={{ color: counts.failed ? 'var(--color-reject)' : undefined }}>
          ❌ {counts.failed} failed
        </span>
      </div>
    </section>
  )
}

// ─── Curation gallery ───────────────────────────────────────────────────────

function CurationGallery({ batchId }) {
  const filters = useMemo(() => [{ field: 'batchId', op: '==', value: batchId }], [batchId])
  const { documents: images } = useCollection('images', filters, 'createdAt')
  const upscaleJobsCrud = useFirestoreCrud('upscaleJobs')

  const [filterPersona, setFilterPersona] = useState('all')
  const [filterStyle, setFilterStyle] = useState('all')
  const [filterClothing, setFilterClothing] = useState('all')
  const [filterHairColor, setFilterHairColor] = useState('all')
  const [filterSkinTone, setFilterSkinTone] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [upscaling, setUpscaling] = useState(new Set())
  const [listingImage, setListingImage] = useState(null)

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
    } catch (err) {
      alert(`Upscale failed: ${err.message}`)
      setUpscaling((prev) => {
        const next = new Set(prev)
        next.delete(imageId)
        return next
      })
    }
  }

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

  const personas = useMemo(() => {
    const seen = new Map()
    for (const img of images) {
      if (img.personaId && !seen.has(img.personaId))
        seen.set(img.personaId, img.personaName || img.personaId)
    }
    return [...seen.entries()]
  }, [images])

  const filtered = useMemo(() => {
    return images.filter((img) => {
      if (filterPersona !== 'all' && img.personaId !== filterPersona) return false
      if (filterStyle !== 'all' && img.style !== filterStyle) return false
      if (filterClothing !== 'all' && img.clothing !== filterClothing) return false
      if (filterHairColor !== 'all' && img.hairColor !== filterHairColor) return false
      if (filterSkinTone !== 'all' && img.skinTone !== filterSkinTone) return false
      if (filterStatus !== 'all') {
        const status = ['keep', 'maybe', 'reject'].includes(img.rating) ? img.rating : 'unrated'
        if (filterStatus !== status) return false
      }
      return true
    })
  }, [images, filterPersona, filterStyle, filterClothing, filterHairColor, filterSkinTone, filterStatus])

  useEffect(() => {
    if (!filtered.length) return
    const onKey = async (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      const currentIdx = selectedId ? filtered.findIndex((img) => img.id === selectedId) : -1

      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        const next = filtered[Math.min(currentIdx + 1, filtered.length - 1)] || filtered[0]
        setSelectedId(next.id)
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const prev = filtered[Math.max(currentIdx - 1, 0)] || filtered[0]
        setSelectedId(prev.id)
        return
      }
      const rating = RATING_KEYS[e.key]
      if (rating && selectedId) {
        const { updateDoc, doc: docRef } = await import('firebase/firestore')
        await updateDoc(docRef(db, 'images', selectedId), { rating })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered, selectedId])

  if (!images.length) {
    return (
      <section>
        <SectionHeading>Curation</SectionHeading>
        <p style={{ color: 'var(--color-text-muted)' }}>
          No images for this batch yet — they'll appear as generation completes.
        </p>
      </section>
    )
  }

  const handleRate = async (imageId, rating) => {
    const { updateDoc, doc: docRef } = await import('firebase/firestore')
    await updateDoc(docRef(db, 'images', imageId), { rating })
  }

  return (
    <section className="space-y-4">
      <SectionHeading>Curation · {images.length} images</SectionHeading>
      <div className="flex flex-wrap gap-3">
        <FilterSelect label="Persona" value={filterPersona} onChange={setFilterPersona}>
          <option value="all">All personas</option>
          {personas.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Style" value={filterStyle} onChange={setFilterStyle}>
          <option value="all">All styles</option>
          {STYLE_KEYS.map((s) => (
            <option key={s} value={s}>
              {STYLE_LABELS[s]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Clothing" value={filterClothing} onChange={setFilterClothing}>
          <option value="all">All clothing</option>
          {CLOTHING_KEYS.map((c) => (
            <option key={c} value={c}>
              {CLOTHING_OPTIONS[c].label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Hair" value={filterHairColor} onChange={setFilterHairColor}>
          <option value="all">All hair colors</option>
          {HAIR_COLOR_KEYS.map((h) => (
            <option key={h} value={h}>
              {HAIR_COLORS[h].label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Skin" value={filterSkinTone} onChange={setFilterSkinTone}>
          <option value="all">All skin tones</option>
          {SKIN_TONE_KEYS.map((s) => (
            <option key={s} value={s}>
              {SKIN_TONES[s].label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Status" value={filterStatus} onChange={setFilterStatus}>
          <option value="all">All</option>
          <option value="unrated">Unrated</option>
          <option value="keep">Keep</option>
          <option value="maybe">Maybe</option>
          <option value="reject">Reject</option>
        </FilterSelect>
      </div>
      <p className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
        Keyboard: 1 = keep · 2 = maybe · 3 = reject · ←/→ = navigate
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((img) => {
          const isSelected = img.id === selectedId
          const rating = img.rating || 'unrated'
          return (
            <div
              key={img.id}
              onClick={() => setSelectedId(img.id)}
              className="rounded-lg overflow-hidden cursor-pointer"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: isSelected
                  ? '3px solid var(--color-primary)'
                  : `1px solid ${RATING_COLORS[rating] || 'var(--color-border)'}`,
              }}
            >
              <img src={img.url} alt={img.id} className="w-full aspect-square object-cover" />
              <div className="p-2 space-y-1">
                <div className="flex flex-wrap gap-1">
                  <Badge>{img.style || '—'}</Badge>
                  {img.gender && img.gender !== 'original' && <Badge>{img.gender}</Badge>}
                  {img.clothing && <Badge>{CLOTHING_OPTIONS[img.clothing]?.label || img.clothing}</Badge>}
                  {img.hairColor && <Badge>{HAIR_COLORS[img.hairColor]?.label || img.hairColor}</Badge>}
                  {img.skinTone && img.skinTone !== 'default' && (
                    <Badge>{SKIN_TONES[img.skinTone]?.label || img.skinTone}</Badge>
                  )}
                  <Badge color={RATING_COLORS[rating]}>{rating}</Badge>
                </div>
                <p
                  className="text-xs truncate"
                  style={{ color: 'var(--color-text-muted)' }}
                  title={img.personaName}
                >
                  {img.personaName || '—'}
                </p>
                {img.editPrompt && (
                  <details className="text-xs" onClick={(e) => e.stopPropagation()}>
                    <summary
                      className="cursor-pointer font-mono"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      Prompt
                    </summary>
                    <pre
                      className="mt-1 whitespace-pre-wrap font-mono rounded p-2"
                      style={{
                        backgroundColor: 'var(--color-bg)',
                        color: 'var(--color-text)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      {img.editPrompt}
                    </pre>
                  </details>
                )}
                <div className="flex gap-1 pt-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRate(img.id, 'keep')
                    }}
                    className="flex-1 rounded text-xs py-1 cursor-pointer"
                    style={{ backgroundColor: RATING_COLORS.keep, color: '#1e1e2e' }}
                  >
                    ✓
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRate(img.id, 'maybe')
                    }}
                    className="flex-1 rounded text-xs py-1 cursor-pointer"
                    style={{ backgroundColor: RATING_COLORS.maybe, color: '#1e1e2e' }}
                  >
                    ?
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRate(img.id, 'reject')
                    }}
                    className="flex-1 rounded text-xs py-1 cursor-pointer"
                    style={{ backgroundColor: RATING_COLORS.reject, color: '#1e1e2e' }}
                  >
                    ✗
                  </button>
                </div>
                <div className="flex gap-1 pt-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!img.upscaled) handleUpscale(img.id)
                    }}
                    disabled={img.upscaled || upscaling.has(img.id)}
                    className="flex-1 rounded text-xs py-1 cursor-pointer disabled:cursor-default"
                    style={{
                      backgroundColor: img.upscaled
                        ? 'rgba(168, 85, 247, 0.15)'
                        : 'var(--color-bg)',
                      color: img.upscaled ? '#a855f7' : 'var(--color-text)',
                      border: `1px solid ${img.upscaled ? 'rgba(168, 85, 247, 0.4)' : 'var(--color-border)'}`,
                    }}
                  >
                    {img.upscaled
                      ? `Upscaled ${img.upscaleScale || 4}x`
                      : upscaling.has(img.id)
                      ? 'Upscaling…'
                      : 'Upscale'}
                  </button>
                  {img.upscaled && (img.urlPrint || img.url) && (
                    <a
                      href={img.urlPrint || img.url}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title={img.urlPrint ? 'Download print version' : 'Download upscaled'}
                      className="rounded text-xs py-1 px-2 cursor-pointer text-center"
                      style={{
                        backgroundColor: 'rgba(168, 85, 247, 0.15)',
                        color: '#a855f7',
                        border: '1px solid rgba(168, 85, 247, 0.4)',
                      }}
                    >
                      ↓
                    </a>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setListingImage(img)
                    }}
                    className="flex-1 rounded text-xs py-1 cursor-pointer"
                    style={{
                      backgroundColor:
                        img.listing?.status === 'published'
                          ? 'rgba(166, 227, 161, 0.15)'
                          : 'var(--color-primary)',
                      color: img.listing?.status === 'published' ? '#a6e3a1' : '#fff',
                      border:
                        img.listing?.status === 'published'
                          ? '1px solid rgba(166, 227, 161, 0.4)'
                          : '1px solid var(--color-primary)',
                    }}
                  >
                    {img.listing?.status === 'published'
                      ? 'Published ✓'
                      : img.listing?.status === 'ready' || img.listing?.status === 'draft'
                      ? 'Edit Listing'
                      : 'Listing'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {listingImage && (
        <ListingPanel
          image={images.find((i) => i.id === listingImage.id) || listingImage}
          onClose={() => setListingImage(null)}
        />
      )}
    </section>
  )
}

// ─── small UI helpers ──────────────────────────────────────────────────────

function SectionHeading({ children }) {
  return (
    <h3
      className="text-sm font-semibold uppercase tracking-wide mb-3"
      style={{ color: 'var(--color-text-muted)' }}
    >
      {children}
    </h3>
  )
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label
      className="flex items-center gap-2 rounded px-3 py-2 cursor-pointer text-sm"
      style={{
        backgroundColor: checked ? 'var(--color-surface-hover)' : 'var(--color-bg)',
        border: `1px solid ${checked ? 'var(--color-primary)' : 'var(--color-border)'}`,
        color: 'var(--color-text)',
      }}
    >
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  )
}

function FilterSelect({ label, value, onChange, children }) {
  return (
    <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded px-2 py-1 text-sm"
        style={{
          backgroundColor: 'var(--color-bg)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
        }}
      >
        {children}
      </select>
    </label>
  )
}
