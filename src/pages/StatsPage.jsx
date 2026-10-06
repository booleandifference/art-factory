import { useMemo, useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useCollection, useDocument } from '../hooks/useFirestore'
import { useCollections } from '../hooks/useCollections'
import Button from '../components/common/Button'

const LISTING_GOAL = 10

export default function StatsPage() {
  const { documents: images, loading } = useCollection('images', [], null)
  const { collections: COLLECTIONS } = useCollections()
  const { document: statsConfig } = useDocument('config', 'collectionStats')
  const { document: falUsage } = useDocument('config', 'falUsage')
  const [editingSlug, setEditingSlug] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [costRefreshing, setCostRefreshing] = useState(false)

  const handleRefreshCosts = async () => {
    setCostRefreshing(true)
    try {
      await setDoc(doc(db, 'config', 'falUsageRequest'), {
        requestedAt: new Date().toISOString(),
      })
      setTimeout(() => setCostRefreshing(false), 5000)
      return
    } catch (err) {
      console.error('Failed to request cost refresh:', err)
    }
    setCostRefreshing(false)
  }

  // Per-collection manual Etsy listing counts stored in config/collectionStats
  const etsyCounts = statsConfig?.etsyListings || {}
  // Active collections — only these count towards the overall goal
  const activeCollections = statsConfig?.activeCollections || {}

  const handleEditStart = (slug, currentValue) => {
    setEditingSlug(slug)
    setEditValue(String(currentValue || 0))
  }

  const handleEditSave = async () => {
    const count = parseInt(editValue, 10)
    if (!isNaN(count) && count >= 0) {
      await setDoc(doc(db, 'config', 'collectionStats'), {
        etsyListings: { ...etsyCounts, [editingSlug]: count },
      }, { merge: true })
    }
    setEditingSlug(null)
  }

  const handleToggleActive = async (slug) => {
    const current = activeCollections[slug] ?? false
    await setDoc(doc(db, 'config', 'collectionStats'), {
      activeCollections: { ...activeCollections, [slug]: !current },
    }, { merge: true })
  }

  const isActive = (slug) => activeCollections[slug] ?? false

  const stats = useMemo(() => {
    if (!images.length) return { collections: [], totals: {} }

    const allArt = images.filter((img) => !img.category || img.category !== 'mockup')
    const totals = {
      total: allArt.length,
      upscaled: allArt.filter((img) => img.upscaled).length,
      rated: allArt.filter((img) => img.rating && img.rating !== 'unrated').length,
      withVideo: allArt.filter((img) => img.videoUrl).length,
      withListing: allArt.filter((img) => img.listing?.title).length,
      published: allArt.filter((img) => img.gelatoStatus === 'published' || img.etsyListingId).length,
      unassigned: allArt.filter((img) => !img.collection).length,
    }

    const collections = COLLECTIONS.map((col) => {
      const colImages = allArt.filter((img) => img.collection === col.slug)
      const ratingCounts = { keep: 0, maybe: 0, reject: 0 }
      colImages.forEach((img) => {
        if (img.rating && ratingCounts[img.rating] !== undefined) ratingCounts[img.rating]++
      })

      return {
        slug: col.slug,
        name: col.name,
        tagline: col.tagline,
        total: colImages.length,
        upscaled: colImages.filter((img) => img.upscaled).length,
        keep: ratingCounts.keep,
        maybe: ratingCounts.maybe,
        reject: ratingCounts.reject,
        withVideo: colImages.filter((img) => img.videoUrl).length,
        withListing: colImages.filter((img) => img.listing?.title).length,
        publishedGelato: colImages.filter((img) => img.gelatoStatus === 'published').length,
        publishedEtsy: colImages.filter((img) => img.etsyListingId).length,
      }
    }).sort((a, b) => b.total - a.total)

    return { collections, totals }
  }, [images])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p style={{ color: 'var(--color-text-muted)' }}>Loading statistics...</p>
      </div>
    )
  }

  const { collections, totals } = stats
  const activeCount = collections.filter((c) => isActive(c.slug)).length
  const totalEtsyListings = Object.entries(etsyCounts)
    .filter(([slug]) => isActive(slug))
    .reduce((s, [, v]) => s + (v || 0), 0)
  const totalEtsyAll = Object.values(etsyCounts).reduce((s, v) => s + (v || 0), 0)
  const totalGoal = activeCount * LISTING_GOAL

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>Statistics</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--color-text-muted)' }}>
        Overview of all collections — goal: {LISTING_GOAL} Etsy listings per active collection · {activeCount} active ({totalGoal} target)
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
        {[
          { label: 'Total Images', value: totals.total, color: 'var(--color-primary)' },
          { label: 'Upscaled', value: totals.upscaled, color: '#10b981' },
          { label: 'Rated', value: totals.rated, color: '#f59e0b' },
          { label: 'Videos', value: totals.withVideo, color: '#8b5cf6' },
          { label: 'Listings', value: totals.withListing, color: '#3b82f6' },
          { label: 'On Etsy', value: totalEtsyAll, color: '#f97316' },
          { label: 'Unassigned', value: totals.unassigned, color: 'var(--color-text-muted)' },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-lg p-4 text-center"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <p className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{card.label}</p>
          </div>
        ))}
      </div>

      {/* Overall Etsy progress */}
      <div className="rounded-lg p-5 mb-8" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>Overall Etsy Listing Progress</h3>
          <span className="text-sm font-mono font-bold" style={{ color: '#f97316' }}>{totalEtsyListings} / {totalGoal}</span>
        </div>
        <div className="h-4 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${totalGoal > 0 ? Math.min(100, (totalEtsyListings / totalGoal) * 100) : 0}%`,
              backgroundColor: totalGoal > 0 && totalEtsyListings >= totalGoal ? '#10b981' : '#f97316',
            }}
          />
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
          {totalGoal > 0 ? Math.round((totalEtsyListings / totalGoal) * 100) : 0}% complete · {Math.max(0, totalGoal - totalEtsyListings)} listings remaining · {activeCount} collections active
        </p>
      </div>

      {/* Dashboard cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="rounded-lg p-5" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--color-text-muted)' }}>Pipeline Progress</h3>
          <div className="space-y-2">
            {[
              { label: 'Generated', count: totals.total, total: totals.total, color: 'var(--color-primary)' },
              { label: 'Upscaled', count: totals.upscaled, total: totals.total, color: '#10b981' },
              { label: 'With Listing', count: totals.withListing, total: totals.total, color: '#3b82f6' },
              { label: 'On Etsy (active)', count: totalEtsyListings, total: totalGoal || 1, color: '#f97316' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="text-xs w-20" style={{ color: 'var(--color-text-muted)' }}>{item.label}</span>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${item.total > 0 ? Math.min(100, (item.count / item.total) * 100) : 0}%`, backgroundColor: item.color }}
                  />
                </div>
                <span className="text-xs font-mono w-12 text-right" style={{ color: 'var(--color-text-muted)' }}>
                  {item.count}/{item.total}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg p-5" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--color-text-muted)' }}>Rating Breakdown</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: '✅ Keep', count: collections.reduce((s, c) => s + c.keep, 0), color: '#a6e3a1' },
              { label: '🤔 Maybe', count: collections.reduce((s, c) => s + c.maybe, 0), color: '#f9e2af' },
              { label: '❌ Reject', count: collections.reduce((s, c) => s + c.reject, 0), color: '#f38ba8' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="text-sm">{item.label}</span>
                <span className="font-mono font-bold" style={{ color: item.color }}>{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg p-5" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>Collections Status</h3>
            <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>{activeCount} active</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {collections.map((col) => {
              const etsyCount = etsyCounts[col.slug] || 0
              const done = etsyCount >= LISTING_GOAL
              const active = isActive(col.slug)
              return (
                <div key={col.slug} className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleToggleActive(col.slug)}
                    className="w-3 h-3 rounded-full border flex-shrink-0 cursor-pointer transition-all"
                    style={{
                      backgroundColor: done ? '#10b981' : active ? '#f97316' : 'transparent',
                      borderColor: done ? '#10b981' : active ? '#f97316' : 'var(--color-text-muted)',
                    }}
                    title={active ? 'Click to deactivate' : 'Click to activate'}
                  />
                  <span className="text-xs truncate" style={{ color: done ? '#10b981' : active ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                    {col.name}
                  </span>
                  <span className="text-xs font-mono ml-auto" style={{ color: done ? '#10b981' : active ? '#f97316' : 'var(--color-text-muted)' }}>
                    {etsyCount}/{LISTING_GOAL}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* fal.ai Cost Breakdown */}
      <div className="rounded-lg p-5 mb-8" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>fal.ai Costs</h3>
            <span className="text-2xl font-bold font-mono" style={{ color: '#a6e3a1' }}>
              ${(falUsage?.totalCost ?? 0).toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {falUsage?.fetchedAt && (
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Updated {new Date(falUsage.fetchedAt).toLocaleDateString()}
              </span>
            )}
            {falUsage?.error && (
              <span className="text-xs" style={{ color: 'var(--color-reject, #f38ba8)' }}>
                Error: {falUsage.error}
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefreshCosts}
              disabled={costRefreshing}
            >
              {costRefreshing ? 'Fetching...' : 'Refresh'}
            </Button>
          </div>
        </div>

        {/* Category breakdown cards */}
        {falUsage?.categories && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { key: 'image', label: 'Image Generation', color: '#cba6f7' },
              { key: 'upscale', label: 'Upscaling', color: '#a6e3a1' },
              { key: 'video', label: 'Video', color: '#f9e2af' },
              { key: 'other', label: 'Other', color: '#89b4fa' },
            ].map(({ key, label, color }) => {
              const cat = falUsage.categories[key]
              return (
                <div
                  key={key}
                  className="rounded-lg p-3"
                  style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                >
                  <p className="text-lg font-bold font-mono" style={{ color: cat?.cost > 0 ? color : 'var(--color-text-muted)' }}>
                    ${(cat?.cost ?? 0).toFixed(2)}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {label} · {Number(cat?.quantity ?? 0).toFixed(2)} units
                  </p>
                </div>
              )
            })}
          </div>
        )}

        {/* Per-endpoint table */}
        {falUsage?.byEndpoint && Object.keys(falUsage.byEndpoint).length > 0 && (
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ backgroundColor: 'var(--color-bg)' }}>
                  <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--color-text-muted)' }}>Endpoint</th>
                  <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--color-text-muted)' }}>Qty</th>
                  <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--color-text-muted)' }}>Avg Price</th>
                  <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--color-text-muted)' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(falUsage.byEndpoint)
                  .sort((a, b) => (b.cost || 0) - (a.cost || 0))
                  .map((ep) => (
                    <tr key={ep.endpoint_id} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td className="px-3 py-2 font-mono" style={{ color: 'var(--color-text)' }}>
                        {ep.endpoint_id}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--color-text-muted)' }}>
                        {ep.quantity}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--color-text-muted)' }}>
                        ${ep.quantity > 0 ? (ep.cost / ep.quantity).toFixed(4) : '0.0000'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium" style={{ color: '#a6e3a1' }}>
                        ${(ep.cost || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {falUsage?.startDate && (
          <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
            Tracking since {new Date(falUsage.startDate).toLocaleDateString()} (earliest job in Firestore)
          </p>
        )}

        {!falUsage && (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            No cost data yet. Click Refresh to fetch from fal.ai.
          </p>
        )}
      </div>

      {/* Publishing timeline */}
      <PublishingTimeline images={images} />

      {/* Collection table */}
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: 'var(--color-surface)' }}>
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--color-text-muted)' }}>Collection</th>
                <th className="text-center px-3 py-3 font-medium" style={{ color: 'var(--color-text-muted)' }}>Images</th>
                <th className="text-center px-3 py-3 font-medium" style={{ color: 'var(--color-text-muted)' }}>Upscaled</th>
                <th className="text-center px-3 py-3 font-medium" style={{ color: 'var(--color-text-muted)' }} title="Keep">✅</th>
                <th className="text-center px-3 py-3 font-medium" style={{ color: 'var(--color-text-muted)' }} title="Maybe">🤔</th>
                <th className="text-center px-3 py-3 font-medium" style={{ color: 'var(--color-text-muted)' }} title="Reject">❌</th>
                <th className="text-center px-3 py-3 font-medium" style={{ color: 'var(--color-text-muted)' }}>Videos</th>
                <th className="text-center px-3 py-3 font-medium" style={{ color: 'var(--color-text-muted)' }}>Listings</th>
                <th className="text-center px-3 py-3 font-medium" style={{ color: 'var(--color-text-muted)' }}>Etsy</th>
                <th className="text-left px-3 py-3 font-medium" style={{ color: 'var(--color-text-muted)' }}>Goal ({LISTING_GOAL})</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((col, i) => {
                const etsyCount = etsyCounts[col.slug] || 0
                const progress = Math.min(100, Math.round((etsyCount / LISTING_GOAL) * 100))
                const isEditing = editingSlug === col.slug
                const isDone = etsyCount >= LISTING_GOAL

                return (
                  <tr
                    key={col.slug}
                    style={{
                      backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--color-surface)',
                      borderTop: '1px solid var(--color-border)',
                    }}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium" style={{ color: 'var(--color-text)' }}>{col.name}</p>
                      {col.tagline && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{col.tagline}</p>
                      )}
                    </td>
                    <td className="text-center px-3 py-3 font-mono" style={{ color: 'var(--color-text)' }}>{col.total}</td>
                    <td className="text-center px-3 py-3 font-mono" style={{ color: col.upscaled > 0 ? '#10b981' : 'var(--color-text-muted)' }}>{col.upscaled}</td>
                    <td className="text-center px-3 py-3 font-mono" style={{ color: col.keep > 0 ? '#a6e3a1' : 'var(--color-text-muted)' }}>{col.keep}</td>
                    <td className="text-center px-3 py-3 font-mono" style={{ color: col.maybe > 0 ? '#f9e2af' : 'var(--color-text-muted)' }}>{col.maybe}</td>
                    <td className="text-center px-3 py-3 font-mono" style={{ color: col.reject > 0 ? '#f38ba8' : 'var(--color-text-muted)' }}>{col.reject}</td>
                    <td className="text-center px-3 py-3 font-mono" style={{ color: col.withVideo > 0 ? '#8b5cf6' : 'var(--color-text-muted)' }}>{col.withVideo}</td>
                    <td className="text-center px-3 py-3 font-mono" style={{ color: col.withListing > 0 ? '#3b82f6' : 'var(--color-text-muted)' }}>{col.withListing}</td>
                    <td className="text-center px-3 py-3">
                      {isEditing ? (
                        <div className="flex items-center gap-1 justify-center">
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-12 px-1 py-0.5 rounded text-sm text-center font-mono"
                            style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-primary)' }}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleEditSave()
                              if (e.key === 'Escape') setEditingSlug(null)
                            }}
                          />
                          <button onClick={handleEditSave} className="text-xs cursor-pointer" style={{ color: '#10b981' }}>✓</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleEditStart(col.slug, etsyCount)}
                          className="font-mono cursor-pointer hover:underline"
                          style={{ color: etsyCount > 0 ? '#f97316' : 'var(--color-text-muted)' }}
                          title="Click to edit Etsy listing count"
                        >
                          {etsyCount}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${progress}%`,
                              backgroundColor: isDone ? '#10b981' : etsyCount > 0 ? '#f97316' : 'var(--color-border)',
                            }}
                          />
                        </div>
                        <span className="text-xs font-mono w-12 text-right" style={{ color: isDone ? '#10b981' : 'var(--color-text-muted)' }}>
                          {etsyCount}/{LISTING_GOAL}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr style={{ backgroundColor: 'var(--color-surface)', borderTop: '2px solid var(--color-border)' }}>
                <td className="px-4 py-3 font-bold" style={{ color: 'var(--color-text)' }}>Total</td>
                <td className="text-center px-3 py-3 font-mono font-bold" style={{ color: 'var(--color-text)' }}>
                  {collections.reduce((s, c) => s + c.total, 0)}
                </td>
                <td className="text-center px-3 py-3 font-mono font-bold" style={{ color: '#10b981' }}>
                  {collections.reduce((s, c) => s + c.upscaled, 0)}
                </td>
                <td className="text-center px-3 py-3 font-mono font-bold" style={{ color: '#a6e3a1' }}>
                  {collections.reduce((s, c) => s + c.keep, 0)}
                </td>
                <td className="text-center px-3 py-3 font-mono font-bold" style={{ color: '#f9e2af' }}>
                  {collections.reduce((s, c) => s + c.maybe, 0)}
                </td>
                <td className="text-center px-3 py-3 font-mono font-bold" style={{ color: '#f38ba8' }}>
                  {collections.reduce((s, c) => s + c.reject, 0)}
                </td>
                <td className="text-center px-3 py-3 font-mono font-bold" style={{ color: '#8b5cf6' }}>
                  {collections.reduce((s, c) => s + c.withVideo, 0)}
                </td>
                <td className="text-center px-3 py-3 font-mono font-bold" style={{ color: '#3b82f6' }}>
                  {collections.reduce((s, c) => s + c.withListing, 0)}
                </td>
                <td className="text-center px-3 py-3 font-mono font-bold" style={{ color: '#f97316' }}>
                  {totalEtsyAll}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, (totalEtsyListings / totalGoal) * 100)}%`,
                          backgroundColor: totalEtsyListings >= totalGoal ? '#10b981' : '#f97316',
                        }}
                      />
                    </div>
                    <span className="text-xs font-mono w-12 text-right" style={{ color: 'var(--color-text-muted)' }}>
                      {totalEtsyListings}/{totalGoal}
                    </span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Publishing Timeline ──────────────────────────────────────────────────────

function toJsDate(ts) {
  if (!ts) return null
  if (ts instanceof Date) return ts
  if (ts.toDate) return ts.toDate()
  if (ts.seconds) return new Date(ts.seconds * 1000)
  return new Date(ts)
}

function PublishingTimeline({ images }) {
  const [tooltip, setTooltip] = useState(null)

  const days = useMemo(() => {
    const result = []
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      result.push(d.toISOString().split('T')[0])
    }
    return result
  }, [])

  const buckets = useMemo(() => {
    const map = {}
    days.forEach((d) => { map[d] = { gelato: 0, etsy: 0, gelatoNames: [], etsyNames: [] } })

    for (const img of images) {
      const col = img.collectionDisplayName || img.collection || '—'

      // Gelato publish — uses img.publishedAt set by publishToGelato Cloud Function
      const gelatoTs = toJsDate(img.publishedAt)
      if (gelatoTs) {
        const key = gelatoTs.toISOString().split('T')[0]
        if (map[key]) {
          map[key].gelato++
          map[key].gelatoNames.push(col)
        }
      }

      // Etsy digital publish — uses listing.digitalPublishedAt
      const etsyTs = toJsDate(img.listing?.digitalPublishedAt)
      if (etsyTs) {
        const key = etsyTs.toISOString().split('T')[0]
        if (map[key]) {
          map[key].etsy++
          map[key].etsyNames.push(col)
        }
      }
    }
    return map
  }, [images, days])

  const maxCount = useMemo(() => {
    return Math.max(1, ...days.map((d) => (buckets[d]?.gelato || 0) + (buckets[d]?.etsy || 0)))
  }, [buckets, days])

  const totalGelato = days.reduce((s, d) => s + (buckets[d]?.gelato || 0), 0)
  const totalEtsy = days.reduce((s, d) => s + (buckets[d]?.etsy || 0), 0)

  const formatDay = (iso) => {
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  // Show label every ~5 days
  const showLabel = (i) => i === 0 || i === 29 || i % 5 === 0

  return (
    <div
      className="rounded-lg p-5 mb-8"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
            Publishing Activity — Last 30 Days
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Based on image <code>updatedAt</code> timestamp when published
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#a78bfa' }} />
            <span style={{ color: 'var(--color-text-muted)' }}>Gelato <strong style={{ color: 'var(--color-text)' }}>{totalGelato}</strong></span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#f97316' }} />
            <span style={{ color: 'var(--color-text-muted)' }}>Etsy <strong style={{ color: 'var(--color-text)' }}>{totalEtsy}</strong></span>
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        {/* Bars */}
        <div className="flex items-end gap-[3px]" style={{ height: 80 }}>
          {days.map((day, i) => {
            const b = buckets[day] || { gelato: 0, etsy: 0 }
            const total = b.gelato + b.etsy
            const gelatoH = maxCount > 0 ? (b.gelato / maxCount) * 76 : 0
            const etsyH = maxCount > 0 ? (b.etsy / maxCount) * 76 : 0
            const isEmpty = total === 0
            const isToday = day === days[29]

            return (
              <div
                key={day}
                className="flex-1 flex flex-col justify-end cursor-default relative"
                style={{ height: 76 }}
                onMouseEnter={() => setTooltip({ day, ...b, total, index: i })}
                onMouseLeave={() => setTooltip(null)}
              >
                {/* Gelato bar (top) */}
                {b.gelato > 0 && (
                  <div
                    className="w-full rounded-t-sm"
                    style={{
                      height: gelatoH,
                      backgroundColor: '#a78bfa',
                      minHeight: b.gelato > 0 ? 3 : 0,
                    }}
                  />
                )}
                {/* Etsy bar (bottom, or only bar) */}
                {b.etsy > 0 && (
                  <div
                    className="w-full"
                    style={{
                      height: etsyH,
                      backgroundColor: '#f97316',
                      minHeight: b.etsy > 0 ? 3 : 0,
                      borderRadius: b.gelato > 0 ? '0 0 2px 2px' : '2px 2px 2px 2px',
                    }}
                  />
                )}
                {/* Empty day marker */}
                {isEmpty && (
                  <div
                    className="w-full"
                    style={{
                      height: 2,
                      backgroundColor: isToday ? 'var(--color-primary)' : 'var(--color-border)',
                      borderRadius: 1,
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* X-axis labels */}
        <div className="flex gap-[3px] mt-1">
          {days.map((day, i) => (
            <div key={day} className="flex-1 text-center">
              {showLabel(i) && (
                <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                  {formatDay(day)}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Tooltip */}
        {tooltip && tooltip.total > 0 && (
          <div
            className="absolute z-10 pointer-events-none px-3 py-2 rounded-lg text-xs shadow-lg"
            style={{
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              bottom: 36,
              left: `clamp(0px, calc(${(tooltip.index / 29) * 100}% - 60px), calc(100% - 140px))`,
              minWidth: 130,
            }}
          >
            <p className="font-medium mb-1" style={{ color: 'var(--color-text)' }}>
              {formatDay(tooltip.day)}
            </p>
            {tooltip.gelato > 0 && (
              <p style={{ color: '#a78bfa' }}>Gelato: {tooltip.gelato}</p>
            )}
            {tooltip.etsy > 0 && (
              <p style={{ color: '#f97316' }}>Etsy: {tooltip.etsy}</p>
            )}
            {tooltip.gelatoNames?.length > 0 && (
              <p className="mt-1 text-[10px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                {[...new Set(tooltip.gelatoNames)].join(', ')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
