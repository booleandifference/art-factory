import { Link, useLocation } from 'react-router-dom'
import {
  DEFAULT_LANG,
  LANGS,
  LANG_LABELS,
  TRANSLATED_ROUTES,
  baseRoute,
  langFromPath,
  localizedPath,
} from '../lib/i18n.js'

function LanguageSwitcher() {
  const { pathname } = useLocation()
  const current = langFromPath(pathname)
  const base = baseRoute(pathname)
  // Off a translated page there is nowhere equivalent to go, so send visitors
  // to that language's homepage instead of a page that does not exist.
  const target = TRANSLATED_ROUTES.includes(base) ? base : '/'

  return (
    <nav aria-label="Language" className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {LANGS.map((lang) => (
        <Link
          key={lang}
          to={localizedPath(lang, target)}
          hrefLang={lang}
          aria-current={lang === current ? 'true' : undefined}
          className={
            lang === current
              ? 'text-neutral-200'
              : 'text-neutral-500 hover:text-neutral-300 transition'
          }
        >
          {LANG_LABELS[lang]}
        </Link>
      ))}
    </nav>
  )
}

export default function Layout({ children }) {
  const { pathname } = useLocation()
  const homeHref = localizedPath(langFromPath(pathname), '/')

  return (
    <div className="min-h-screen flex flex-col bg-[#0f0f0f] text-neutral-100">
      <header className="border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to={homeHref} className="text-lg sm:text-xl font-medium tracking-tight hover:text-white">
            The Hoodie Gamer
          </Link>
          <nav className="flex items-center gap-4 sm:gap-6 text-sm sm:text-base text-neutral-300">
            <Link to={localizedPath(DEFAULT_LANG, '/collections')} className="hover:text-white transition">Collections</Link>
            <Link to="/about" className="hover:text-white transition">About</Link>
            <Link to="/blog" className="hover:text-white transition">Blog</Link>
            <a
              href="https://www.etsy.com/shop/TheHoodieGamer"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 rounded-full bg-orange-400 text-neutral-950 font-medium text-sm hover:bg-orange-300 transition"
            >
              Shop on Etsy
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-neutral-800 mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-neutral-400">
          <div>
            <p className="text-neutral-200">The Hoodie Gamer</p>
            <p className="mt-1">Gaming wall art — your desk, your world, your wall.</p>
            <p className="mt-1 text-xs">Designed in Copenhagen · Printed worldwide via Gelato.</p>
            <div className="mt-3 text-xs">
              <LanguageSwitcher />
            </div>
          </div>
          <a
            href="https://www.etsy.com/shop/TheHoodieGamer"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-400 hover:text-orange-300 font-medium"
          >
            Shop on Etsy →
          </a>
        </div>
      </footer>
    </div>
  )
}
