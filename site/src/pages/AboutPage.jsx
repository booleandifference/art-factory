import { Link } from 'react-router-dom'
import { useDocumentMeta } from '../lib/useDocumentMeta.js'
import { routeMeta } from '../lib/routeMeta.js'
import { DEFAULT_LANG, localizedPath } from '../lib/i18n.js'
import { ABOUT } from '../content/about.js'

export default function AboutPage({ lang = DEFAULT_LANG }) {
  useDocumentMeta(routeMeta(lang, '/about'))
  const t = ABOUT[lang] || ABOUT[DEFAULT_LANG]

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
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <span className="section-label">{t.label}</span>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-medium tracking-tight mt-2">
            {t.heading}
          </h1>
          <p className="text-base sm:text-lg text-orange-300/90 italic mt-4">
            {t.lede}
          </p>
          <p className="text-neutral-400 mt-6 text-sm sm:text-base">
            {t.intro}
          </p>
        </div>
      </section>

      {/* Blog feed */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-16 sm:space-y-20">
        {t.posts.map((post, i) => (
          <article key={post.image} className="space-y-4 sm:space-y-5">
            <div className="rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900">
              <img
                src={post.image}
                alt={post.title}
                loading={i === 0 ? 'eager' : 'lazy'}
                className="w-full h-auto block"
              />
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-orange-400">
                {post.label}
              </span>
              <h2 className="text-xl sm:text-2xl font-medium tracking-tight mt-2">
                {post.title}
              </h2>
              <p className="text-orange-300/90 italic mt-2 text-sm sm:text-base">
                "{post.caption}"
              </p>
              <p className="text-neutral-300 leading-relaxed mt-4 text-sm sm:text-base">
                {post.body}
              </p>
            </div>
          </article>
        ))}

        <p className="text-orange-300 text-center pt-4 text-sm sm:text-base">
          {t.closing}
        </p>
      </section>

      {/* CTA */}
      <section className="border-t border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-medium">{t.ctaTitle}</h2>
          <p className="text-neutral-400 mt-3 text-sm sm:text-base">
            {t.ctaBody}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to={localizedPath(DEFAULT_LANG, '/collections')}
              className="px-5 py-3 rounded-full bg-orange-400 text-neutral-950 font-medium hover:bg-orange-300 transition"
            >
              {t.ctaBrowse}
            </Link>
            <a
              href="https://www.etsy.com/shop/TheHoodieGamer"
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-3 rounded-full border border-neutral-700 text-neutral-100 font-medium hover:border-neutral-500 transition"
            >
              {t.ctaEtsy}
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
