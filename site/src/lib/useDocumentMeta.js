import { useEffect } from 'react'
import { DEFAULT_DESC, DEFAULT_IMAGE, SITE_URL, formatTitle } from './routeMeta.js'

function setMeta(key, content, attr = 'name') {
  if (!content) return
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setCanonical(url) {
  let el = document.head.querySelector('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', url)
}

export function useDocumentMeta({ title, description, image, path, lang } = {}) {
  useEffect(() => {
    if (lang) document.documentElement.setAttribute('lang', lang)
    const finalTitle = formatTitle(title)
    const finalDesc = description || DEFAULT_DESC
    const finalImage = image || DEFAULT_IMAGE
    const finalUrl = `${SITE_URL}${path || (typeof window !== 'undefined' ? window.location.pathname : '/')}`

    document.title = finalTitle
    setMeta('description', finalDesc)
    setMeta('og:title', finalTitle, 'property')
    setMeta('og:description', finalDesc, 'property')
    setMeta('og:image', finalImage, 'property')
    setMeta('og:url', finalUrl, 'property')
    setMeta('og:type', 'website', 'property')
    setMeta('og:site_name', 'The Hoodie Gamer', 'property')
    setMeta('twitter:card', 'summary_large_image')
    setMeta('twitter:title', finalTitle)
    setMeta('twitter:description', finalDesc)
    setMeta('twitter:image', finalImage)
    setCanonical(finalUrl)
  }, [title, description, image, path, lang])
}
