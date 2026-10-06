import { useMemo, useState } from 'react'
import PageHeader from '../components/common/PageHeader'
import Badge from '../components/common/Badge'
import Button from '../components/common/Button'
import { useCollection, useDocument, useFirestoreCrud } from '../hooks/useFirestore'

const statusColors = {
  queued: '#89b4fa',
  processing: '#f9e2af',
  completed: '#a6e3a1',
  failed: '#f38ba8',
}

const JOB_TYPES = [
  { key: 'all', label: 'All' },
  { key: 'generate', label: 'Generate' },
  { key: 'edit', label: 'Edit' },
  { key: 'upscale', label: 'Upscale' },
  { key: 'video', label: 'Video' },
  { key: 'listing', label: 'Listing' },
  { key: 'publish', label: 'Publish' },
]

export default function QueuePage() {
  const { documents: genJobs, loading: loadingGen } = useCollection('jobs', [], 'createdAt')
  const { documents: editJobs, loading: loadingEdit } = useCollection('editJobs', [], 'createdAt')
  const { documents: upscaleJobs, loading: loadingUpscale } = useCollection('upscaleJobs', [], 'createdAt')
  const { documents: videoJobs, loading: loadingVideo } = useCollection('videoJobs', [], 'createdAt')
  const { documents: listingJobs, loading: loadingListing } = useCollection('listingJobs', [], 'createdAt')
  const { documents: publishJobs, loading: loadingPublish } = useCollection('publishJobs', [], 'createdAt')

  const genCrud = useFirestoreCrud('jobs')
  const editCrud = useFirestoreCrud('editJobs')

  // Real fal.ai cost data (cached in Firestore)
  const { document: falUsage } = useDocument('config', 'falUsage')

  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  const loading = loadingGen || loadingEdit || loadingUpscale || loadingVideo || loadingListing || loadingPublish

  // Merge all job types with a `_type` tag
  const allJobs = useMemo(() => {
    const tagged = [
      ...genJobs.map((j) => ({ ...j, _type: 'generate', _collection: 'jobs' })),
      ...editJobs.map((j) => ({ ...j, _type: 'edit', _collection: 'editJobs' })),
      ...upscaleJobs.map((j) => ({ ...j, _type: 'upscale', _collection: 'upscaleJobs' })),
      ...videoJobs.map((j) => ({ ...j, _type: 'video', _collection: 'videoJobs' })),
      ...listingJobs.map((j) => ({ ...j, _type: 'listing', _collection: 'listingJobs' })),
      ...publishJobs.map((j) => ({ ...j, _type: 'publish', _collection: 'publishJobs' })),
    ]
    // Sort by createdAt descending
    tagged.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || 0
      const tb = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || 0
      return tb - ta
    })
    return tagged
  }, [genJobs, editJobs, upscaleJobs, videoJobs, listingJobs, publishJobs])

  const filtered = useMemo(() => {
    let result = allJobs
    if (filterType !== 'all') {
      result = result.filter((j) => j._type === filterType)
    }
    if (filterStatus !== 'all') {
      result = result.filter((j) => j.status === filterStatus)
    }
    return result
  }, [allJobs, filterType, filterStatus])

  const stats = useMemo(() => {
    const s = { total: allJobs.length, queued: 0, processing: 0, completed: 0, failed: 0, totalCost: 0 }
    for (const j of allJobs) {
      s[j.status] = (s[j.status] || 0) + 1
      s.totalCost += j.cost || 0
    }
    return s
  }, [allJobs])

  const handleRetry = async (job) => {
    const crud = job._collection === 'editJobs' ? editCrud : genCrud
    await crud.update(job.id, { status: 'queued', error: null, startedAt: null, completedAt: null })
  }

  const handleCancel = async (job) => {
    const crud = job._collection === 'editJobs' ? editCrud : genCrud
    await crud.update(job.id, { status: 'failed', error: 'Cancelled by user' })
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return '—'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleTimeString()
  }

  const getElapsed = (job) => {
    if (job.status !== 'processing' || !job.createdAt) return null
    const start = job.createdAt.toDate ? job.createdAt.toDate() : new Date(job.createdAt)
    const elapsed = Math.round((Date.now() - start.getTime()) / 1000)
    if (elapsed < 60) return `${elapsed}s`
    return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
  }

  const getJobLabel = (job) => {
    if (job._type === 'generate') return job.promptText?.slice(0, 80) || 'Generation job'
    if (job._type === 'edit') return `Edit: ${job.editPrompt?.slice(0, 60) || 'image edit'}`
    if (job._type === 'upscale') return 'Image upscale'
    if (job._type === 'video') return `Video: ${job.selectedPrompt?.slice(0, 60) || 'video generation'}`
    if (job._type === 'listing') return `Listing: ${job.title?.slice(0, 60) || 'AI listing'}`
    if (job._type === 'publish') return `Publish: ${job.title?.slice(0, 60) || 'Gelato publish'}`
    return 'Job'
  }

  const typeColors = {
    generate: '#cba6f7',
    edit: '#89dceb',
    upscale: '#a6e3a1',
    video: '#f9e2af',
    listing: '#fab387',
    publish: '#f38ba8',
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Job Queue"
        description={`${stats.total} total jobs — ${stats.processing} active${falUsage?.totalCost ? ` — $${falUsage.totalCost.toFixed(2)} fal.ai cost` : ''}`}
      />

      {/* Filters */}
      <div className="px-6 py-3 flex items-center gap-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
        {/* Type filter */}
        <div className="flex gap-1">
          {JOB_TYPES.map((t) => {
            const count = t.key === 'all' ? allJobs.length : allJobs.filter((j) => j._type === t.key).length
            return (
              <button
                key={t.key}
                onClick={() => setFilterType(t.key)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                style={{
                  backgroundColor: filterType === t.key ? 'var(--color-accent)' : 'var(--color-surface)',
                  color: filterType === t.key ? 'var(--color-bg)' : 'var(--color-text-muted)',
                }}
              >
                {t.label} ({count})
              </button>
            )
          })}
        </div>

        <div style={{ borderLeft: '1px solid var(--color-border)', height: '20px' }} />

        {/* Status filter */}
        <div className="flex gap-1">
          {['all', 'queued', 'processing', 'completed', 'failed'].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className="px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors"
              style={{
                backgroundColor: filterStatus === s
                  ? (s === 'all' ? 'var(--color-accent)' : statusColors[s])
                  : 'var(--color-surface)',
                color: filterStatus === s ? 'var(--color-bg)' : 'var(--color-text-muted)',
              }}
            >
              {s} ({s === 'all' ? allJobs.length : stats[s] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* Job list */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading jobs...</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {allJobs.length === 0
              ? 'No jobs yet. Go to the Builder to generate images.'
              : 'No jobs match the current filters.'}
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {filtered.map((job) => (
              <div
                key={`${job._collection}-${job.id}`}
                className="px-6 py-4 flex items-center gap-4"
                style={{ borderColor: 'var(--color-border)' }}
              >
                {/* Status indicator + pulse for processing */}
                <div className="relative flex-shrink-0">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: statusColors[job.status] }}
                  />
                  {job.status === 'processing' && (
                    <div
                      className="absolute inset-0 w-3 h-3 rounded-full animate-ping"
                      style={{ backgroundColor: statusColors.processing, opacity: 0.5 }}
                    />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                    {getJobLabel(job)}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    {/* Type badge */}
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: typeColors[job._type] + '22',
                        color: typeColors[job._type],
                      }}
                    >
                      {job._type}
                    </span>
                    {job.model && (
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {job.model.split('/').pop()}
                      </span>
                    )}
                    {job._type === 'generate' && (
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {job.variants || 1} variant{(job.variants || 1) > 1 ? 's' : ''}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {formatTime(job.createdAt)}
                    </span>
                    {job.cost > 0 && (
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        ${job.cost.toFixed(3)}
                      </span>
                    )}
                    {job.status === 'processing' && (
                      <span className="text-xs font-medium" style={{ color: statusColors.processing }}>
                        {getElapsed(job) || 'running...'}
                      </span>
                    )}
                  </div>
                  {job.error && (
                    <p className="text-xs mt-1" style={{ color: 'var(--color-reject)' }}>{job.error}</p>
                  )}
                </div>

                {/* Status badge */}
                <Badge color={statusColors[job.status]}>{job.status}</Badge>

                {/* Actions */}
                <div className="flex gap-2">
                  {job.status === 'failed' && (job._type === 'generate' || job._type === 'edit') && (
                    <Button variant="secondary" size="sm" onClick={() => handleRetry(job)}>
                      Retry
                    </Button>
                  )}
                  {job.status === 'queued' && (job._type === 'generate' || job._type === 'edit') && (
                    <Button variant="ghost" size="sm" onClick={() => handleCancel(job)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
