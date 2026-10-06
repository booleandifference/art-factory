/**
 * Assembles a nano prompt from selected concept building blocks.
 *
 * @param {Object} selections - The selected concepts
 * @param {Object|null} selections.camera - Camera setting concept
 * @param {Object} selections.theme - Theme concept
 * @param {Object[]} selections.props - Array of prop concepts
 * @param {Object|null} selections.text - Text expression concept (optional)
 * @param {Object} selections.bodyType - Body type concept
 * @param {Object} selections.chaosLevel - Chaos level concept
 * @param {Object} selections.style - Art style concept
 * @param {Object} formatParams - Format parameters
 * @returns {string} The assembled nano prompt
 */
// System prompt — always included to anchor the core gamer scene
const SYSTEM_PROMPT = 'gamer sitting at desk, left hand on keyboard, right hand on mouse, gaming monitor glowing in front'

export { SYSTEM_PROMPT }

export function assemblePrompt(selections, formatParams, { includeSystemPrompt = true } = {}) {
  const parts = []

  // System prompt first — anchors the scene
  if (includeSystemPrompt) parts.push(SYSTEM_PROMPT)

  // Camera / composition
  if (selections.camera) parts.push(selections.camera.value)

  // Core scene: body type + theme
  if (selections.bodyType) parts.push(selections.bodyType.value)
  if (selections.theme) parts.push(selections.theme.value)

  // Environment: chaos level sets the desk/room vibe
  if (selections.chaosLevel) parts.push(selections.chaosLevel.value)

  // Props: the relatable details
  if (selections.props?.length > 0) {
    const propValues = selections.props.map(p => p.value)
    parts.push(propValues.join(', '))
  }

  // Text expression (optional)
  if (selections.text) parts.push(selections.text.value)

  // Art style + format
  if (selections.style) parts.push(selections.style.value)

  // Format params
  if (formatParams?.aspectRatio) {
    parts.push(`--ar ${formatParams.aspectRatio}`)
  }

  return parts.join(', ')
}

/**
 * Generates a human-readable name for a prompt combination.
 */
export function generatePromptName(selections) {
  const parts = []
  if (selections.theme) parts.push(selections.theme.name)
  if (selections.text) parts.push(selections.text.name)
  if (selections.props?.length > 0) {
    parts.push(selections.props.map(p => p.name).slice(0, 2).join(' + '))
  }
  return parts.join(' — ') || 'Untitled Prompt'
}

/**
 * Default format parameters for print-ready art.
 */
export const DEFAULT_FORMAT_PARAMS = {
  aspectRatio: '2:3',
  orientation: 'portrait',
  size: 'A4',
}

/**
 * Available fal.ai models.
 */
export const FAL_MODELS = [
  { id: 'fal-ai/nano-banana-pro', name: 'Gemini 3 Pro', description: 'Gemini 3 Pro — best quality, up to 4K', cost: 'medium' },
  { id: 'fal-ai/nano-banana-2', name: 'Nano Banana 2', description: 'Gemini Flash — fast, high quality, up to 4K', cost: 'low' },
  { id: 'fal-ai/flux-pro', name: 'Flux Pro', description: 'Highest quality, production', cost: 'high' },
  { id: 'fal-ai/flux/dev', name: 'Flux Dev', description: 'Fast iteration, cheaper', cost: 'medium' },
  { id: 'fal-ai/flux-schnell', name: 'Flux Schnell', description: 'Fastest, rapid testing', cost: 'low' },
  { id: 'fal-ai/fast-sdxl', name: 'SDXL', description: 'Alternative model', cost: 'medium' },
]

/**
 * Default model parameters for fal.ai generation.
 */
export const DEFAULT_MODEL_PARAMS = {
  width: 768,
  height: 1088,
  num_inference_steps: 28,
  guidance_scale: 3.5,
  num_images: 1,
  enable_safety_checker: false,
  seed: null,
  // Nano Banana 2 specific
  aspectRatio: '2:3',
  resolution: '2K',
}

/**
 * Check if a model is Nano Banana (Gemini-based).
 */
export function isNanoBanana(modelId) {
  return modelId?.includes('nano-banana')
}

/**
 * Nano Banana 2 resolution options.
 */
export const NANO_RESOLUTIONS = ['0.5K', '1K', '2K', '4K']

/**
 * Assembles a mockup prompt from selected mockup concepts.
 */
export function assembleMockupPrompt(selections) {
  const parts = []

  // Camera / composition first
  if (selections.camera) parts.push(selections.camera.value)

  // Room scene sets the base
  if (selections.mockupRoom) parts.push(selections.mockupRoom.value)

  // Size display for scale context
  if (selections.mockupSize) parts.push(selections.mockupSize.value)

  // Lighting atmosphere
  if (selections.mockupLighting) parts.push(selections.mockupLighting.value)

  // Always add quality anchors for photorealistic mockups
  parts.push('high quality product photography, sharp focus, professional interior photography')

  return parts.join(', ')
}

/**
 * Generates a name for a mockup prompt.
 */
export function generateMockupPromptName(selections) {
  const parts = []
  if (selections.mockupRoom) parts.push(selections.mockupRoom.name)
  if (selections.mockupSize) parts.push(selections.mockupSize.name)
  return parts.join(' — ') || 'Untitled Mockup'
}

/**
 * Print size specifications.
 */
export const PRINT_SIZES = {
  A4: { width: 2480, height: 3508, label: 'A4 (210×297mm)' },
  A3: { width: 3508, height: 4961, label: 'A3 (297×420mm)' },
  A2: { width: 4961, height: 7016, label: 'A2 (420×594mm)' },
  A1: { width: 7016, height: 9933, label: 'A1 (594×841mm)' },
}
