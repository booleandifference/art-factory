#!/usr/bin/env node
/**
 * Generate site/public/sitemap.xml from current Firestore data, plus
 * site/src/data/collections.json which the site build reads to prerender
 * per-collection <title> and description tags (see site/scripts/prerender.mjs).
 *
 * Re-run whenever you publish new collections so Google sees them, then
 * rebuild and deploy the site.
 *
 * Run: node scripts/generateSitemap.js
 *
 * Reads Firestore over the REST API using the site's public web API key, the
 * same way the public site does in the browser — no admin credentials, nothing
 * that expires. This works because published images and collections are
 * publicly readable in firestore.rules, which they must be for the site to
 * function. If those rules are ever locked down, this script stops working
 * (and so does thehoodiegamer.com).
 */
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import { POSTS } from '../site/src/lib/posts.js'
import { DEFAULT_LANG, LANGS, localizedPath } from '../site/src/lib/i18n.js'
import { parseSeoDescription, toMetaDescription } from '../site/src/lib/parseSeoDescription.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const SITE_DIR = path.join(__dirname, '..', 'site')
const OUT_PATH = path.join(SITE_DIR, 'public', 'sitemap.xml')
const COLLECTIONS_META_PATH = path.join(SITE_DIR, 'src', 'data', 'collections.json')
const ENV_PATH = path.join(SITE_DIR, '.env')
const BASE = 'https://thehoodiegamer.com'

// The homepage and About exist in every language; the rest are English only.
const TRANSLATED = [
  { route: '/', priority: '1.0', changefreq: 'weekly' },
  { route: '/about', priority: '0.5', changefreq: 'monthly' },
]

const STATIC_URLS = [
  ...TRANSLATED.flatMap(({ route, priority, changefreq }) =>
    LANGS.map((lang) => ({
      path: localizedPath(lang, route),
      priority: lang === DEFAULT_LANG ? priority : String(Number(priority) - 0.1),
      changefreq,
    })),
  ),
  { path: '/collections', priority: '0.9', changefreq: 'weekly' },
  { path: '/blog', priority: '0.7', changefreq: 'weekly' },
]

function readEnv() {
  const env = {}
  if (fs.existsSync(ENV_PATH)) {
    for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
  const apiKey = process.env.FIREBASE_API_KEY || env.VITE_FIREBASE_API_KEY
  const projectId = process.env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID
  if (!apiKey || !projectId) {
    throw new Error(
      `Missing Firebase web config. Expected VITE_FIREBASE_API_KEY and ` +
        `VITE_FIREBASE_PROJECT_ID in ${ENV_PATH}, or FIREBASE_API_KEY / ` +
        `FIREBASE_PROJECT_ID in the environment.`,
    )
  }
  return { apiKey, projectId }
}

const { apiKey, projectId } = readEnv()
const DOCS_URL = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`

function str(field) {
  return field?.stringValue || ''
}

async function firestore(pathname, init) {
  const res = await fetch(`${DOCS_URL}${pathname}${pathname.includes('?') ? '&' : '?'}key=${apiKey}`, init)
  const body = await res.json()
  if (!res.ok || body.error) {
    const err = body.error || {}
    throw new Error(`Firestore ${err.status || res.status}: ${err.message || res.statusText}`)
  }
  return body
}

/** Slugs of collections that have at least one published print (mugs excluded). */
async function publishedSlugs() {
  const body = await firestore(':runQuery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'images' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'rating' },
                  op: 'EQUAL',
                  value: { stringValue: 'keep' },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'listing.status' },
                  op: 'EQUAL',
                  value: { stringValue: 'published' },
                },
              },
            ],
          },
        },
        select: { fields: [{ fieldPath: 'collection' }] },
      },
    }),
  })

  const slugs = new Set()
  for (const row of body) {
    const slug = str(row.document?.fields?.collection)
    if (slug && !slug.toLowerCase().includes('mug')) slugs.add(slug)
  }
  return [...slugs].sort()
}

/** Display names and taglines, so titles read "Spellbound" not "Spell Bound". */
async function collectionNames() {
  const bySlug = new Map()
  let pageToken = ''
  do {
    const qs = `?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
    const body = await firestore(`/collections${qs}`)
    for (const doc of body.documents || []) {
      const f = doc.fields || {}
      const slug = str(f.slug) || doc.name.split('/').pop()
      bySlug.set(slug, { name: str(f.name) || str(f.title), tagline: str(f.tagline) })
    }
    pageToken = body.nextPageToken || ''
  } while (pageToken)
  return bySlug
}

/**
 * Newest seo-description blob per collection, from marketingAnalyses.
 *
 * This is the copy the marketing agent writes. Until now it only ever reached
 * the page after JavaScript ran, so crawlers saw the boilerplate fallback and
 * an empty body. Baking it in here lets prerender.mjs put the real text into
 * the served HTML.
 */
async function seoDescriptions() {
  const body = await firestore(':runQuery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'marketingAnalyses' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'analysisType' },
            op: 'EQUAL',
            value: { stringValue: 'seo-description' },
          },
        },
      },
    }),
  })

  const bySlug = new Map()
  for (const row of body) {
    const f = row.document?.fields
    if (!f) continue
    const slug = str(f.collectionSlug)
    const content = str(f.content)
    if (!slug || !content) continue
    // No orderBy: the query needs no composite index, so pick newest here.
    const createdAt = f.createdAt?.timestampValue || ''
    const prev = bySlug.get(slug)
    if (!prev || createdAt > prev.createdAt) bySlug.set(slug, { createdAt, content })
  }
  return bySlug
}

async function run() {
  const [slugs, names, seo] = await Promise.all([
    publishedSlugs(),
    collectionNames(),
    seoDescriptions(),
  ])

  const collectionsMeta = slugs.map((slug) => {
    const tagline = names.get(slug)?.tagline || ''
    const parsed = parseSeoDescription(seo.get(slug)?.content || '')
    const pageDescription = parsed.page || ''
    return {
      slug,
      name: names.get(slug)?.name || '',
      tagline,
      // Prefer the agent's own meta line; otherwise condense the prose. Both
      // go through toMetaDescription — the agent is asked for 155 characters
      // but is not reliable about it.
      metaDescription:
        toMetaDescription(parsed.meta) || toMetaDescription(pageDescription || tagline),
      pageDescription,
    }
  })

  const withCopy = collectionsMeta.filter((c) => c.pageDescription).length
  console.log(`Collection copy: ${withCopy}/${collectionsMeta.length} have an seo-description.`)
  for (const c of collectionsMeta) {
    if (!c.pageDescription) console.warn(`  ! ${c.slug} has no seo-description — using boilerplate.`)
  }

  fs.mkdirSync(path.dirname(COLLECTIONS_META_PATH), { recursive: true })
  fs.writeFileSync(COLLECTIONS_META_PATH, `${JSON.stringify(collectionsMeta, null, 2)}\n`, 'utf8')

  const today = new Date().toISOString().split('T')[0]
  const collectionUrls = slugs.map((slug) => ({
    path: `/collections/${slug}`,
    priority: '0.8',
    changefreq: 'weekly',
  }))

  const postUrls = POSTS.map((p) => ({
    path: `/blog/${p.slug}`,
    priority: '0.6',
    changefreq: 'monthly',
    lastmod: p.date,
  }))

  const all = [...STATIC_URLS, ...collectionUrls, ...postUrls]

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    all
      .map(
        (u) =>
          `  <url>\n    <loc>${BASE}${u.path}</loc>\n    <lastmod>${u.lastmod || today}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
      )
      .join('\n') +
    '\n</urlset>\n'

  fs.writeFileSync(OUT_PATH, xml, 'utf8')
  console.log(
    `Wrote ${OUT_PATH} with ${all.length} URLs (${slugs.length} collections, ${POSTS.length} posts).`,
  )
  console.log(`Wrote ${COLLECTIONS_META_PATH} with ${collectionsMeta.length} collections.`)
}

run().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
