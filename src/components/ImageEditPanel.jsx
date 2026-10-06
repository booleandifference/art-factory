import { useState, useEffect } from 'react'
import Button from './common/Button'
import { useDocument, useFirestoreCrud } from '../hooks/useFirestore'

const QUICK_EDITS = [
  { label: 'Warmer tones', prompt: 'Make the colors warmer with golden/amber tones' },
  { label: 'Cooler tones', prompt: 'Make the colors cooler with blue/teal tones' },
  { label: 'More neon glow', prompt: 'Add more vibrant neon glow effects to the lighting' },
  { label: 'Darker mood', prompt: 'Make the overall mood darker and more atmospheric' },
  { label: 'Brighter', prompt: 'Make the scene brighter and more vivid' },
  { label: 'Add purple haze', prompt: 'Add a subtle purple/violet atmospheric haze' },
  { label: 'Sunset lighting', prompt: 'Change the lighting to warm sunset golden hour' },
  { label: 'Cyberpunk neon', prompt: 'Add more cyberpunk neon pink and blue lighting' },
]

const RESOLUTIONS = ['0.5K', '1K', '2K']

export default function ImageEditPanel({ image, onClose }) {
  const [editPrompt, setEditPrompt] = useState('')
  const [numImages, setNumImages] = useState(1)
  const [resolution, setResolution] = useState('1K')
  const [localJobId, setLocalJobId] = useState(null)
  const [editHistory, setEditHistory] = useState([])

  const editJobsCrud = useFirestoreCrud('editJobs')
  const { document: editJob } = useDocument('editJobs', localJobId)

  const status = editJob?.status || null

  // Submit edit job
  const handleEdit = async (prompt) => {
    if (!prompt?.trim()) return

    const docRef = await editJobsCrud.add({
      imageId: image.id,
      prompt: prompt.trim(),
      numImages,
      resolution,
      status: 'queued',
      results: [],
      error: null,
      startedAt: null,
      completedAt: null,
    })

    setLocalJobId(docRef.id)
    setEditPrompt('')
  }

  // Track completed edits
  useEffect(() => {
    if (editJob?.status === 'completed' && editJob.results?.length > 0) {
      setEditHistory((prev) => {
        const exists = prev.some((h) => h.jobId === localJobId)
        if (exists) return prev
        return [
          {
            jobId: localJobId,
            prompt: editJob.prompt || editPrompt,
            results: editJob.results,
          },
          ...prev,
        ]
      })
    }
  }, [editJob?.status, editJob?.results, localJobId])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-xl p-6"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
            Edit Image
          </h3>
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 rounded cursor-pointer"
            style={{ color: 'var(--color-text-muted)', backgroundColor: 'var(--color-bg)' }}
          >
            Close
          </button>
        </div>

        {/* Source image preview */}
        <div className="mb-4 flex gap-4">
          <div className="flex-shrink-0">
            <p className="text-[10px] mb-1" style={{ color: 'var(--color-text-muted)' }}>Original</p>
            <img
              src={image.urlOriginal || image.url}
              alt=""
              className="w-40 rounded-lg"
              style={{ backgroundColor: 'var(--color-bg)' }}
            />
          </div>
          {/* Show latest result */}
          {editJob?.status === 'completed' && editJob.results?.[0] && (
            <div className="flex-shrink-0">
              <p className="text-[10px] mb-1" style={{ color: 'var(--color-primary)' }}>Latest edit</p>
              <img
                src={editJob.results[0].url}
                alt=""
                className="w-40 rounded-lg"
                style={{ backgroundColor: 'var(--color-bg)' }}
              />
            </div>
          )}
        </div>

        {/* Quick edits */}
        <div className="mb-4">
          <p className="text-[10px] font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
            Quick edits
          </p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_EDITS.map((qe) => (
              <button
                key={qe.label}
                onClick={() => handleEdit(qe.prompt)}
                disabled={status === 'processing' || status === 'queued'}
                className="px-2.5 py-1.5 rounded-lg text-[11px] cursor-pointer transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {qe.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom prompt */}
        <div className="mb-4">
          <p className="text-[10px] font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
            Custom edit prompt
          </p>
          <textarea
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
            placeholder="Describe the change you want... e.g., 'Change the hoodie color to red' or 'Add rain on the window'"
            rows={3}
            className="w-full px-3 py-2 rounded-lg text-sm resize-y"
            style={{
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              minHeight: '70px',
            }}
          />
        </div>

        {/* Settings row */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <label className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Variants</label>
            <select
              value={numImages}
              onChange={(e) => setNumImages(Number(e.target.value))}
              className="px-2 py-1 rounded text-xs cursor-pointer"
              style={{
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
              }}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Resolution</label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="px-2 py-1 rounded text-xs cursor-pointer"
              style={{
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
              }}
            >
              {RESOLUTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Submit button */}
        <div className="flex gap-2 mb-4">
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleEdit(editPrompt)}
            disabled={!editPrompt.trim() || status === 'processing' || status === 'queued'}
          >
            {status === 'queued' ? 'Queued...' : status === 'processing' ? 'Editing...' : 'Apply Edit'}
          </Button>
          {(status === 'queued' || status === 'processing') && (
            <span className="text-xs self-center animate-pulse" style={{ color: 'var(--color-primary)' }}>
              Generating edit with Nano Banana 2...
            </span>
          )}
        </div>

        {/* Status messages */}
        {status === 'failed' && (
          <div className="mb-4 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
            Edit failed: {editJob?.error || 'Unknown error'}
          </div>
        )}

        {/* Edit history */}
        {editHistory.length > 0 && (
          <div>
            <p className="text-[10px] font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
              Edit results (saved as new images in gallery)
            </p>
            <div className="space-y-3">
              {editHistory.map((h) => (
                <div key={h.jobId}>
                  <p className="text-[10px] mb-1 italic" style={{ color: 'var(--color-text-muted)' }}>
                    "{h.prompt}"
                  </p>
                  <div className="flex gap-2 overflow-x-auto">
                    {h.results.map((r, i) => (
                      <img
                        key={r.imageId || i}
                        src={r.url}
                        alt=""
                        className="w-32 h-auto rounded-lg flex-shrink-0"
                        style={{ backgroundColor: 'var(--color-bg)' }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
