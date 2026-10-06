import { useState, useMemo } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useCollection } from '../hooks/useFirestore'
import Button from '../components/common/Button'

const COLLECTION_SLUG = 'the-hero-within'

const DEFAULT_PROMPT = `A silhouetted gamer figure stands motionless holding a laptop and headphones against a dreamy sky-water reflection scene.
Subtle golden light particles drift slowly through the misty atmosphere, the water surface creates
gentle rippling distortions of the reflection, and soft clouds drift lazily across the turquoise-orange sunset sky.
The gamer remains perfectly still and unflinching while the ethereal environment moves around them. 4 seconds, smooth loop.`

export default function BatchVideoPage() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [skipExisting, setSkipExisting] = useState(true)
  const [confirmed, setConfirmed] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, current: null, errors: [] })

  // Load all images in this collection
  const { documents: allImages, loading } = useCollection(
    'images',
    [{ field: 'collection', op: '==', value: COLLECTION_SLUG }],
    'createdAt'
  )

  // Load existing video jobs so we can detect images already processed
  const { documents: videoJobs } = useCollection('videoJobs', [], null)

  const imageJobMap = useMemo(() => {
    const map = {}
    for (const job of videoJobs) {
      if (job.imageId) map[job.imageId] = job
    }
    return map
  }, [videoJobs])

  // Filter: only rating === 'keep', exclude mockups
  const approvedImages = useMemo(() => {
    return allImages.filter(
      (img) => img.rating === 'keep' && (!img.category || img.category !== 'mockup')
    )
  }, [allImages])

  const toProcess = useMemo(() => {
    if (!skipExisting) return approvedImages
    return approvedImages.filter((img) => !imageJobMap[img.id])
  }, [approvedImages, imageJobMap, skipExisting])

  const alreadyHaveVideo = useMemo(() => {
    return approvedImages.filter((img) => !!imageJobMap[img.id])
  }, [approvedImages, imageJobMap])

  const handleStartBatch = async () => {
    if (!confirmed || running) return
    setRunning(true)
    setProgress({ done: 0, total: toProcess.length, current: null, errors: [] })

    const errors = []
    for (let i = 0; i < toProcess.length; i++) {
      const img = toProcess[i]
      setProgress((p) => ({ ...p, current: img.id, done: i }))
      try {
        // Create videoJob with awaiting_selection status (skips Claude analysis)
        const jobRef = await addDoc(collection(db, 'videoJobs'), {
          imageId: img.id,
          status: 'awaiting_selection',
          suggestedPrompts: [],
          userDirection: null,
          model: 'veo-3.1-generate-preview',
          prompt: null,
          operationId: null,
          videoStoragePath: null,
          videoDuration: 4,
          resolution: '720p',
          completedAt: null,
          createdAt: serverTimestamp(),
          batchGeneration: true,
        })

        // Immediately trigger video generation with the fixed prompt
        await addDoc(collection(db, 'videoGenerate'), {
          videoJobId: jobRef.id,
          prompt: prompt.trim(),
          createdAt: serverTimestamp(),
        })
      } catch (err) {
        errors.push({ imageId: img.id, error: err.message })
      }
    }

    setProgress((p) => ({ ...p, done: toProcess.length, current: null, errors }))
    setRunning(false)
  }

  const done = progress.done === progress.total && progress.total > 0 && !running

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" style={{ color: 'var(--color-text)' }}>
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
          Batch Video Generation
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Collection: <span className="font-mono">{COLLECTION_SLUG}</span> &nbsp;·&nbsp; Rating: keep (approved)
        </p>
      </div>

      {loading ? (
        <p className="text-sm animate-pulse" style={{ color: 'var(--color-text-muted)' }}>
          Loading images...
        </p>
      ) : (
        <>
          {/* Stats */}
          <div
            className="grid grid-cols-3 gap-4 p-4 rounded-xl"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <Stat label="Approved images" value={approvedImages.length} color="var(--color-keep)" />
            <Stat label="Already have video" value={alreadyHaveVideo.length} color="var(--color-primary)" />
            <Stat
              label={skipExisting ? 'Will generate' : 'Will generate (incl. re-runs)'}
              value={toProcess.length}
              color="var(--color-text)"
            />
          </div>

          {/* Image thumbnails */}
          {approvedImages.length === 0 ? (
            <div
              className="p-6 rounded-xl text-center"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                No approved (keep) images found in &quot;{COLLECTION_SLUG}&quot;.
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                Make sure images exist with <code>collection === &apos;the-hero-within&apos;</code> and <code>rating === &apos;keep&apos;</code>.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-xs mb-2 font-medium" style={{ color: 'var(--color-text-muted)' }}>
                Approved images ({approvedImages.length})
              </p>
              <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 gap-2">
                {approvedImages.map((img) => {
                  const hasJob = !!imageJobMap[img.id]
                  const job = imageJobMap[img.id]
                  const willSkip = skipExisting && hasJob
                  return (
                    <div key={img.id} className="relative rounded-lg overflow-hidden" style={{ aspectRatio: '2/3' }}>
                      <img
                        src={img.url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        style={{ opacity: willSkip ? 0.4 : 1 }}
                      />
                      {hasJob && (
                        <div
                          className="absolute top-0.5 right-0.5 px-1 py-0.5 rounded text-[8px] font-bold leading-none"
                          style={{
                            backgroundColor:
                              job.status === 'completed'
                                ? 'var(--color-keep)'
                                : job.status === 'failed'
                                ? 'var(--color-reject)'
                                : 'var(--color-primary)',
                            color: '#fff',
                          }}
                        >
                          {job.status === 'completed' ? '✓' : job.status === 'failed' ? '✕' : '…'}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                Dimmed = already has a video job (will be skipped if &quot;skip existing&quot; is on)
              </p>
            </div>
          )}

          {/* Prompt editor */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Video prompt (applied to all images)
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              disabled={running}
              className="w-full px-3 py-2 rounded-lg text-xs leading-relaxed resize-none"
              style={{
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Mode selector */}
          <div className="flex gap-2">
            {[
              { value: true, label: 'New only', sub: 'Skip images that already have a video' },
              { value: false, label: 'Re-generate all', sub: 'Replace videos for all approved images' },
            ].map(({ value, label, sub }) => (
              <button
                key={String(value)}
                disabled={running}
                onClick={() => { setSkipExisting(value); setConfirmed(false) }}
                className="flex-1 text-left px-4 py-3 rounded-xl transition-all cursor-pointer"
                style={{
                  backgroundColor: skipExisting === value ? 'var(--color-primary)' : 'var(--color-surface)',
                  border: `1px solid ${skipExisting === value ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  opacity: running ? 0.5 : 1,
                }}
              >
                <p className="text-sm font-medium" style={{ color: skipExisting === value ? '#fff' : 'var(--color-text)' }}>
                  {label}
                </p>
                <p className="text-xs mt-0.5" style={{ color: skipExisting === value ? 'rgba(255,255,255,0.7)' : 'var(--color-text-muted)' }}>
                  {sub}
                </p>
              </button>
            ))}
          </div>

          {/* Confirmation + start */}
          {!running && !done && toProcess.length > 0 && (
            <div
              className="p-4 rounded-xl space-y-3"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                Ready to generate <span style={{ color: 'var(--color-primary)' }}>{toProcess.length} videos</span>
                {skipExisting && alreadyHaveVideo.length > 0 && (
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {' '}(skipping {alreadyHaveVideo.length} already processed)
                  </span>
                )}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Each video will be generated via Veo 3.1 — 4s, 720p, 9:16. This bypasses AI prompt analysis and uses the prompt above directly.
              </p>
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="cursor-pointer"
                />
                I confirm — start batch generation
              </label>
              <Button
                variant="primary"
                size="sm"
                onClick={handleStartBatch}
                disabled={!confirmed}
              >
                Start Batch ({toProcess.length} videos)
              </Button>
            </div>
          )}

          {/* Progress */}
          {(running || done) && (
            <div
              className="p-4 rounded-xl space-y-3"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  {done ? 'Batch submitted' : 'Submitting batch...'}
                </p>
                <span className="text-xs font-mono" style={{ color: 'var(--color-primary)' }}>
                  {progress.done}/{progress.total}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full rounded-full overflow-hidden" style={{ height: 4, backgroundColor: 'var(--color-bg)' }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                    backgroundColor: 'var(--color-primary)',
                  }}
                />
              </div>

              {progress.current && (
                <p className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  Processing: {progress.current}
                </p>
              )}

              {done && progress.errors.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--color-keep)' }}>
                  All {progress.total} video jobs submitted. Check Video Gallery for progress.
                </p>
              )}

              {done && progress.errors.length > 0 && (
                <div>
                  <p className="text-xs" style={{ color: 'var(--color-reject)' }}>
                    {progress.errors.length} error{progress.errors.length > 1 ? 's' : ''}:
                  </p>
                  {progress.errors.map((e, i) => (
                    <p key={i} className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      {e.imageId}: {e.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {toProcess.length === 0 && approvedImages.length > 0 && !running && !done && (
            <div
              className="p-4 rounded-xl"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                All {approvedImages.length} approved images already have video jobs.
                Uncheck &quot;Skip existing&quot; to re-generate.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold" style={{ color }}>
        {value}
      </p>
      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </p>
    </div>
  )
}
