import { Link } from 'react-router-dom'
import { useDocumentMeta } from '../lib/useDocumentMeta.js'
import { STATIC_ROUTES } from '../lib/routeMeta.js'
import { POSTS } from '../lib/posts.js'

export default function BlogPage() {
  useDocumentMeta(STATIC_ROUTES['/blog'])

  return (
    <div>
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
          <span className="section-label">Blog · Notes from the studio</span>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-medium tracking-tight mt-2">
            Collections & creative stories
          </h1>
          <p className="text-base sm:text-lg text-orange-300/90 italic mt-4">
            What gaming feels like, how each collection gets built, and the craft behind the prints.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-10 sm:space-y-12">
        {POSTS.map((post) => (
          <article
            key={post.slug}
            className="border-b border-neutral-800 pb-10 sm:pb-12 last:border-0"
          >
            <Link to={`/blog/${post.slug}`} className="block group">
              <span className="text-xs uppercase tracking-wider text-orange-400">
                {post.dateLabel}
              </span>
              <h2 className="text-xl sm:text-2xl font-medium tracking-tight mt-2 group-hover:text-orange-300 transition">
                {post.title}
              </h2>
              <p className="text-neutral-300 leading-relaxed mt-3 text-sm sm:text-base">
                {post.excerpt}
              </p>
              <span className="inline-flex items-center gap-1 mt-4 text-xs uppercase tracking-wider text-orange-400 group-hover:text-orange-300">
                Read more <span aria-hidden="true">→</span>
              </span>
            </Link>
          </article>
        ))}
      </section>
    </div>
  )
}
