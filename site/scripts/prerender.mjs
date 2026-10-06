#!/usr/bin/env node
/**
 * Post-build step: write a real HTML file per route.
 *
 * The app is a single-page app, so Firebase rewrites every URL to index.html.
 * That meant each URL served the same <head> — including a canonical pointing
 * at the homepage — which told Google every page was a duplicate of "/" and
 * kept them out of the index. useDocumentMeta fixes the tags, but only after
 * JavaScript runs; crawlers read the initial HTML.
 *
 * Firebase Hosting serves a matching static file before applying rewrites, so
 * dist/about/index.html wins for /about. No hosting config needed.
 *
 * Runs automatically via `npm run build`.
 */
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import { POSTS } from '../src/lib/posts.js'
import { ABOUT } from '../src/content/about.js'
import { HOME } from '../src/content/home.js'
import { baseRoute, langFromPath } from '../src/lib/i18n.js'
import {
  DEFAULT_IMAGE,
  SITE_URL,
  STATIC_ROUTES,
  collectionMeta,
  formatTitle,
} from '../src/lib/routeMeta.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const SITE_DIR = path.join(__dirname, '..')
const DIST = path.join(SITE_DIR, 'dist')
const TEMPLATE = path.join(DIST, 'index.html')

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Minimal markdown → HTML, matching what MarkdownLite renders in the browser:
 * "## " headings, **bold**, and blank-line-separated paragraphs. Deliberately
 * small — this only has to produce readable, crawlable text, and React
 * replaces it the moment it mounts.
 */
function markdownToHtml(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const heading = block.match(/^#{2,3}\s+(.*)$/)
      const inline = (s) =>
        escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      if (heading) return `<h2>${inline(heading[1])}</h2>`
      return `<p>${inline(block.replace(/\n/g, ' '))}</p>`
    })
    .join('\n')
}

/**
 * The crawler-visible body.
 *
 * Everything used to render client-side only, so the served HTML was
 * `<div id="root"></div>` — no text, no internal links. Google renders JS and
 * coped, but 23 of 29 pages sat in "Registered - not yet indexed" with thin
 * rendered content, and non-rendering crawlers saw a blank page. React calls
 * createRoot().render(), which replaces these children wholesale, so there is
 * no hydration mismatch and the visible result is unchanged.
 */
/**
 * Heading and prose for the hand-written pages, in the route's own language.
 * The Nordic homepages exist for local search intent ("plakater"), which only
 * works if the localised h1 is in the HTML rather than assembled by React.
 */
function staticContent(routePath) {
  const lang = langFromPath(routePath)
  const base = baseRoute(routePath)

  if (base === '/') {
    const t = HOME[lang] || HOME.en
    return { heading: t.heroTitle, body: [t.heroSubtitle, t.videoBlurb].filter(Boolean).join('\n\n') }
  }
  if (base === '/about') {
    const t = ABOUT[lang] || ABOUT.en
    const posts = (t.posts || [])
      .map((p) => [p.title && `## ${p.title}`, p.caption, p.body].filter(Boolean).join('\n\n'))
      .join('\n\n')
    return {
      heading: t.heading,
      body: [t.lede, t.intro, posts, t.closing, t.ctaBody].filter(Boolean).join('\n\n'),
    }
  }
  return {}
}

function renderBody(route) {
  if (!route.heading && !route.body && !route.links) return ''
  const parts = []
  if (route.heading) parts.push(`<h1>${escapeHtml(route.heading)}</h1>`)
  if (route.body) parts.push(markdownToHtml(route.body))
  if (route.links?.length) {
    parts.push(
      `<nav><ul>\n${route.links
        .map((l) => `      <li><a href="${escapeHtml(l.href)}">${escapeHtml(l.text)}</a></li>`)
        .join('\n')}\n    </ul></nav>`,
    )
  }
  return parts.join('\n    ')
}

/**
 * Collection slugs come from the sitemap, which is generated from Firestore by
 * scripts/generateSitemap.js at the repo root. Reading it here keeps the build
 * credential-free. collections.json, when present, supplies the real names.
 */
function readCollections() {
  const metaPath = path.join(SITE_DIR, 'src', 'data', 'collections.json')
  if (fs.existsSync(metaPath)) {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  }
  const sitemapPath = path.join(SITE_DIR, 'public', 'sitemap.xml')
  if (!fs.existsSync(sitemapPath)) return []
  const xml = fs.readFileSync(sitemapPath, 'utf8')
  return [...xml.matchAll(/<loc>[^<]*\/collections\/([^<\/]+)<\/loc>/g)].map((m) => ({
    slug: m[1],
  }))
}

function applyMeta(template, { title, description, path: routePath, image, lang, alternates }) {
  const t = escapeHtml(formatTitle(title))
  const d = escapeHtml(description)
  const u = escapeHtml(`${SITE_URL}${routePath}`)
  const i = escapeHtml(image || DEFAULT_IMAGE)

  const swap = (html, pattern, value) =>
    html.replace(pattern, (_m, open, close) => `${open}${value}${close}`)

  let html = template.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${t}</title>`)
  html = swap(html, /(<meta name="description" content=")[^"]*(")/, d)
  html = swap(html, /(<link rel="canonical" href=")[^"]*(")/, u)
  html = swap(html, /(<meta property="og:title" content=")[^"]*(")/, t)
  html = swap(html, /(<meta property="og:description" content=")[^"]*(")/, d)
  html = swap(html, /(<meta property="og:url" content=")[^"]*(")/, u)
  html = swap(html, /(<meta property="og:image" content=")[^"]*(")/, i)
  html = swap(html, /(<meta name="twitter:title" content=")[^"]*(")/, t)
  html = swap(html, /(<meta name="twitter:description" content=")[^"]*(")/, d)
  html = swap(html, /(<meta name="twitter:image" content=")[^"]*(")/, i)

  if (lang) {
    html = html.replace(/(<html[^>]*\slang=")[^"]*(")/, (_m, open, close) => `${open}${lang}${close}`)
  }

  // hreflang tells Google these are translations of one page rather than
  // duplicates competing with each other.
  if (alternates?.length) {
    const links = alternates
      .map(
        (a) =>
          `    <link rel="alternate" hreflang="${escapeHtml(a.hreflang)}" href="${escapeHtml(a.href)}" />`,
      )
      .join('\n')
    html = html.replace('</head>', `${links}\n  </head>`)
  }
  return html
}

function applyBody(html, route) {
  const body = renderBody(route)
  if (!body) return html
  return html.replace(
    '<div id="root"></div>',
    `<div id="root">\n    ${body}\n  </div>`,
  )
}

function writeRoute(template, route) {
  const html = applyBody(applyMeta(template, route), route)
  const outDir = route.path === '/' ? DIST : path.join(DIST, route.path)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8')
}

function run() {
  if (!fs.existsSync(TEMPLATE)) {
    throw new Error(`No dist/index.html — run vite build first (looked in ${DIST})`)
  }
  const template = fs.readFileSync(TEMPLATE, 'utf8')

  const collections = readCollections().map(collectionMeta)

  // Index pages carry the links to everything else. Without them the only
  // crawlable path to a collection or post was the sitemap.
  const indexLinks = {
    '/collections': collections.map((c) => ({
      href: c.path,
      text: c.heading,
    })),
    '/blog': POSTS.map((p) => ({ href: `/blog/${p.slug}`, text: p.title })),
  }

  const routes = [
    ...Object.values(STATIC_ROUTES).map((r) => ({
      ...r,
      ...staticContent(r.path),
      links: indexLinks[r.path] || r.links,
    })),
    ...POSTS.map((p) => ({
      title: p.title,
      description: p.excerpt,
      path: `/blog/${p.slug}`,
      heading: p.title,
      body: p.body,
      links: [{ href: '/blog', text: 'All posts' }],
    })),
    ...collections.map((c) => ({
      ...c,
      links: [{ href: '/collections', text: 'All collections' }],
    })),
  ]

  // Guard against the bug this script exists to prevent: every route must end
  // up with its own canonical, or we are back to Google seeing duplicates.
  const seen = new Set()
  for (const r of routes) {
    if (seen.has(r.path)) throw new Error(`Duplicate route path: ${r.path}`)
    seen.add(r.path)
    writeRoute(template, r)
  }

  console.log(`Prerendered ${routes.length} routes into dist/.`)
}

run()
