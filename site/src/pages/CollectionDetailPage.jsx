import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
} from 'firebase/firestore'
import { db } from '../lib/firebase.js'
import { useDocumentMeta } from '../lib/useDocumentMeta.js'
import { parseSeoDescription, toMetaDescription } from '../lib/parseSeoDescription.js'
import { slugToName } from '../lib/routeMeta.js'

function PrintCard({ img }) {
  const src = img.url || img.urlPrint
  const href = img.listing?.etsyListingUrl
  const title = img.listing?.title || ''
  const card = (
    <article className="group relative rounded-2xl overflow-hidden bg-neutral-900 border border-neutral-800 hover:border-orange-400/40 transition">
      <div className="aspect-[3/4] overflow-hidden bg-neutral-900 relative">
        {src && (
          <>
            <img
              src={src}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40"
            />
            <img
              src={src}
              alt={title || 'Gaming wall art print'}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-contain group-hover:scale-[1.02] transition duration-500"
            />
          </>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-4 sm:p-5">
          <h3 className="text-white font-medium text-xs sm:text-sm line-clamp-2 leading-snug">
            {title || 'Untitled print'}
          </h3>
          {href && (
            <span className="inline-flex items-center gap-1 mt-1.5 text-xs uppercase tracking-wider text-orange-400 group-hover:text-orange-300">
              View on Etsy <span aria-hidden="true">→</span>
            </span>
          )}
        </div>
      </div>
    </article>
  )
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="block">
      {card}
    </a>
  ) : (
    <div>{card}</div>
  )
}

export default function CollectionDetailPage() {
  const { slug } = useParams()
  const [images, setImages] = useState([])
  const [meta, setMeta] = useState(null)
  const [story, setStory] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [imgSnap, colSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, 'images'),
              where('rating', '==', 'keep'),
              where('listing.status', '==', 'published'),
              where('collection', '==', slug),
              limit(200),
            ),
          ),
          getDocs(query(collection(db, 'collections'), where('slug', '==', slug))),
        ])

        const docs = imgSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        docs.sort((a, b) => {
          const at = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds ?? 0
          const bt = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds ?? 0
          return bt - at
        })

        const colDoc = colSnap.docs[0]?.data() || null

        let storyText = colDoc?.description || ''
        let metaDesc = ''
        if (!storyText) {
          // No orderBy — composite index would be required. Fetch a small
          // batch matching slug + type and pick the newest client-side.
          const [resA, resB] = await Promise.allSettled([
            getDocs(
              query(
                collection(db, 'collectionAnalyses'),
                where('collectionSlug', '==', slug),
                where('analysisType', '==', 'seo-description'),
                limit(20),
              ),
            ),
            getDocs(
              query(
                collection(db, 'marketingAnalyses'),
                where('collectionSlug', '==', slug),
                where('analysisType', '==', 'seo-description'),
                limit(20),
              ),
            ),
          ])
          if (resA.status === 'rejected') {
            console.warn('[CollectionDetail] collectionAnalyses query failed:', resA.reason?.message)
          }
          if (resB.status === 'rejected') {
            console.warn('[CollectionDetail] marketingAnalyses query failed:', resB.reason?.message)
          }
          const candidates = [
            ...(resB.status === 'fulfilled' ? resB.value.docs.map((d) => d.data()) : []),
            ...(resA.status === 'fulfilled' ? resA.value.docs.map((d) => d.data()) : []),
          ]
          candidates.sort((x, y) => {
            const xt = x.createdAt?.toMillis?.() ?? x.createdAt?.seconds ?? 0
            const yt = y.createdAt?.toMillis?.() ?? y.createdAt?.seconds ?? 0
            return yt - xt
          })
          const winner = candidates[0]
          if (winner?.content) {
            const parsed = parseSeoDescription(winner.content)
            storyText = parsed.page || winner.content
            metaDesc = parsed.meta || ''
          }
        }

        if (!cancelled) {
          setImages(docs)
          setMeta(colDoc)
          setStory(storyText)
          setMetaDescription(metaDesc)
        }
        console.log('[CollectionDetailPage]', slug, 'loaded', docs.length, 'story:', !!storyText)
      } catch (e) {
        console.error('[CollectionDetailPage] firestore error:', e)
        if (!cancelled) setError(e.message || 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [slug])

  // slugToName, not the raw slug: until Firestore answers this is what the
  // <title> shows, and "tunnel-vision" briefly replacing the prerendered
  // "Tunnel Vision" is what a crawler could snapshot.
  const title = meta?.name || meta?.title || slugToName(slug)
  const tagline = meta?.tagline || ''
  const mood = meta?.mood || ''
  const heroCover = images[0]?.url || images[0]?.urlPrint

  useDocumentMeta({
    title: `${title} — gaming wall art collection`,
    description:
      metaDescription ||
      toMetaDescription(story) ||
      tagline ||
      `Browse ${images.length} gaming wall art prints in the ${title} collection from The Hoodie Gamer. Designed in Copenhagen, shipped worldwide.`,
    image: heroCover,
    path: `/collections/${slug}`,
  })

  return (
    <div>
      {/* Collection hero */}
      <section className="relative border-b border-neutral-800 overflow-hidden">
        {heroCover && (
          <>
            <img
              src={heroCover}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-25"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-b from-neutral-950/60 via-neutral-950/80 to-neutral-950"
            />
          </>
        )}
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <Link to="/collections" className="text-sm text-neutral-400 hover:text-white transition">
            ← All collections
          </Link>
          <span className="section-label mt-6 sm:mt-8">Collection</span>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-medium tracking-tight mt-2">
            {title}
          </h1>
          {tagline && (
            <p className="text-lg sm:text-2xl text-orange-300/90 italic mt-3 max-w-3xl">
              {tagline}
            </p>
          )}
          {!loading && !error && (
            <p className="text-sm text-neutral-400 mt-3">
              {images.length} {images.length === 1 ? 'print' : 'prints'}
              {mood && <> · {mood}</>}
            </p>
          )}
        </div>
      </section>

      {/* Print grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <div className="flex items-end justify-between mb-6 sm:mb-8 gap-4 flex-wrap">
          <div>
            <span className="section-label">The prints</span>
            <h2 className="text-2xl sm:text-3xl font-medium mt-2">
              Every piece in this collection
            </h2>
          </div>
        </div>

        {loading && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-neutral-900 animate-pulse rounded-2xl" />
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="text-neutral-400">Couldn't load this collection right now.</p>
        )}

        {!loading && !error && images.length === 0 && (
          <p className="text-neutral-400">No prints in this collection yet.</p>
        )}

        {!loading && images.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            {images.map((img) => (
              <PrintCard key={img.id} img={img} />
            ))}
          </div>
        )}

        {story && (
          <div
            className="mt-10 sm:mt-12 w-full text-neutral-200 leading-relaxed whitespace-pre-line"
            style={{ fontSize: '10px' }}
          >
            {story}
          </div>
        )}
      </section>
    </div>
  )
}
