import { useState } from 'react'
import Button from './common/Button'
import { useFirestoreCrud } from '../hooks/useFirestore'

/**
 * Manual video prompt form — skips the Claude analysis step and sends the
 * user's own prompt straight to Veo 3.1.
 *
 * Creates a videoJobs doc with a non-"queued" status so `analyzeImageForVideo`
 * ignores it, then drops a videoGenerate doc which `generateVideo` picks up.
 *
 * Shared by VideoGalleryPage (in a modal) and VideoGenerationPanel (inline).
 */
export default function ManualVideoPromptForm({
  image,
  initialPrompt = '',
  onCancel,
  onSubmitted,
  rows = 7,
  autoFocus = true,
}) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const videoJobsCrud = useFirestoreCrud('videoJobs')
  const videoGenerateCrud = useFirestoreCrud('videoGenerate')

  const handleGenerate = async () => {
    const text = prompt.trim()
    if (!text || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      // status "manual" — anything other than "queued" keeps analyzeImageForVideo out
      const videoJobId = await videoJobsCrud.add({
        imageId: image.id,
        status: 'manual',
        manual: true,
        suggestedPrompts: [],
        userDirection: null,
        model: 'veo-3.1-generate-preview',
        prompt: text,
        operationId: null,
        videoStoragePath: null,
        videoDuration: 4,
        resolution: '720p',
        completedAt: null,
      })
      await videoGenerateCrud.add({ videoJobId, prompt: text })
      onSubmitted(videoJobId, image.id)
    } catch (e) {
      setError(e.message || 'Failed to queue video job')
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
          Your Veo 3.1 prompt
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={rows}
          autoFocus={autoFocus}
          placeholder={'e.g. Neon rain streaks down the window behind the gamer. The gamer stays perfectly still while the RGB glow pulses and smoke drifts across the room. 4 seconds, smooth loop.'}
          className="w-full px-3 py-2 rounded-lg text-xs leading-relaxed resize-y"
          style={{
            backgroundColor: 'var(--color-bg)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate()
          }}
        />
        <p className="text-[10px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
          Sent straight to Veo 3.1 — no Claude rewrite. Fixed output: 9:16, 4s, 720p, no audio.
          Tip: keep the gamer still and animate the environment. Ctrl/Cmd+Enter to generate.
        </p>
      </div>

      {error && (
        <p className="text-xs" style={{ color: 'var(--color-reject)' }}>{error}</p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={handleGenerate}
          disabled={!prompt.trim() || submitting}
        >
          {submitting ? 'Queueing...' : 'Generate Video'}
        </Button>
      </div>
    </div>
  )
}
