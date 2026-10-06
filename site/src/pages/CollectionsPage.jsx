import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '../lib/firebase.js'
import { useDocumentMeta } from '../lib/useDocumentMeta.js'
import { STATIC_ROUTES } from '../lib/routeMeta.js'

function isMug(data) {
  const t = (data.productType || data.type || '').toLowerCase()
  if (t.includes('mug')) return true
  const slug = (data.collection || '').toLowerCase()
  if (slug.includes('mug')) return true
  return false
}

export default function CollectionsPage() {
  useDocumentMeta(STATIC_ROUTES['/collections'])

  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [colSnap, imgSnap] = await Promise.all([
          getDocs(collection(db, 'collections')),
          getDocs(
            query(
              collection(db, 'images'),
              where('rating', '==', 'keep'),
              where('listing.status', '==', 'published'),
              limit(500),
            ),
          ),
        ])

        const collectionMeta = {}
        colSnap.docs.forEach((d) => {
          const data = d.data()
          const slug = data.slug || d.id
          collectionMeta[slug] = {
            slug,
            name: data.name || data.title || slug,
            tagline: data.tagline || '',
            order: data.order ?? 999,
          }
        })

        const buckets = {}
        imgSnap.docs.forEach((d) => {
          const data = d.data()
          if (isMug(data)) return
          const slug = data.collection
          if (!slug) return
          if (!buckets[slug]) buckets[slug] = { slug, count: 0, cover: null, latest: 0 }
          buckets[slug].count++
          const t =
            data.createdAt?.toMillis?.() ?? data.createdAt?.seconds ?? 0
          const src = data.url || data.urlPrint
          if (src && t >= buckets[slug].latest) {
            buckets[slug].latest = t
            buckets[slug].cover = src
          }
        })

        const list = Object.values(buckets).map((b) => ({
          ...b,
          name: collectionMeta[b.slug]?.name || b.slug,
          tagline: collectionMeta[b.slug]?.tagline || '',
          order: collectionMeta[b.slug]?.order ?? 999,
        }))
        list.sort((a, b) => b.count - a.count)

        if (!cancelled) setGroups(list)
        console.log('[CollectionsPage] loaded', list.length, 'collections')
      } catch (e) {
        console.error('[CollectionsPage] firestore error:', e)
        if (!cancelled) setError(e.message || 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
      <div className="mb-10 sm:mb-12">
        <span className="section-label">Collections</span>
        <h1 className="text-3xl sm:text-5xl font-medium tracking-tight mt-2">
          Every collection has its own world
        </h1>
        <p className="text-neutral-400 mt-3 max-w-2xl">
          Each collection is a different mood — pick the one that matches your room, your headspace, or your favorite player one moment.
        </p>
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] bg-neutral-900 animate-pulse rounded-2xl" />
          ))}
        </div>
      )}

      {error && !loading && (
        <p className="text-neutral-400">Couldn't load collections right now.</p>
      )}

      {!loading && !error && groups.length === 0 && (
        <p className="text-neutral-400">No published collections yet — check back soon.</p>
      )}

      {!loading && groups.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {groups.map((g) => (
            <Link
              key={g.slug}
              to={`/collections/${g.slug}`}
              className="group relative rounded-2xl overflow-hidden bg-neutral-900 border border-neutral-800 hover:border-orange-400/40 transition block"
            >
              <div className="aspect-[3/4] overflow-hidden bg-neutral-900 relative">
                {g.cover && (
                  <>
                    <img
                      src={g.cover}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40"
                    />
                    <img
                      src={g.cover}
                      alt={g.name}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-contain group-hover:scale-[1.02] transition duration-500"
                    />
                  </>
                )}
                <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-sm text-xs font-medium text-neutral-100">
                  {g.count} {g.count === 1 ? 'print' : 'prints'}
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-5 sm:p-6">
                  <h3 className="text-white font-medium text-base sm:text-lg leading-tight">
                    {g.name}
                  </h3>
                  {g.tagline && (
                    <p className="text-neutral-300 text-xs sm:text-sm mt-1 line-clamp-2">{g.tagline}</p>
                  )}
                  <span className="inline-flex items-center gap-1 mt-3 text-xs uppercase tracking-wider text-orange-400 group-hover:text-orange-300">
                    Explore <span aria-hidden="true">→</span>
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
