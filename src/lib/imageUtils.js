import { ref, getDownloadURL } from 'firebase/storage'
import { storage } from './firebase'

/**
 * Get a download URL for an image in Firebase Storage.
 */
export async function getImageUrl(storagePath) {
  const imageRef = ref(storage, storagePath)
  return getDownloadURL(imageRef)
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Generate a storage path for a new image.
 */
export function imagePath(jobId, index) {
  return `images/${jobId}/${index}.png`
}

/**
 * Generate a storage path for a thumbnail.
 */
export function thumbnailPath(jobId, index) {
  return `thumbnails/${jobId}/${index}.png`
}

/**
 * Generate a storage path for an upscaled image.
 */
export function upscaledPath(imageId) {
  return `upscaled/${imageId}.png`
}

/**
 * Rating colors for the curation UI.
 */
export const RATING_COLORS = {
  unrated: '#6c7086',
  keep: '#a6e3a1',
  maybe: '#f9e2af',
  reject: '#f38ba8',
}

/**
 * Rating keyboard shortcuts.
 */
export const RATING_KEYS = {
  '1': 'keep',
  '2': 'maybe',
  '3': 'reject',
}

/**
 * Predefined collections for organizing artwork.
 */
export const COLLECTIONS = [
  { slug: 'in-the-clouds', name: 'In the Clouds', tagline: 'Head in the clouds, hands on the keyboard', mood: 'Dreamy, pastel, cozy, floating clouds' },
  { slug: 'flow-state', name: 'Flow State', tagline: 'No mouse. No keyboard. Just flow.', mood: 'Zen, floating, yoga poses, meditative' },
  { slug: 'in-this-life-or-the-next', name: 'In This Life or the Next', tagline: 'In this life or the next — there is always another game', mood: 'Undead/skeleton gamer, eternal devotion, dark' },
  { slug: 'another-dimension', name: 'Another Dimension', tagline: 'Same game, infinite reflections', mood: 'Mirror rooms, recursive, infinite, mind-bending' },
  { slug: 'boss-level', name: 'Boss Level', tagline: '', mood: 'Power fantasy, epic throne, dramatic' },
  { slug: 'beautiful-bubbles', name: 'Beautiful Bubbles', tagline: '', mood: 'Gamers in soap bubbles floating in sky' },
  { slug: 'the-multitasker', name: 'The Multitasker', tagline: '', mood: 'Many arms, octopus gamer, doing everything at once' },
  { slug: 'sleep-is-overrated', name: 'Sleep is Overrated', tagline: '', mood: 'Late night grind, dark room, 3AM, energy can chaos' },
  { slug: 'neon-district', name: 'Neon District', tagline: '', mood: 'Full cyberpunk, rain, neon city' },
  { slug: 'pixel-nostalgia', name: 'Pixel Nostalgia', tagline: '', mood: 'Retro CRT, 8-bit, warm vintage' },
  { slug: 'till-the-sun-comes-up', name: 'Till the Sun Comes Up', tagline: '', mood: 'Morning golden light, dust beams, all-night session ending' },
  { slug: 'laser-focus', name: 'Laser Focus', tagline: '', mood: 'Clean minimal pro setup, aspirational' },
  { slug: 'respawn', name: 'Respawn', tagline: '', mood: 'Dark metal gothic' },
]
