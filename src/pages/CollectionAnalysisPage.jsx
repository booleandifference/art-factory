import { useState, useMemo } from 'react'
import { toast } from 'react-hot-toast'
import { addDoc, collection as firestoreCollection, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import PageHeader from '../components/common/PageHeader'
import Button from '../components/common/Button'
import Spinner from '../components/common/Spinner'
import { useCollections } from '../hooks/useCollections'
import { useCollection, useDocument } from '../hooks/useFirestore'
import { renderWithCitations, stripCitations, parseSourceCitations } from '../lib/sourceParser'

const ANALYSIS_TYPES = [
  { key: 'seo-description', label: 'SEO Description', icon: '{}', desc: 'Etsy shop section + landing page blurb' },
  { key: 'blog-post', label: 'Blog Post', icon: '#', desc: 'Organic traffic driver (800-1200 words)' },
  { key: 'collection-story', label: 'Collection Story', icon: '~', desc: 'Brand narrative / artist statement' },
  { key: 'tag-strategy', label: 'Tag Strategy', icon: '>', desc: 'Keyword gaps & tag recommendations' },
  { key: 'social-media', label: 'Social Media', icon: '@', desc: 'Instagram / Pinterest / TikTok copy' },
]

const MODELS = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
]

const inputStyle = {
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
}

function SourceAttributionPanel({ citedSources, loadedSources }) {
  if (!loadedSources || loadedSources.length === 0) return null

  return (
    <div
      className="p-3 rounded-lg text-xs"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <p className="font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>
        Knowledge Sources
      </p>
      <div className="flex flex-wrap gap-2">
        {loadedSources.map((slug) => {
          const cited = citedSources?.includes(slug)
          return (
            <span
              key={slug}
              className="px-2 py-1 rounded-full"
              style={{
                backgroundColor: cited ? 'var(--color-primary)' : 'var(--color-bg)',
                color: cited ? 'white' : 'var(--color-text-muted)',
                border: cited ? 'none' : '1px solid var(--color-border)',
                opacity: cited ? 1 : 0.5,
              }}
            >
              {slug} {cited ? '(cited)' : '(loaded)'}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function CitedContent({ content }) {
  const html = useMemo(() => renderWithCitations(content || ''), [content])
  return (
    <div
      className="p-4 rounded-lg text-sm overflow-y-auto whitespace-pre-wrap"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        maxHeight: '600px',
        lineHeight: '1.6',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default function CollectionAnalysisPage() {
  const { collections, loading: collectionsLoading } = useCollections()
  const [selectedSlug, setSelectedSlug] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-5')
  const [activeJobId, setActiveJobId] = useState(null)

  const selectedCollection = useMemo(
    () => collections.find((c) => c.slug === selectedSlug),
    [collections, selectedSlug]
  )

  // Fetch published images for selected collection
  const publishedFilters = useMemo(
    () =>
      selectedSlug
        ? [
            { field: 'collection', op: '==', value: selectedSlug },
            { field: 'listing.status', op: '==', value: 'published' },
          ]
        : [],
    [selectedSlug]
  )
  const { documents: publishedImages, loading: imagesLoading } = useCollection(
    'images',
    publishedFilters,
    'createdAt'
  )

  // Real-time job subscription — now using marketingJobs
  const { document: activeJob } = useDocument('marketingJobs', activeJobId)

  // History for selected collection — now using marketingAnalyses
  const historyFilters = useMemo(
    () => (selectedSlug ? [{ field: 'collectionSlug', op: '==', value: selectedSlug }] : []),
    [selectedSlug]
  )
  const { documents: history } = useCollection('marketingAnalyses', historyFilters, 'createdAt')

  const isRunning = activeJob && (activeJob.status === 'queued' || activeJob.status === 'processing')

  const handleRunAnalysis = async () => {
    if (!selectedSlug || !selectedType) return

    const sampleImages = publishedImages.filter((img) => img.url).slice(0, 6)

    // Write to marketingJobs — triggers runMarketingAnalysis Cloud Function
    const docRef = await addDoc(firestoreCollection(db, 'marketingJobs'), {
      collectionSlug: selectedSlug,
      collectionName: selectedCollection?.name || selectedSlug,
      analysisType: selectedType,
      model: selectedModel,
      status: 'queued',
      imageUrls: sampleImages.map((i) => i.url),
      imageCount: publishedImages.length,
      collectionMeta: {
        tagline: selectedCollection?.tagline || '',
        mood: selectedCollection?.mood || '',
        artStyles: [...new Set(publishedImages.map((i) => i.listing?.artStyle).filter(Boolean))],
        sampleTitles: sampleImages
          .map((i) => i.listing?.title)
          .filter(Boolean)
          .slice(0, 5),
      },
      result: null,
      error: null,
      createdAt: serverTimestamp(),
      completedAt: null,
    })
    setActiveJobId(docRef.id)
    toast.success('Analysis started')
  }

  const handleCopy = (text) => {
    navigator.clipboard.writeText(stripCitations(text))
    toast.success('Copied to clipboard (citations stripped)')
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <PageHeader title="Marketing Agent" description="Generate marketing content for your published collections" />

      <div className="p-6 space-y-6">
        {/* Collection Selector */}
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Collection
            </label>
            <select
              value={selectedSlug}
              onChange={(e) => {
                setSelectedSlug(e.target.value)
                setActiveJobId(null)
              }}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={inputStyle}
            >
              <option value="">Select a collection...</option>
              {collectionsLoading && <option disabled>Loading...</option>}
              {collections.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm"
              style={inputStyle}
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Collection Overview */}
        {selectedCollection && (
          <div
            className="p-4 rounded-lg"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold">{selectedCollection.name}</h2>
                {selectedCollection.tagline && (
                  <p className="text-sm italic" style={{ color: 'var(--color-text-muted)' }}>
                    "{selectedCollection.tagline}"
                  </p>
                )}
                {selectedCollection.mood && (
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Mood: {selectedCollection.mood}
                  </p>
                )}
              </div>
              <span className="text-sm px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>
                {imagesLoading ? '...' : `${publishedImages.length} published`}
              </span>
            </div>
            {/* Thumbnails */}
            {!imagesLoading && publishedImages.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {publishedImages.slice(0, 6).map((img) => (
                  <img
                    key={img.id}
                    src={img.url}
                    alt=""
                    className="h-20 w-auto rounded object-cover flex-shrink-0"
                    style={{ aspectRatio: '2/3' }}
                  />
                ))}
                {publishedImages.length > 6 && (
                  <div
                    className="h-20 w-14 rounded flex items-center justify-center flex-shrink-0 text-xs"
                    style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-muted)' }}
                  >
                    +{publishedImages.length - 6}
                  </div>
                )}
              </div>
            )}
            {!imagesLoading && publishedImages.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                No published images in this collection yet.
              </p>
            )}
          </div>
        )}

        {/* Analysis Type Cards */}
        {selectedSlug && (
          <>
            <div>
              <label className="block text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                Analysis Type
              </label>
              <div className="grid grid-cols-5 gap-2">
                {ANALYSIS_TYPES.map((type) => (
                  <button
                    key={type.key}
                    onClick={() => setSelectedType(type.key)}
                    className="p-3 rounded-lg text-left cursor-pointer transition-colors"
                    style={{
                      backgroundColor: selectedType === type.key ? 'var(--color-primary)' : 'var(--color-surface)',
                      border: selectedType === type.key ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                      color: selectedType === type.key ? 'white' : 'var(--color-text)',
                    }}
                  >
                    <span className="text-lg">{type.icon}</span>
                    <p className="text-sm font-medium mt-1">{type.label}</p>
                    <p className="text-xs mt-0.5" style={{ opacity: 0.7 }}>
                      {type.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleRunAnalysis}
              disabled={!selectedType || !selectedSlug || isRunning || publishedImages.length === 0}
            >
              {isRunning ? 'Analyzing...' : 'Run Analysis'}
            </Button>
          </>
        )}

        {/* Active Job Status */}
        {activeJob && activeJob.status === 'processing' && (
          <div className="flex items-center gap-3 p-4 rounded-lg" style={{ backgroundColor: 'var(--color-surface)' }}>
            <Spinner />
            <span className="text-sm">Analyzing collection with {activeJob.model}...</span>
          </div>
        )}

        {activeJob && activeJob.status === 'failed' && (
          <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-reject)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--color-reject)' }}>Analysis failed</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{activeJob.error}</p>
          </div>
        )}

        {/* Result Display */}
        {activeJob && activeJob.status === 'completed' && activeJob.result && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                Result — {ANALYSIS_TYPES.find((t) => t.key === activeJob.result.analysisType)?.label} ({activeJob.result.model})
              </h3>
              <Button variant="ghost" size="sm" onClick={() => handleCopy(activeJob.result.content)}>
                Copy (clean)
              </Button>
            </div>

            {/* Source Attribution Panel */}
            <SourceAttributionPanel
              citedSources={activeJob.result.citedSources}
              loadedSources={activeJob.result.loadedSources}
            />

            {/* Result with inline citation badges */}
            <CitedContent content={activeJob.result.content} />
          </div>
        )}

        {/* History */}
        {selectedSlug && history.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>
              Previous Analyses ({history.length})
            </h3>
            <div className="space-y-2">
              {history.map((item) => (
                <details
                  key={item.id}
                  className="rounded-lg"
                  style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                >
                  <summary className="px-4 py-3 cursor-pointer flex items-center justify-between text-sm">
                    <span>
                      <span className="font-medium">
                        {ANALYSIS_TYPES.find((t) => t.key === item.analysisType)?.label || item.analysisType}
                      </span>
                      <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>
                        {item.model} — {item.createdAt?.toDate?.()?.toLocaleDateString() || 'unknown'}
                      </span>
                      {item.citedSources?.length > 0 && (
                        <span className="ml-2 text-xs" style={{ color: 'var(--color-primary)' }}>
                          {item.citedSources.length} source{item.citedSources.length !== 1 ? 's' : ''} cited
                        </span>
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault()
                        handleCopy(item.content)
                      }}
                    >
                      Copy
                    </Button>
                  </summary>
                  <div className="px-4 pb-4">
                    <CitedContent content={item.content} />
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
