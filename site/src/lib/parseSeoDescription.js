// Parse the marketing agent's "seo-description" markdown blob into its
// four sections. The agent prompt asks for these labels (in this order):
//   - Etsy shop section description (max 250 chars)
//   - hoodiegamer.com collection page description (150-300 words)
//   - Meta description for Google (max 155 chars)
//   - 5 target keywords this description is optimized for
//
// The model wraps the labels in **bold**, ###, or "Label:" — we match all of
// them loosely. Any [source: ...] citations are stripped from the body.
//
// In practice the model often ignores the format and returns the page
// description as plain prose with no labels at all — every stored document as
// of 2026-08 does. When nothing matches we treat the whole blob as the page
// description rather than returning four empty strings, which is what silently
// stripped the real copy out of every collection page.

const SECTIONS = [
  { key: 'etsy', match: /etsy.*section.*description/i },
  { key: 'page', match: /(hoodiegamer|collection page) description|page description/i },
  { key: 'meta', match: /meta description/i },
  { key: 'keywords', match: /(target )?keywords?/i },
]

function stripCitations(text) {
  return text.replace(/\[source:[^\]]*\]/gi, '').replace(/[ \t]+\n/g, '\n').trim()
}

/**
 * Reduce a section to the deliverable, dropping the model's own scaffolding.
 *
 * When the agent follows the requested format it writes the actual copy as a
 * blockquote, then annotates it — "*(153 characters)*" — and explains its
 * keyword choices underneath. All of that landed in the meta description
 * before this: 387 characters of quote marker, word count and commentary.
 * Sections with no blockquote (the page description) keep their whole body.
 */
function cleanSection(text) {
  const withoutScaffolding = stripCitations(text)
    .replace(/^\s*-{3,}\s*$/gm, '')
    .replace(/^\s*\*?\(\s*\d+\s*characters?\s*\)\*?\s*$/gim, '')

  const quoted = withoutScaffolding
    .split(/\r?\n/)
    .filter((line) => /^\s*>/.test(line))
    .map((line) => line.replace(/^\s*>\s?/, ''))

  const body = quoted.length ? quoted.join('\n') : withoutScaffolding
  return body.replace(/\n{3,}/g, '\n\n').trim()
}

export function parseSeoDescription(blob) {
  if (!blob || typeof blob !== 'string') {
    return { etsy: '', page: '', meta: '', keywords: '', raw: '' }
  }

  const lines = blob.split(/\r?\n/)
  const buckets = { etsy: [], page: [], meta: [], keywords: [] }
  let current = null

  for (const line of lines) {
    // Strip leading markdown markers to isolate the label portion.
    const stripped = line
      .replace(/^\s*#{1,6}\s*/, '')
      .replace(/^\s*[-*]\s*/, '')
      .replace(/\*\*/g, '')
      .trim()

    // A heading line is short and looks like "Label" or "Label:".
    const labelCandidate = stripped.replace(/:.*$/, '').trim()
    if (labelCandidate && labelCandidate.length < 80) {
      const matched = SECTIONS.find((s) => s.match.test(labelCandidate))
      if (matched) {
        current = matched.key
        // If the heading is "Label: value on same line", capture the value too.
        const inline = stripped.includes(':')
          ? stripped.slice(stripped.indexOf(':') + 1).trim()
          : ''
        if (inline) buckets[current].push(inline)
        continue
      }
    }

    if (current) buckets[current].push(line)
  }

  const join = (arr) => cleanSection(arr.join('\n'))

  const parsed = {
    etsy: join(buckets.etsy),
    page: join(buckets.page),
    meta: join(buckets.meta),
    keywords: join(buckets.keywords),
    raw: blob,
  }

  // Unlabelled blob: the whole thing is the page description.
  if (!parsed.etsy && !parsed.page && !parsed.meta && !parsed.keywords) {
    parsed.page = join(lines)
  }

  return parsed
}

/**
 * Condense prose into a meta description that ends on a sentence boundary.
 *
 * Google truncates around 155-160 characters. The page previously used
 * `story.slice(0, 200)`, which cut mid-word ("...a lone figure at t"). Both the
 * build (prerender.mjs, via generateSitemap.js) and the runtime page use this,
 * so a crawler and a browser see the same description.
 */
export function toMetaDescription(text, maxLen = 155) {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return ''
  if (clean.length <= maxLen) return clean

  const window = clean.slice(0, maxLen + 1)
  const sentenceEnd = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('! '),
    window.lastIndexOf('? '),
  )
  // Only honour a sentence break if it leaves a usable description behind.
  if (sentenceEnd >= 80) return clean.slice(0, sentenceEnd + 1).trim()

  // Leave room for the ellipsis so the result never exceeds maxLen.
  const lastSpace = clean.lastIndexOf(' ', maxLen - 1)
  return `${clean.slice(0, lastSpace > 0 ? lastSpace : maxLen - 1).trim()}…`
}
