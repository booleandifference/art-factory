// Prompt assembly for the Mug Batch Production pipeline.
// Each approved image in a "mug" collection is used as a reference image for
// fal-ai/nano-banana-2/edit. The prompt below is the *edit instruction* —
// not a full text-to-image prompt. Character identity is seeded by the
// reference image, but appearance variations (hair, clothing, skin tone)
// deliberately override that identity so the buyer can pick specific looks.

export const DEFAULT_STYLE_MODIFIERS = {
  watercolor:
    'Tight expressive watercolor brushstrokes. No background. Pure white background. Square format.',
  pencil:
    'Detailed pencil drawing, fine graphite lines, subtle shading, paper texture. No background. Pure white background. Square format.',
  bold:
    'Bold graphic digital illustration. Thick black outlines, flat saturated colors, zero gradients. Dopamine color palette — hot coral, electric yellow, cobalt blue, neon mint. Retro cartoon energy. No background. Pure white background. Square format.',
  pixel:
    'Retro pixel art. 16-bit game sprite aesthetic, visible pixel grid, limited color palette, hard edges, no anti-aliasing. No background. Pure white background. Square format.',
}

export const STYLE_LABELS = {
  watercolor: 'Watercolor',
  pencil: 'Pencil sketch',
  bold: 'Bold / Play Haus',
  pixel: 'Pixel art',
}

export const GENDER_LABELS = {
  original: 'Original (as reference)',
  female: 'Replace with woman',
  male: 'Replace with man',
}

export const CLOTHING_OPTIONS = {
  'smart-casual': { label: 'Smart casual', fragment: 'a smart casual outfit' },
  'formal-shirt': { label: 'Formal — shirt', fragment: 'a crisp button-down shirt, tucked in' },
  'formal-blazer': { label: 'Formal — blazer', fragment: 'a fitted blazer over a shirt' },
  'formal-blouse': { label: 'Formal — blouse', fragment: 'an elegant silk blouse' },
  'formal-dress': { label: 'Formal — long dress', fragment: 'a long elegant dress' },
  'formal-wrap-dress': { label: 'Formal — wrap dress', fragment: 'a tailored wrap dress' },
  'informal-tshirt': { label: 'Informal — t-shirt', fragment: 'a plain t-shirt' },
  'informal-hoodie': { label: 'Informal — hoodie', fragment: 'a relaxed hoodie' },
  'informal-cardigan': { label: 'Informal — cardigan', fragment: 'a cozy oversized cardigan' },
}

export const HEADWEAR_OPTIONS = {
  none: { label: 'No hat', fragment: null },
  cap: { label: 'Cap', fragment: 'wearing a baseball cap' },
  'hood-up': { label: 'Hoodie up', fragment: 'with the hoodie pulled up over the head' },
  headphones: { label: 'Headphones on', fragment: 'wearing over-ear headphones' },
  earbuds: { label: 'Earbuds in', fragment: 'with small wireless earbuds in the ears' },
}

export const CLOTHING_COLORS = {
  neutral: { label: 'Neutral (white/grey/beige)', fragment: 'neutral white, grey or beige' },
  navy: { label: 'Navy', fragment: 'navy blue' },
  black: { label: 'Black', fragment: 'all black' },
  burgundy: { label: 'Burgundy', fragment: 'deep burgundy' },
  sage: { label: 'Sage green', fragment: 'muted sage green' },
  terracotta: { label: 'Warm terracotta', fragment: 'warm terracotta' },
}

export const HAIR_STYLES = {
  'messy-bun': { label: 'Messy bun', length: 'hair in a messy bun', isBun: true },
  'long-straight': { label: 'Long straight', length: 'long straight' },
  'long-wavy': { label: 'Long wavy', length: 'long wavy' },
  short: { label: 'Short', length: 'short' },
  curly: { label: 'Curly', length: 'curly' },
}

export const HAIR_COLORS = {
  brown: { label: 'Brown', fragment: 'brown' },
  blonde: { label: 'Blonde', fragment: 'blonde' },
  black: { label: 'Black', fragment: 'black' },
  auburn: { label: 'Red / auburn', fragment: 'auburn red' },
  silver: { label: 'Grey / silver', fragment: 'silver grey' },
}

// `default` intentionally has no fragment — model decides.
export const SKIN_TONES = {
  default: { label: 'Default (unspecified)', fragment: null },
  fair: { label: 'Fair', fragment: 'fair warm skin tone' },
  medium: { label: 'Medium', fragment: 'medium warm skin tone' },
  olive: { label: 'Olive', fragment: 'olive warm skin tone' },
  'deep-brown': { label: 'Deep brown', fragment: 'deep brown warm skin tone' },
  ebony: { label: 'Deep ebony', fragment: 'rich deep ebony skin tone' },
}

function buildHairFragment(hairStyleKey, hairColorKey) {
  const hs = hairStyleKey ? HAIR_STYLES[hairStyleKey] : null
  const hc = hairColorKey ? HAIR_COLORS[hairColorKey] : null
  if (!hs && !hc) return null

  if (hs?.isBun) {
    return hc ? `${hc.fragment} ${hs.length}` : hs.length
  }
  if (hs && hc) return `${hs.length} ${hc.fragment} hair`
  if (hs) return `${hs.length} hair`
  if (hc) return `${hc.fragment} hair`
  return null
}

export function assembleMugEditPrompt({
  styleModifier,
  gender = 'original',
  clothing = null,
  clothingColor = null,
  hairStyle = null,
  hairColor = null,
  skinTone = null,
  headwear = null,
}) {
  const changes = []

  const hairFrag = buildHairFragment(hairStyle, hairColor)
  if (hairFrag) changes.push(`give the figure ${hairFrag}`)

  const hw = headwear && HEADWEAR_OPTIONS[headwear]?.fragment
  if (hw) changes.push(`show the figure ${hw}`)

  const skinFrag = skinTone && SKIN_TONES[skinTone]?.fragment
  if (skinFrag) changes.push(`give the figure ${skinFrag}`)

  const cl = clothing ? CLOTHING_OPTIONS[clothing] : null
  const cc = clothingColor ? CLOTHING_COLORS[clothingColor] : null
  if (cl && cc) {
    changes.push(`dress the figure in ${cl.fragment} in ${cc.fragment} color`)
  } else if (cl) {
    changes.push(`dress the figure in ${cl.fragment}`)
  } else if (cc) {
    changes.push(`recolor the outfit to ${cc.fragment}`)
  }

  // If appearance changes are active, explicitly release identity lock so the
  // model actually honors the swaps rather than snapping back to the reference.
  const identityClause = changes.length
    ? 'Keep the same pose, same composition, and same framing. Appearance (hair, clothing, skin tone) should follow the overrides below — do not copy those from the reference image.'
    : 'Keep the same character identity, same pose, same composition, and same framing.'

  const base = `Redraw this image in a new style: ${styleModifier} ${identityClause}`

  const changeBlock = changes.length ? ` ${changes.map(capitalize).join('. ')}.` : ''

  let genderBlock = ''
  if (gender === 'male') {
    genderBlock = ' Replace the person in the image with a man.'
  } else if (gender === 'female') {
    genderBlock = ' Replace the person in the image with a woman.'
  }

  return `${base}${changeBlock}${genderBlock}`
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
