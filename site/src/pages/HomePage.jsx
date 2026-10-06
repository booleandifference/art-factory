import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, where, limit, getDocs } from 'firebase/firestore'
import { db } from '../lib/firebase.js'
import { useDocumentMeta } from '../lib/useDocumentMeta.js'
import { routeMeta } from '../lib/routeMeta.js'
import { DEFAULT_LANG, localizedPath } from '../lib/i18n.js'
import { HOME } from '../content/home.js'

function formatSlug(slug) {
  if (!slug) return ''
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function isMug(data) {
  const t = (data.productType || data.type || '').toLowerCase()
  if (t.includes('mug')) return true
  const slug = (data.collection || '').toLowerCase()
  if (slug.includes('mug')) return true
  return false
}

function PrintCard({ img, collectionName }) {
  const src = img.url || img.urlPrint
  const slug = img.collection
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
          {slug && (
            <span className="inline-flex items-center gap-1 mt-1.5 text-xs uppercase tracking-wider text-orange-400 group-hover:text-orange-300">
              {collectionName || formatSlug(slug)} <span aria-hidden="true">→</span>
            </span>
          )}
        </div>
      </div>
    </article>
  )
  return slug ? (
    <Link to={`/collections/${slug}`} className="block">
      {card}
    </Link>
  ) : (
    <div>{card}</div>
  )
}

function VideoCard({ img, collectionName }) {
  const slug = img.collection
  const poster = img.url || img.urlPrint
  const title = img.listing?.title || ''
  const card = (
    <article className="group relative rounded-2xl overflow-hidden bg-neutral-900 border border-neutral-800 hover:border-orange-400/40 transition">
      <div className="aspect-[3/4] overflow-hidden bg-neutral-900 relative">
        {poster && (
          <img
            src={poster}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40"
          />
        )}
        {poster && (
          <img
            src={poster}
            alt={title || 'Gaming wall art print'}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-contain"
          />
        )}
        <video
          src={img.videoUrl}
          poster={poster}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          className="absolute inset-0 w-full h-full object-contain"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-4 sm:p-5 pointer-events-none">
          <h3 className="text-white font-medium text-xs sm:text-sm line-clamp-2 leading-snug">
            {title || 'Untitled print'}
          </h3>
          {slug && (
            <span className="inline-flex items-center gap-1 mt-1.5 text-xs uppercase tracking-wider text-orange-400 group-hover:text-orange-300">
              {collectionName || formatSlug(slug)} <span aria-hidden="true">→</span>
            </span>
          )}
        </div>
      </div>
    </article>
  )
  return slug ? (
    <Link to={`/collections/${slug}`} className="block">
      {card}
    </Link>
  ) : (
    <div>{card}</div>
  )
}

export default function HomePage({ lang = DEFAULT_LANG }) {
  useDocumentMeta(routeMeta(lang, '/'))
  const t = HOME[lang] || HOME[DEFAULT_LANG]
  const collectionsHref = localizedPath(DEFAULT_LANG, '/collections')

  const [images, setImages] = useState([])
  const [videos, setVideos] = useState([])
  const [collectionNames, setCollectionNames] = useState({})
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
              limit(120),
            ),
          ),
          getDocs(collection(db, 'collections')),
        ])
        if (cancelled) return

        const names = {}
        colSnap.docs.forEach((d) => {
          const data = d.data()
          const slug = data.slug || d.id
          names[slug] = data.name || data.title || slug
        })
        setCollectionNames(names)

        const all = imgSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((d) => !isMug(d))
        for (let i = all.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[all[i], all[j]] = [all[j], all[i]]
        }

        const withVideo = all.filter((d) => !!d.videoUrl)
        setImages(all.slice(0, 6))
        setVideos(withVideo.slice(0, 6))

        console.log(
          '[HomePage] images:',
          all.length,
          'with video:',
          all.filter((d) => !!d.videoUrl).length,
        )
      } catch (e) {
        console.error('[HomePage] firestore error:', e)
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
    <div>
      {/* Hero */}
      <section className="relative border-b border-neutral-800 overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-50 pointer-events-none"
          style={{
            background:
              'radial-gradient(60% 60% at 50% 30%, rgba(251, 146, 60, 0.18) 0%, rgba(15, 15, 15, 0) 70%)',
          }}
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
          <img
            src="/logo-v7.png"
            alt="The Hoodie Gamer"
            width="96"
            height="96"
            className="mx-auto mb-6 h-20 w-20 sm:h-24 sm:w-24"
          />
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-medium tracking-tight">
            {t.heroTitle}
          </h1>
          <p className="mt-4 text-lg sm:text-2xl text-neutral-300 max-w-2xl mx-auto">
            {t.heroSubtitle}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://www.etsy.com/shop/TheHoodieGamer"
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-3 rounded-full bg-orange-400 text-neutral-950 font-medium hover:bg-orange-300 transition"
            >
              {t.shopEtsy}
            </a>
            <Link
              to={collectionsHref}
              className="px-5 py-3 rounded-full border border-neutral-700 text-neutral-100 font-normal hover:border-neutral-500 transition"
            >
              {t.browseCollections}
            </Link>
          </div>
        </div>
      </section>

      {/* Videos */}
      {!loading && videos.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 border-b border-neutral-800">
          <div className="flex items-end justify-between mb-6 sm:mb-8 gap-4 flex-wrap">
            <div>
              <span className="section-label">{t.videoLabel}</span>
              <h2 className="text-2xl sm:text-3xl font-medium mt-2">
                {t.videoTitle}
              </h2>
            </div>
            <p className="text-sm text-neutral-400 max-w-md">
              {t.videoBlurb}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            {videos.map((img) => (
              <VideoCard key={img.id} img={img} collectionName={collectionNames[img.collection]} />
            ))}
          </div>
        </section>
      )}

      {/* Latest drops */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <div className="flex items-end justify-between mb-6 sm:mb-8 gap-4 flex-wrap">
          <div>
            <span className="section-label">{t.latestLabel}</span>
            <h2 className="text-2xl sm:text-3xl font-medium mt-2">
              {t.latestTitle}
            </h2>
          </div>
          <Link
            to={collectionsHref}
            className="text-sm text-orange-400 hover:text-orange-300 font-medium"
          >
            {t.seeAll}
          </Link>
        </div>

        {loading && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-neutral-900 animate-pulse rounded-2xl" />
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="text-neutral-400">{t.loadError}</p>
        )}

        {!loading && !error && images.length === 0 && (
          <p className="text-neutral-400">{t.empty}</p>
        )}

        {!loading && images.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            {images.map((img) => (
              <PrintCard key={img.id} img={img} collectionName={collectionNames[img.collection]} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
