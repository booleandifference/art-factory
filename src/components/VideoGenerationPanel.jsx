import { useState, useEffect } from 'react'
import Button from './common/Button'
import ManualVideoPromptForm from './ManualVideoPromptForm'
import { useDocument, useFirestoreCrud } from '../hooks/useFirestore'

const PROMPT_LABELS = [
  'Subtle / Atmospheric',
  'Medium / Animated',
  'Dramatic / Effects',
]

export default function VideoGenerationPanel({ image, onClose }) {
  const [customDirection, setCustomDirection] = useState('')
  const [generatingCustom, setGeneratingCustom] = useState(false)
  const [localJobId, setLocalJobId] = useState(null)
  const [localJobIsManual, setLocalJobIsManual] = useState(false)
  const [manualMode, setManualMode] = useState(false)

  const videoJobsCrud = useFirestoreCrud('videoJobs')
  const videoGenerateCrud = useFirestoreCrud('videoGenerate')
  const videoCustomCrud = useFirestoreCrud('videoCustomPrompt')

  // Subscribe to the video job — use local ID (just created) or one already on the image
  const activeJobId = localJobId || image.videoJobId || null
  const { document: videoJob } = useDocument('videoJobs', activeJobId)

  // If we have an active job being tracked, always use its status (even for re-generations).
  // Manual jobs start at "manual" rather than "queued" — they skip Claude analysis.
  const status = localJobId
    ? (videoJob?.status || (localJobIsManual ? 'manual' : 'queued'))
    : (videoJob?.status || image.videoStatus || null)

  // Nothing in flight — safe to offer a manual prompt
  const isIdle = !status || status === 'awaiting_selection' || status === 'completed' || status === 'failed'

  // Start analysis — create a videoJob doc which triggers the Cloud Function
  const handleStartAnalysis = async () => {
    setManualMode(false)
    setLocalJobIsManual(false)
    const docRef = await videoJobsCrud.add({
      imageId: image.id,
      status: 'queued',
      suggestedPrompts: [],
      userDirection: null,
      model: 'veo-3.1-generate-preview',
      prompt: null,
      operationId: null,
      videoStoragePath: null,
      videoDuration: 4,
      resolution: '720p',
      completedAt: null,
    })
    // Track the new job ID so useDocument subscribes to it immediately
    if (docRef) {
      setLocalJobId(docRef)
    }
  }

  // Select a suggested prompt and trigger video generation
  const handleSelectPrompt = async (prompt) => {
    if (!videoJob) return
    await videoGenerateCrud.add({
      videoJobId: videoJob.id,
      prompt,
    })
  }

  // Generate custom prompt via Claude
  const handleCustomPrompt = async () => {
    if (!customDirection.trim() || !videoJob) return
    setGeneratingCustom(true)
    await videoCustomCrud.add({
      videoJobId: videoJob.id,
      userDirection: customDirection.trim(),
    })
    setCustomDirection('')
    setGeneratingCustom(false)
  }

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
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>Generate Video</h2>
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
                <p>Model: {image.metadata?.model || '—'}</p>
                <p>Size: {image.width}x{image.height}</p>
              </div>
            </div>
          </div>

          {/* Status: No video job yet */}
          {!status && (
            <Button variant="primary" size="sm" onClick={handleStartAnalysis}>
              Analyze Image for Video
            </Button>
          )}

          {/* Status: Analyzing */}
          {(status === 'queued' || status === 'analyzing') && (
            <div className="text-center py-6">
              <p className="text-sm animate-pulse" style={{ color: 'var(--color-primary)' }}>
                Analyzing image with AI...
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                Claude is studying the artwork and suggesting video prompts
              </p>
            </div>
          )}

          {/* Status: Awaiting selection — show 3 prompt cards */}
          {status === 'awaiting_selection' && videoJob?.suggestedPrompts && (
            <div className="space-y-3">
              <h3 className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                Choose a video style
              </h3>
              {videoJob.suggestedPrompts.map((prompt, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg cursor-pointer transition-all hover:scale-[1.01]"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                  }}
                  onClick={() => handleSelectPrompt(prompt)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium" style={{ color: 'var(--color-primary)' }}>
                      {PROMPT_LABELS[i] || `Option ${i + 1}`}
                    </span>
                    <Button variant="ghost" size="sm">Select</Button>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text)' }}>
                    {prompt}
                  </p>
                </div>
              ))}

              {/* Custom direction */}
              <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <h3 className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
                  Or describe your own effect...
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customDirection}
                    onChange={(e) => setCustomDirection(e.target.value)}
                    placeholder="e.g. glass shattering, room bending like the matrix"
                    className="flex-1 px-3 py-2 rounded-lg text-xs"
                    style={{
                      backgroundColor: 'var(--color-bg)',
                      color: 'var(--color-text)',
                      border: '1px solid var(--color-border)',
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleCustomPrompt()}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCustomPrompt}
                    disabled={!customDirection.trim() || generatingCustom}
                  >
                    {generatingCustom ? 'Generating...' : 'Custom'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Status: Generating video ("manual" jobs go straight to generation) */}
          {(status === 'generating' || status === 'manual') && (
            <div className="text-center py-6">
              <p className="text-sm animate-pulse" style={{ color: 'var(--color-primary)' }}>
                Generating video with Veo 3.1...
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                This usually takes 1-3 minutes. You can close this and check back.
              </p>
              {videoJob?.prompt && (
                <p className="text-xs mt-3 p-2 rounded-lg" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>
                  {videoJob.prompt}
                </p>
              )}
            </div>
          )}

          {/* Status: Completed — show video */}
          {status === 'completed' && image.videoUrl && (
            <div className="space-y-3">
              <video
                src={image.videoUrl}
                controls
                loop
                autoPlay
                muted
                className="w-full rounded-lg"
                style={{ backgroundColor: 'var(--color-bg)' }}
              />
              {image.videoPrompt && (
                <div>
                  <h4 className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Video prompt</h4>
                  <p className="text-xs p-2 rounded-lg" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
                    {image.videoPrompt}
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <a
                  href={image.videoUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center px-4 py-2 rounded-lg text-sm font-medium transition-opacity"
                  style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
                >
                  Download Video
                </a>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleStartAnalysis}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  Generate Another
                </Button>
              </div>
            </div>
          )}

          {/* Status: Failed */}
          {status === 'failed' && (
            <div className="text-center py-4 space-y-2">
              <p className="text-sm" style={{ color: 'var(--color-reject)' }}>
                Video generation failed
              </p>
              {videoJob?.error && (
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {videoJob.error}
                </p>
              )}
              <Button variant="secondary" size="sm" onClick={handleStartAnalysis}>
                Try Again
              </Button>
            </div>
          )}

          {/* Manual prompt — available whenever nothing is running */}
          {isIdle && (
            <div className="pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
              {manualMode ? (
                <>
                  <h3 className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
                    Manual prompt — skips Claude entirely
                  </h3>
                  <ManualVideoPromptForm
                    image={image}
                    rows={6}
                    onCancel={() => setManualMode(false)}
                    onSubmitted={(videoJobId) => {
                      setManualMode(false)
                      setLocalJobIsManual(true)
                      setLocalJobId(videoJobId)
                    }}
                  />
                </>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setManualMode(true)}>
                  Write Manual Prompt
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
