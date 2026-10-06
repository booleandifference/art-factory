// Tiny markdown renderer for blog posts. Handles only what posts.js uses:
//   ### subheading
//   **bold** and *italic* inline
//   - bullet list items (consecutive lines grouped)
//   blank line = paragraph break

function renderInline(text, keyPrefix = '') {
  // Split on **bold** first, then *italic* within each plain segment.
  const parts = []
  const boldSplit = text.split(/(\*\*[^*]+\*\*)/g)
  boldSplit.forEach((chunk, i) => {
    if (/^\*\*[^*]+\*\*$/.test(chunk)) {
      parts.push(
        <strong key={`${keyPrefix}b${i}`} className="text-white">
          {chunk.slice(2, -2)}
        </strong>,
      )
    } else {
      const italSplit = chunk.split(/(\*[^*]+\*)/g)
      italSplit.forEach((sub, j) => {
        if (/^\*[^*]+\*$/.test(sub)) {
          parts.push(
            <em key={`${keyPrefix}i${i}-${j}`}>{sub.slice(1, -1)}</em>,
          )
        } else if (sub) {
          parts.push(sub)
        }
      })
    }
  })
  return parts
}

export default function MarkdownLite({ content }) {
  if (!content) return null
  const lines = content.split(/\r?\n/)
  const blocks = []
  let buffer = []
  let listBuffer = []

  const flushParagraph = () => {
    if (buffer.length) {
      const text = buffer.join(' ').trim()
      if (text) {
        blocks.push(
          <p key={`p-${blocks.length}`} className="text-neutral-300 leading-relaxed">
            {renderInline(text, `p${blocks.length}-`)}
          </p>,
        )
      }
      buffer = []
    }
  }
  const flushList = () => {
    if (listBuffer.length) {
      const items = listBuffer.slice()
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-1.5 text-neutral-300 leading-relaxed">
          {items.map((line, i) => (
            <li key={i}>{renderInline(line, `li${blocks.length}-${i}-`)}</li>
          ))}
        </ul>,
      )
      listBuffer = []
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.startsWith('### ')) {
      flushParagraph()
      flushList()
      blocks.push(
        <h2 key={`h-${blocks.length}`} className="text-lg sm:text-xl font-medium text-white mt-8 mb-1">
          {line.slice(4)}
        </h2>,
      )
      continue
    }
    if (line.startsWith('- ')) {
      flushParagraph()
      listBuffer.push(line.slice(2))
      continue
    }
    if (line === '') {
      flushParagraph()
      flushList()
      continue
    }
    flushList()
    buffer.push(line)
  }
  flushParagraph()
  flushList()

  return <div className="space-y-4 text-sm sm:text-base">{blocks}</div>
}
