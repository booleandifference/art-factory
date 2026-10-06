/**
 * Parse [source: doc-name] citations from marketing agent output.
 * Returns an array of unique source document slugs.
 */
export function parseSourceCitations(text) {
  if (!text) return []
  const sourceRegex = /\[source:\s*([^\]]+)\]/g
  const sources = new Set()
  let match
  while ((match = sourceRegex.exec(text)) !== null) {
    // Handle comma-separated sources like [source: listing-ai, project-context]
    match[1].split(',').forEach((s) => sources.add(s.trim().toLowerCase()))
  }
  return Array.from(sources)
}

/**
 * Replace [source: X] inline citations with styled HTML span badges.
 * Returns an HTML string. Use with dangerouslySetInnerHTML or a sanitizer.
 */
export function renderWithCitations(text) {
  if (!text) return ''
  return text.replace(
    /\[source:\s*([^\]]+)\]/g,
    (_match, sources) => {
      const badges = sources
        .split(',')
        .map((s) => s.trim())
        .map(
          (s) =>
            `<span style="display:inline-block;font-size:10px;padding:1px 6px;margin:0 2px;border-radius:9999px;background:var(--color-primary);color:white;opacity:0.8;vertical-align:middle;line-height:1.4">${s}</span>`
        )
        .join('')
      return badges
    }
  )
}

/**
 * Strip [source: X] citations from text (for clean copy-to-clipboard).
 */
export function stripCitations(text) {
  if (!text) return ''
  return text.replace(/\s*\[source:\s*[^\]]+\]/g, '')
}
