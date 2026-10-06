// Single source of truth for per-route metadata.
//
// Read at runtime by useDocumentMeta.js and at build time by
// scripts/prerender.mjs, so the HTML a crawler receives matches what the
// browser ends up showing. Keep them in sync by editing only this file.

import { DEFAULT_LANG, TRANSLATED_ROUTES, localizedPath } from './i18n.js'

export const SITE_URL = 'https://thehoodiegamer.com'
export const DEFAULT_TITLE = 'The Hoodie Gamer — Gaming Wall Art'
export const DEFAULT_DESC =
  'Gaming wall art — your desk, your world, your wall. Original prints designed in Copenhagen, shipped worldwide.'
export const DEFAULT_IMAGE = `${SITE_URL}/logo-v7.png`

export function formatTitle(title) {
  return title ? `${title} · The Hoodie Gamer` : DEFAULT_TITLE
}

// Routes in TRANSLATED_ROUTES need an entry for every language; the rest are
// English only and deliberately get no hreflang tags.
const META = {
  '/': {
    en: {
      title: 'Gaming wall art — original prints from Copenhagen',
      description:
        'Original gaming wall art from The Hoodie Gamer. Framed prints designed in Copenhagen, shipped worldwide via Gelato. The perfect gift for the gamer in your life.',
    },
    da: {
      title: 'Gaming plakater — originale prints fra København',
      description:
        'Originale gaming plakater fra The Hoodie Gamer. Prints designet i København og sendt til hele verden. Den perfekte gave til gameren i dit liv.',
    },
    sv: {
      title: 'Gamingposters — originalprints från Köpenhamn',
      description:
        'Original gamingposters från The Hoodie Gamer. Prints formgivna i Köpenhamn och skickade över hela världen. Den perfekta presenten till gamern i ditt liv.',
    },
    no: {
      title: 'Gaming-plakater — originale prints fra København',
      description:
        'Originale gaming-plakater fra The Hoodie Gamer. Prints designet i København og sendt over hele verden. Den perfekte gaven til gameren i livet ditt.',
    },
  },
  '/about': {
    en: {
      title: 'About — three decades of gaming',
      description:
        'The Hoodie Gamer story: three decades of gaming, from Commodore 64 LAN parties to VR with the kids. Every print captures that moment: you, your desk, your world.',
    },
    da: {
      title: 'Om — tre årtier med gaming',
      description:
        'Historien bag The Hoodie Gamer: tre årtier med gaming, fra Commodore 64-LAN-parties til VR med ungerne. Hver plakat fanger det øjeblik: dig, dit skrivebord, din verden.',
    },
    sv: {
      title: 'Om — tre decennier av gaming',
      description:
        'Historien bakom The Hoodie Gamer: tre decennier av gaming, från Commodore 64-LAN till VR med barnen. Varje poster fångar ögonblicket: du, ditt skrivbord, din värld.',
    },
    no: {
      title: 'Om — tre tiår med gaming',
      description:
        'Historien bak The Hoodie Gamer: tre tiår med gaming, fra Commodore 64-LAN til VR med ungene. Hver plakat fanger øyeblikket: du, skrivebordet ditt, verdenen din.',
    },
  },
  '/collections': {
    en: {
      title: 'Collections — gaming wall art for every room',
      description:
        'Browse every collection of gaming wall art from The Hoodie Gamer. Each collection is a different mood — from focused flow states to dreamy clouds, all designed in Copenhagen.',
    },
  },
  '/blog': {
    en: {
      title: 'Blog — gaming room decor and design ideas',
      description:
        'Stories from The Hoodie Gamer studio in Copenhagen — what gaming feels like, how each collection gets built, and the craft behind the prints.',
    },
  },
}

function buildStaticRoutes() {
  const routes = {}
  for (const [route, byLang] of Object.entries(META)) {
    const langs = Object.keys(byLang)
    // hreflang must be reciprocal: every variant lists all variants plus a
    // default for everyone else. Single-language routes get none.
    const alternates = TRANSLATED_ROUTES.includes(route)
      ? [
          ...langs.map((lang) => ({
            hreflang: lang,
            href: `${SITE_URL}${localizedPath(lang, route)}`,
          })),
          { hreflang: 'x-default', href: `${SITE_URL}${route}` },
        ]
      : []

    for (const lang of langs) {
      const path = localizedPath(lang, route)
      routes[path] = { ...byLang[lang], path, lang, alternates }
    }
  }
  return routes
}

export const STATIC_ROUTES = buildStaticRoutes()

export function routeMeta(lang, route) {
  return STATIC_ROUTES[localizedPath(lang, route)] || STATIC_ROUTES[route]
}

// Mirrors CollectionDetailPage's meta, minus the parts that need Firestore.
//
// metaDescription and pageDescription come from src/data/collections.json,
// which scripts/generateSitemap.js fills from the marketing agent's copy. The
// boilerplate below is a last resort: nine of eleven collections shared it
// verbatim before that copy was wired in, which is duplicate-content bait.
export function collectionMeta({ slug, name, tagline, metaDescription, pageDescription }) {
  const label = name || slugToName(slug)
  return {
    title: `${label} — gaming wall art collection`,
    description:
      metaDescription ||
      tagline ||
      `Browse gaming wall art prints in the ${label} collection from The Hoodie Gamer. Designed in Copenhagen, shipped worldwide.`,
    body: pageDescription || '',
    heading: label,
    path: `/collections/${slug}`,
    lang: DEFAULT_LANG,
    alternates: [],
  }
}

export function slugToName(slug) {
  return (slug || '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
