import { Link, useParams } from 'react-router-dom'
import { useDocumentMeta } from '../lib/useDocumentMeta.js'
import { POSTS, getPost } from '../lib/posts.js'
import MarkdownLite from '../components/MarkdownLite.jsx'

export default function BlogPostPage() {
  const { slug } = useParams()
  const post = getPost(slug)

  useDocumentMeta({
    title: post ? post.title : 'Blog post',
    description: post?.excerpt || '',
    path: `/blog/${slug}`,
  })

  if (!post) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <Link to="/blog" className="text-sm text-neutral-400 hover:text-white transition">
          ← All posts
        </Link>
        <h1 className="text-2xl sm:text-3xl font-medium mt-6">Post not found</h1>
        <p className="text-neutral-400 mt-3 text-sm sm:text-base">
          This post may have moved. Head back to the blog index to find it.
        </p>
      </div>
    )
  }

  // Sibling posts for prev/next navigation (newest-first order, so "next" is older).
  const idx = POSTS.findIndex((p) => p.slug === slug)
  const newer = idx > 0 ? POSTS[idx - 1] : null
  const older = idx >= 0 && idx < POSTS.length - 1 ? POSTS[idx + 1] : null

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
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <Link to="/blog" className="text-sm text-neutral-400 hover:text-white transition">
            ← All posts
          </Link>
          <span className="block mt-6 text-xs uppercase tracking-wider text-orange-400">
            {post.dateLabel}
          </span>
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-medium tracking-tight mt-2">
            {post.title}
          </h1>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <MarkdownLite content={post.body} />
      </section>

      <section className="border-t border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {newer ? (
            <Link to={`/blog/${newer.slug}`} className="block group">
              <span className="text-xs uppercase tracking-wider text-neutral-500">Newer</span>
              <p className="mt-1 text-base sm:text-lg text-neutral-200 group-hover:text-orange-300 transition">
                ← {newer.title}
              </p>
            </Link>
          ) : (
            <span />
          )}
          {older ? (
            <Link to={`/blog/${older.slug}`} className="block group sm:text-right">
              <span className="text-xs uppercase tracking-wider text-neutral-500">Older</span>
              <p className="mt-1 text-base sm:text-lg text-neutral-200 group-hover:text-orange-300 transition">
                {older.title} →
              </p>
            </Link>
          ) : (
            <span />
          )}
        </div>
      </section>
    </div>
  )
}
