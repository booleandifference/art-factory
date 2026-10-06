// Language setup for the public site.
//
// English lives at the root (/, /about). Other languages are prefixed
// (/da/about, /sv, /no/about). Only the routes listed in TRANSLATED_ROUTES
// exist in every language — collections and blog stay English, so we must not
// emit hreflang tags for them.

export const DEFAULT_LANG = 'en'
export const LANGS = ['en', 'da', 'sv', 'no']
export const LANG_LABELS = { en: 'English', da: 'Dansk', sv: 'Svenska', no: 'Norsk' }
export const TRANSLATED_ROUTES = ['/', '/about']

export function localizedPath(lang, route) {
  if (lang === DEFAULT_LANG) return route
  return route === '/' ? `/${lang}` : `/${lang}${route}`
}

/** Strip the language prefix: '/da/about' -> '/about', '/da' -> '/'. */
export function baseRoute(pathname) {
  const parts = pathname.split('/').filter(Boolean)
  if (LANGS.includes(parts[0]) && parts[0] !== DEFAULT_LANG) parts.shift()
  return `/${parts.join('/')}`
}

export function langFromPath(pathname) {
  const first = pathname.split('/').filter(Boolean)[0]
  return LANGS.includes(first) && first !== DEFAULT_LANG ? first : DEFAULT_LANG
}
