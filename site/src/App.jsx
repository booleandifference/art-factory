import { Fragment } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import HomePage from './pages/HomePage.jsx'
import CollectionsPage from './pages/CollectionsPage.jsx'
import CollectionDetailPage from './pages/CollectionDetailPage.jsx'
import BlogPage from './pages/BlogPage.jsx'
import BlogPostPage from './pages/BlogPostPage.jsx'
import AboutPage from './pages/AboutPage.jsx'
import { DEFAULT_LANG, LANGS } from './lib/i18n.js'

const TRANSLATED_LANGS = LANGS.filter((l) => l !== DEFAULT_LANG)

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/collections/:slug" element={<CollectionDetailPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/about" element={<AboutPage />} />

        {/* Only these two pages are translated; everything else stays English. */}
        {TRANSLATED_LANGS.map((lang) => (
          <Fragment key={lang}>
            <Route path={`/${lang}`} element={<HomePage lang={lang} />} />
            <Route path={`/${lang}/about`} element={<AboutPage lang={lang} />} />
          </Fragment>
        ))}
      </Routes>
    </Layout>
  )
}
