import { useState, useMemo, useRef, useCallback } from 'react'
import PageHeader from '../components/common/PageHeader'
import Button from '../components/common/Button'
import ConceptPicker from '../components/PromptBuilder/ConceptPicker'
import { useCollection, useFirestoreCrud } from '../hooks/useFirestore'
import {
  assemblePrompt,
  generatePromptName,
  SYSTEM_PROMPT,
  DEFAULT_FORMAT_PARAMS,
  FAL_MODELS,
  DEFAULT_MODEL_PARAMS,
  isNanoBanana,
  NANO_RESOLUTIONS,
} from '../lib/promptAssembler'

export default function BuilderPage() {
  const { documents: concepts } = useCollection('concepts', [], 'createdAt')
  const { documents: savedPrompts } = useCollection('prompts', [], 'createdAt')
  const promptsCrud = useFirestoreCrud('prompts')
  const jobsCrud = useFirestoreCrud('jobs')

  // Selections
  const [camera, setCamera] = useState(null)
  const [theme, setTheme] = useState(null)
  const [props, setProps] = useState([])
  const [text, setText] = useState(null)
  const [bodyType, setBodyType] = useState(null)
  const [chaosLevel, setChaosLevel] = useState(null)
  const [style, setStyle] = useState(null)
  const [formatParams, setFormatParams] = useState(DEFAULT_FORMAT_PARAMS)
  const [model, setModel] = useState('fal-ai/nano-banana-2')
  const [resolution, setResolution] = useState('2K')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [variants, setVariants] = useState(1)
  const [includeSystemPrompt, setIncludeSystemPrompt] = useState(true)
  const [promptOverride, setPromptOverride] = useState(null) // null = auto-assembled, string = manual edit
  const [tab, setTab] = useState('build') // 'build' | 'saved'
  const [promptHeight, setPromptHeight] = useState(160)
  const [isExpanded, setIsExpanded] = useState(false)
  const dragRef = useRef(null)

  const handleDragStart = useCallback((e) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = promptHeight
    const onMove = (ev) => setPromptHeight(Math.max(80, Math.min(500, startH + ev.clientY - startY)))
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [promptHeight])

  // Group concepts by type
  const byType = useMemo(() => {
    const map = {}
    for (const c of concepts) {
      if (!map[c.type]) map[c.type] = []
      map[c.type].push(c)
    }
    return map
  }, [concepts])

  const selections = { camera, theme, props, text, bodyType, chaosLevel, style }

  const assembledPrompt = useMemo(
    () => assemblePrompt(selections, formatParams, { includeSystemPrompt }),
    [camera, theme, props, text, bodyType, chaosLevel, style, formatParams, includeSystemPrompt]
  )

  const nanoPrompt = promptOverride !== null ? promptOverride : assembledPrompt

  const promptName = useMemo(() => generatePromptName(selections), [theme, props, text])

  const handleSavePrompt = async () => {
    await promptsCrud.add({
      name: promptName,
      nanoPrompt,
      conceptRefs: {
        camera: camera?.id || null,
        theme: theme?.id || null,
        props: props.map((p) => p.id),
        text: text?.id || null,
        bodyType: bodyType?.id || null,
        chaosLevel: chaosLevel?.id || null,
        style: style?.id || null,
      },
      formatParams,
      model,
      negativePrompt,
      generationCount: 0,
      bestImageId: null,
      status: 'active',
    })
  }

  const handleGenerate = async (variants = 1) => {
    // Save prompt first
    const promptId = await promptsCrud.add({
      name: promptName,
      nanoPrompt,
      conceptRefs: {
        camera: camera?.id || null,
        theme: theme?.id || null,
        props: props.map((p) => p.id),
        text: text?.id || null,
        bodyType: bodyType?.id || null,
        chaosLevel: chaosLevel?.id || null,
        style: style?.id || null,
      },
      formatParams,
      model,
      negativePrompt,
      generationCount: 0,
      bestImageId: null,
      status: 'active',
    })

    // Create job
    await jobsCrud.add({
      promptId,
      promptText: nanoPrompt,
      model,
      modelParams: { ...DEFAULT_MODEL_PARAMS, aspectRatio: formatParams.aspectRatio, resolution },
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
    // Find concepts by ID and set selections
    const findConcept = (id) => concepts.find((c) => c.id === id) || null
    setCamera(findConcept(prompt.conceptRefs?.camera))
    setTheme(findConcept(prompt.conceptRefs?.theme))
    setProps((prompt.conceptRefs?.props || []).map(findConcept).filter(Boolean))
    setText(findConcept(prompt.conceptRefs?.text))
    setBodyType(findConcept(prompt.conceptRefs?.bodyType))
    setChaosLevel(findConcept(prompt.conceptRefs?.chaosLevel))
    setStyle(findConcept(prompt.conceptRefs?.style))
    if (prompt.formatParams) setFormatParams(prompt.formatParams)
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
      <PageHeader title="Prompt Builder" description="Assemble concepts into generation-ready prompts" />

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
            {t === 'saved' ? `Saved Prompts (${savedPrompts.length})` : 'Build Prompt'}
          </button>
        ))}
      </div>

      {tab === 'build' ? (
        <div className="flex-1 overflow-auto flex">
          {/* Left: pickers */}
          <div className="w-2/3 p-6 space-y-5 overflow-auto border-r" style={{ borderColor: 'var(--color-border)' }}>
            <ConceptPicker label="Camera / Composition" concepts={byType.camera || []} selected={camera} onSelect={setCamera} />
            <ConceptPicker label="Theme" concepts={byType.theme || []} selected={theme} onSelect={setTheme} />
            <ConceptPicker label="Art Style" concepts={byType.style || []} selected={style} onSelect={setStyle} />
            <ConceptPicker label="Body Type" concepts={byType.bodyType || []} selected={bodyType} onSelect={setBodyType} />
            <ConceptPicker label="Props" concepts={byType.prop || []} selected={props} onSelect={setProps} multiple />
            <ConceptPicker label="Chaos Level" concepts={byType.chaosLevel || []} selected={chaosLevel} onSelect={setChaosLevel} />
            <ConceptPicker label="Text Expression (optional)" concepts={byType.text || []} selected={text} onSelect={setText} />
          </div>

          {/* Right: preview + actions */}
          <div className="w-1/3 p-6 flex flex-col gap-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Prompt Name</label>
              <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{promptName}</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Assembled Nano Prompt {promptOverride !== null && <span style={{ color: 'var(--color-maybe)' }}>(edited)</span>}
                </label>
                {promptOverride !== null && (
                  <button
                    type="button"
                    onClick={() => setPromptOverride(null)}
                    className="text-[10px] px-1.5 py-0.5 rounded cursor-pointer"
                    style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-muted)' }}
                  >
                    Reset to auto
                  </button>
                )}
              </div>
              <div className="relative">
                <textarea
                  value={nanoPrompt || ''}
                  onChange={(e) => setPromptOverride(e.target.value)}
                  placeholder="Select concepts to build a prompt..."
                  className="w-full p-3 rounded-lg text-sm resize-none"
                  style={{
                    height: isExpanded ? '400px' : `${promptHeight}px`,
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text)',
                    border: promptOverride !== null ? '1px solid var(--color-maybe)' : '1px solid transparent',
                  }}
                />
                {/* Expand/collapse toggle */}
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded cursor-pointer transition-colors"
                  style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-muted)' }}
                  title={isExpanded ? 'Collapse' : 'Expand'}
                >
                  <span className="text-[10px]">{isExpanded ? '↙' : '↗'}</span>
                </button>
                {/* Drag resize handle */}
                {!isExpanded && (
                  <div
                    onMouseDown={handleDragStart}
                    className="absolute bottom-0 left-0 right-0 h-2 cursor-row-resize flex items-center justify-center rounded-b-lg"
                    style={{ backgroundColor: 'transparent' }}
                  >
                    <div className="w-8 h-0.5 rounded-full" style={{ backgroundColor: 'var(--color-border)' }} />
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <button
                  type="button"
                  onClick={() => setIncludeSystemPrompt(!includeSystemPrompt)}
                  className="w-8 h-4 rounded-full relative transition-colors flex-shrink-0"
                  style={{ backgroundColor: includeSystemPrompt ? 'var(--color-primary)' : 'var(--color-border)' }}
                >
                  <span
                    className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
                    style={{
                      backgroundColor: '#fff',
                      left: includeSystemPrompt ? '18px' : '2px',
                    }}
                  />
                </button>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  System prompt {includeSystemPrompt ? 'on' : 'off'}
                </span>
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Button onClick={() => handleGenerate(variants)} disabled={!nanoPrompt} className="flex-1">
                  Generate {variants} {variants === 1 ? 'Image' : 'Variants'}
                </Button>
                <select
                  value={variants}
                  onChange={(e) => setVariants(Number(e.target.value))}
                  className="px-3 py-2 rounded-lg text-sm"
                  style={inputStyle}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <Button variant="ghost" size="sm" onClick={handleSavePrompt} disabled={!nanoPrompt}>
                Save Prompt Only
              </Button>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Model</label>
              <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle}>
                {FAL_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} — {m.description}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Aspect Ratio</label>
              <select
                value={formatParams.aspectRatio}
                onChange={(e) => setFormatParams({ ...formatParams, aspectRatio: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={inputStyle}
              >
                <option value="2:3">2:3 (A4 Portrait)</option>
                <option value="3:4">3:4 (Portrait)</option>
                <option value="16:9">16:9 (Landscape)</option>
                <option value="1:1">1:1 (Square)</option>
              </select>
            </div>

            {isNanoBanana(model) && (
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Resolution</label>
                <select value={resolution} onChange={(e) => setResolution(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle}>
                  {NANO_RESOLUTIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Negative Prompt</label>
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                rows={2}
                placeholder="Things to avoid..."
                className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                style={inputStyle}
              />
            </div>

          </div>
        </div>
      ) : (
        /* Saved prompts list */
        <div className="flex-1 overflow-auto p-6">
          {savedPrompts.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No saved prompts yet.</p>
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
