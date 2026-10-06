#!/usr/bin/env node
/**
 * Product Book Generator for The Hoodie Gamer
 *
 * Pulls published listings from Firestore, enriches with live Etsy data,
 * runs Claude Vision analysis, performs tag audit, and compiles into
 * a structured Markdown document + CSV.
 *
 * Usage:
 *   node scripts/generateProductBook.js
 *   node scripts/generateProductBook.js --skip-vision --skip-etsy
 *   node scripts/generateProductBook.js --limit 5
 *   node scripts/generateProductBook.js --skip-vision --skip-etsy --limit 3
 */
import dotenv from 'dotenv'
dotenv.config({ override: true })
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { readFileSync, existsSync } from 'fs'
import fs from 'fs'
import path from 'path'

// ── CLI flags ────────────────────────────────────────────────────────────────
const SKIP_VISION = process.argv.includes('--skip-vision')
const SKIP_ETSY = process.argv.includes('--skip-etsy')
const LIMIT_IDX = process.argv.indexOf('--limit')
const LIMIT = LIMIT_IDX !== -1 ? parseInt(process.argv[LIMIT_IDX + 1], 10) : Infinity

// ── Validate env ─────────────────────────────────────────────────────────────
if (!SKIP_VISION && !process.env.ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY in .env (use --skip-vision to skip image analysis)')
  process.exit(1)
}
if (!SKIP_ETSY && !process.env.ETSY_API_KEY) {
  console.error('Missing ETSY_API_KEY in .env (use --skip-etsy to skip Etsy enrichment)')
  process.exit(1)
}

// ── Firebase init ────────────────────────────────────────────────────────────
const PROJECT_ID = 'gamer-art-factory'
const STORAGE_BUCKET = 'gamer-art-factory.firebasestorage.app'

// Try service account files first, then fall back to gcloud ADC
const SA_PATHS = [
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  './service-account.json',
  './gamer-art-factory-firebase-adminsdk.json',
  './firebase-adc.json',
].filter(Boolean)

let credential
for (const p of SA_PATHS) {
  try {
    if (!existsSync(p)) continue
    const raw = JSON.parse(readFileSync(p, 'utf8'))

    // authorized_user (gcloud ADC or firebase-adc.json) → set env var and use applicationDefault()
    if (raw.type === 'authorized_user') {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(p)
      credential = applicationDefault()
      console.log(`Using ADC credentials: ${p}`)
      break
    }

    // service_account → check project match, then use cert()
    if (raw.project_id && raw.project_id !== PROJECT_ID) {
      console.warn(`  Skipping ${p} (project: ${raw.project_id}, need: ${PROJECT_ID})`)
      continue
    }
    credential = cert(raw)
    console.log(`Using service account: ${p}`)
    break
  } catch { /* try next */ }
}

if (!credential) {
  try {
    credential = applicationDefault()
    console.log('Using Application Default Credentials')
  } catch {
    console.error('\nNo credentials found. Options:')
    console.error('  1. Run: gcloud auth application-default login')
    console.error('  2. Run: firebase login --reauth')
    console.error('  3. Save a service account key as ./service-account.json')
    process.exit(1)
  }
}

initializeApp({ credential, projectId: PROJECT_ID, storageBucket: STORAGE_BUCKET })
const db = getFirestore()
const bucket = getStorage().bucket()

// ── Constants ────────────────────────────────────────────────────────────────
const GIFT_INTENT_TAGS = [
  'gift for gamer', 'gamer gift idea', 'gift for teenage son',
  'gaming gift for teen', 'gift for boyfriend gamer', 'birthday gift gamer',
  'christmas gift gamer', 'unique gaming gift', 'gaming room gift', 'gifts for son',
]

const STYLE_TAGS = [
  'anime wall art', 'watercolor illustration', 'concept art print',
  'cyberpunk poster', 'lo-fi aesthetic art', 'illustrated wall art',
  'fantasy art poster', 'kawaii wall art', 'surreal art print',
  'pixel art poster', 'ink sketch art',
]

const ROOM_TAGS = [
  'gaming room decor', 'game room wall art', 'teen room decor',
  'boys room wall art', 'gaming room poster', 'dorm room gaming art',
  'gaming wall decor', 'bedroom wall art teen', 'gamer wall decor',
]

const GENERIC_SINGLE_TAGS = ['art', 'print', 'poster', 'decor', 'gaming', 'gamer', 'gift']
const STOP_WORDS = new Set(['for', 'the', 'a', 'an', 'in', 'of', 'and', 'with', 'to', 'is', 'on', 'at', 'by'])

const VISION_PROMPT = `You are analysing artwork for The Hoodie Gamer, a gaming wall art brand.
Examine this image carefully and return a JSON object with exactly these fields:

{
  "visual_description": "2-3 sentences describing what is literally depicted. Include: composition, colour palette, mood, key visual elements, art style. Write for someone who cannot see the image.",
  "art_style_confirmed": "single label, e.g. watercolor, anime illustration, concept art, photorealistic 3D render, charcoal sketch, pixel art",
  "dominant_colours": ["colour1", "colour2", "colour3"],
  "gamer_gender_presentation": "male / female / ambiguous / not visible",
  "hoodie_status": "hood up / hood down / no hoodie",
  "standout_elements": "1 sentence — the single most distinctive or memorable visual element that differentiates this from other listings",
  "gift_buyer_appeal": "1 sentence — why a mom or partner browsing Etsy would be drawn to this specific image",
  "suggested_missing_tags": ["tag1", "tag2", "tag3"]
}

SEO tag framework for reference:
GIFT-INTENT: gift for gamer, gamer gift idea, gift for teenage son, gaming gift for teen, gift for boyfriend gamer, birthday gift gamer, christmas gift gamer, unique gaming gift, gaming room gift, gifts for son
ROOM/DECOR: gaming room decor, game room wall art, teen room decor, boys room wall art, gaming room poster, dorm room gaming art, gaming wall decor, bedroom wall art teen
STYLE: anime wall art, watercolor illustration, concept art print, cyberpunk poster, lo-fi aesthetic art, illustrated wall art, fantasy art poster, kawaii wall art, surreal art print

For "suggested_missing_tags": suggest up to 3 tags that would accurately describe this image but are NOT already in the listing's current tag list. Only suggest tags that are genuinely accurate for this specific image.

Return ONLY valid JSON. No preamble, no markdown fences.`

// ── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function processInBatches(items, batchSize, fn) {
  const results = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
    console.log(`  Processed ${Math.min(i + batchSize, items.length)}/${items.length}`)
  }
  return results
}

// ── Step 1: Fetch published images ───────────────────────────────────────────
async function fetchPublishedImages() {
  console.log('\n── Step 1: Fetching published images from Firestore ──')

  const [physicalSnap, digitalSnap] = await Promise.all([
    db.collection('images').where('listing.status', '==', 'published').get(),
    db.collection('images').where('listing.digitalStatus', '==', 'published').get(),
  ])

  const imageMap = new Map()
  const addDocs = (snap) => {
    for (const doc of snap.docs) {
      if (!imageMap.has(doc.id)) {
        const data = doc.data()
        imageMap.set(doc.id, {
          id: doc.id,
          url: data.url || null,
          urlPrint: data.urlPrint || null,
          storagePath: data.storagePath || null,
          storagePathPrint: data.storagePathPrint || null,
          storagePathUpscaled: data.storagePathUpscaled || null,
          collection: data.collection || data.listing?.collection || null,
          collectionDisplayName: data.collectionDisplayName || data.listing?.collectionDisplayName || null,
          prompt: data.prompt || null,
          listing: data.listing || {},
        })
      }
    }
  }

  addDocs(physicalSnap)
  addDocs(digitalSnap)

  let images = Array.from(imageMap.values())

  // Apply limit
  if (LIMIT < images.length) {
    images = images.slice(0, LIMIT)
    console.log(`  Limited to ${LIMIT} images`)
  }

  // Group by collection
  const byCollection = {}
  for (const img of images) {
    const col = img.listing.collectionDisplayName || img.collection || 'Uncategorized'
    if (!byCollection[col]) byCollection[col] = []
    byCollection[col].push(img)
  }

  console.log(`  Total published: ${images.length}`)
  console.log(`  Collections: ${Object.keys(byCollection).join(', ')}`)
  for (const [col, imgs] of Object.entries(byCollection)) {
    console.log(`    ${col}: ${imgs.length} listings`)
  }

  return images
}

// ── Step 2: Etsy token + enrichment ──────────────────────────────────────────
async function getEtsyAccessToken() {
  const configDoc = await db.collection('config').doc('etsy').get()
  if (!configDoc.exists) throw new Error('Etsy not connected. Go to Settings → Etsy to connect.')
  const config = configDoc.data()

  const now = Date.now()
  const expiresAt = config.expiresAt?.toMillis?.() || config.expiresAt || 0

  if (now > expiresAt - 5 * 60 * 1000) {
    console.log('  Etsy token expired, refreshing...')
    const response = await fetch('https://api.etsy.com/v3/public/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.ETSY_API_KEY,
        refresh_token: config.refreshToken,
      }).toString(),
    })

    if (!response.ok) {
      const errBody = await response.text()
      throw new Error(`Etsy token refresh failed (${response.status}): ${errBody}`)
    }

    const tokens = await response.json()
    await db.collection('config').doc('etsy').update({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    })
    console.log('  Etsy token refreshed')
    return { accessToken: tokens.access_token, shopId: config.shopId }
  }

  return { accessToken: config.accessToken, shopId: config.shopId }
}

async function fetchEtsyListing(listingId, accessToken) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'x-api-key': process.env.ETSY_API_KEY,
  }

  const response = await fetch(
    `https://api.etsy.com/v3/application/listings/${listingId}`,
    { headers }
  )

  if (!response.ok) {
    if (response.status === 404) return null
    throw new Error(`Etsy API ${response.status}: ${await response.text()}`)
  }

  const data = await response.json()
  return {
    views: data.views || 0,
    favorites: data.num_favorers || 0,
    price: data.price ? (data.price.amount / data.price.divisor).toFixed(2) : null,
    state: data.state || 'unknown',
    url: data.url || null,
    tags: data.tags || [],
  }
}

async function enrichWithEtsyData(images) {
  console.log('\n── Step 2: Enriching with live Etsy data ──')

  if (SKIP_ETSY) {
    console.log('  Skipped (--skip-etsy)')
    return images.map((img) => ({ ...img, etsy: null }))
  }

  let etsyConfig
  try {
    etsyConfig = await getEtsyAccessToken()
  } catch (err) {
    console.error(`  Etsy auth failed: ${err.message}`)
    console.log('  Continuing without Etsy data...')
    return images.map((img) => ({ ...img, etsy: null }))
  }

  let successCount = 0
  let failCount = 0

  const enriched = []
  for (const img of images) {
    const etsyData = { physical: null, digital: null }

    // Physical listing (Gelato → Etsy)
    const physId = img.listing.etsyListingId
    if (physId) {
      try {
        etsyData.physical = await fetchEtsyListing(physId, etsyConfig.accessToken)
        if (etsyData.physical) successCount++
        else failCount++
      } catch (err) {
        console.warn(`  Failed to fetch physical listing ${physId}: ${err.message}`)
        failCount++
      }
      await sleep(200)
    }

    // Digital listing
    const digId = img.listing.etsyDigitalListingId
    if (digId) {
      try {
        etsyData.digital = await fetchEtsyListing(digId, etsyConfig.accessToken)
        if (etsyData.digital) successCount++
        else failCount++
      } catch (err) {
        console.warn(`  Failed to fetch digital listing ${digId}: ${err.message}`)
        failCount++
      }
      await sleep(200)
    }

    enriched.push({ ...img, etsy: etsyData })
  }

  console.log(`  Etsy enrichment: ${successCount} succeeded, ${failCount} failed`)
  return enriched
}

// ── Step 3: Claude Vision analysis ───────────────────────────────────────────
async function analyzeWithVision(images) {
  console.log('\n── Step 3: Running Claude Vision analysis ──')

  if (SKIP_VISION) {
    console.log('  Skipped (--skip-vision)')
    return images.map((img) => ({ ...img, vision: null }))
  }

  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const sharp = (await import('sharp')).default

  const MAX_RAW_BYTES = 3.7 * 1024 * 1024

  async function analyzeOne(img) {
    try {
      // Download image from Storage
      const storagePath = img.storagePathPrint || img.storagePathUpscaled || img.storagePath
      if (!storagePath) {
        console.warn(`  No storagePath for ${img.id}, skipping vision`)
        return { ...img, vision: null }
      }

      let [imageBuffer] = await bucket.file(storagePath).download()
      console.log(`  ${img.id}: ${(imageBuffer.length / 1024 / 1024).toFixed(1)}MB raw`)

      // Resize if too large for Claude's base64 limit
      if (imageBuffer.length > MAX_RAW_BYTES) {
        imageBuffer = await sharp(imageBuffer)
          .resize({ width: 1600, withoutEnlargement: true })
          .jpeg({ quality: 75 })
          .toBuffer()
        if (imageBuffer.length > MAX_RAW_BYTES) {
          imageBuffer = await sharp(imageBuffer)
            .resize({ width: 1200, withoutEnlargement: true })
            .jpeg({ quality: 65 })
            .toBuffer()
        }
        console.log(`  ${img.id}: resized to ${(imageBuffer.length / 1024 / 1024).toFixed(1)}MB`)
      }

      const imageBase64 = imageBuffer.toString('base64')

      // Build prompt with current tags context
      const currentTags = (img.listing.tags || []).join(', ')
      const promptWithContext = VISION_PROMPT +
        `\n\nThis listing's current tags are: [${currentTags}]\nOnly suggest tags NOT already in this list.`

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: promptWithContext },
          ],
        }],
      })

      const responseText = message.content.find((b) => b.type === 'text')?.text
      let visionData
      try {
        visionData = JSON.parse(responseText)
      } catch {
        const match = responseText.match(/\{[\s\S]*\}/)
        if (match) visionData = JSON.parse(match[0])
        else throw new Error('Could not parse Vision response as JSON')
      }

      await sleep(200)
      return { ...img, vision: visionData }
    } catch (err) {
      console.error(`  Vision failed for ${img.id}: ${err.message}`)
      return { ...img, vision: null }
    }
  }

  return processInBatches(images, 3, analyzeOne)
}

// ── Step 4: Tag audit ────────────────────────────────────────────────────────
function auditTags(img) {
  const tags = (img.listing.tags || []).map((t) => t.toLowerCase().trim())
  const title = img.listing.title || ''
  const audit = {}

  // 1. Gift intent
  audit.missingGiftIntent = !tags.some((t) => GIFT_INTENT_TAGS.includes(t))

  // 2. Title words in tags — flag tags that contain 2+ consecutive title words
  //    (single shared words are fine; Etsy indexes title separately)
  const titleLower = title.toLowerCase().replace(/[^a-z0-9\s]/g, '')
  const titleWords = titleLower.split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  const titlePairs = []
  for (let i = 0; i < titleWords.length - 1; i++) {
    titlePairs.push(titleWords[i] + ' ' + titleWords[i + 1])
  }
  const titleWordsInTags = tags.filter((tag) => titlePairs.some((pair) => tag.includes(pair)))
  audit.titleWordsInTags = titleWordsInTags.length > 0 ? titleWordsInTags : false

  // 3. Generic single-word tags
  const genericFound = tags.filter((t) => GENERIC_SINGLE_TAGS.includes(t))
  audit.genericTags = genericFound.length > 0 ? genericFound : false

  // 4. Style tag
  audit.missingStyleTag = !tags.some((t) => STYLE_TAGS.includes(t))

  // 5. Room/decor tag
  audit.missingRoomTag = !tags.some((t) => ROOM_TAGS.includes(t))

  // 6. Tag count
  audit.tagCount = tags.length
  audit.tooFewTags = tags.length < 13

  // 7. Tag too long (Etsy limit 20 chars)
  const tooLong = tags.filter((t) => t.length > 20)
  audit.tagTooLong = tooLong.length > 0 ? tooLong : false

  return audit
}

function runTagAudits(images) {
  console.log('\n── Step 4: Running tag audits ──')
  return images.map((img) => ({ ...img, audit: auditTags(img) }))
}

// ── Step 5: Compile output ───────────────────────────────────────────────────
function compileMarkdown(images) {
  console.log('\n── Step 5: Compiling Product Book ──')

  const now = new Date().toISOString()

  // Group by collection
  const byCollection = {}
  for (const img of images) {
    const col = img.listing.collectionDisplayName || img.collection || 'Uncategorized'
    if (!byCollection[col]) byCollection[col] = []
    byCollection[col].push(img)
  }

  // Audit summary
  const auditChecks = {
    'Missing gift-intent tag': images.filter((i) => i.audit.missingGiftIntent),
    'Title words in tags': images.filter((i) => i.audit.titleWordsInTags),
    'Generic tags': images.filter((i) => i.audit.genericTags),
    'Missing style tag': images.filter((i) => i.audit.missingStyleTag),
    'Missing room/decor tag': images.filter((i) => i.audit.missingRoomTag),
    'Fewer than 13 tags': images.filter((i) => i.audit.tooFewTags),
    'Tag over 20 chars': images.filter((i) => i.audit.tagTooLong),
  }

  let md = `# The Hoodie Gamer — Product Book
Generated: ${now}
Total published listings: ${images.length}
Collections: ${Object.keys(byCollection).sort().join(', ')}

---

## Audit Summary

| Check | Failing Listings | Count |
|---|---|---|
`

  for (const [check, failing] of Object.entries(auditChecks)) {
    // Use short names (collection + first title segment) to keep table readable
    const names = failing.map((i) => {
      const title = i.listing.title || i.id
      const short = title.split('|')[0].trim()
      return short.length > 40 ? short.slice(0, 37) + '...' : short
    }).join('; ')
    md += `| ${check} | ${names || '—'} | ${failing.length} |\n`
  }

  // Top 5 recommended fixes
  const sorted = Object.entries(auditChecks)
    .filter(([, f]) => f.length > 0)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5)

  md += '\n### Top 5 Recommended Fixes\n\n'
  if (sorted.length === 0) {
    md += 'All checks passed across all listings.\n'
  } else {
    sorted.forEach(([check, failing], i) => {
      md += `${i + 1}. **${check}** — ${failing.length} listing${failing.length > 1 ? 's' : ''} affected\n`
    })
  }

  md += '\n---\n'

  // Per-collection sections
  for (const colName of Object.keys(byCollection).sort()) {
    const colImages = byCollection[colName]

    // Most common art style in collection
    const styleCounts = {}
    for (const img of colImages) {
      const style = img.vision?.art_style_confirmed || img.listing.artStyle || 'unknown'
      styleCounts[style] = (styleCounts[style] || 0) + 1
    }
    const topStyle = Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'mixed'

    md += `\n## ${colName}\nListings: ${colImages.length} | Art style: ${topStyle}\n\n`

    for (const img of colImages) {
      const title = img.listing.title || `[Untitled — ${img.id}]`
      const tags = img.listing.tags || []

      md += `### ${title}\n\n`

      // Vision analysis
      if (img.vision) {
        const v = img.vision
        md += `**Visual description**\n${v.visual_description || 'N/A'}\n\n`
        md += `**Standout element:** ${v.standout_elements || 'N/A'}\n`
        md += `**Gift buyer appeal:** ${v.gift_buyer_appeal || 'N/A'}\n`
        md += `**Art style:** ${v.art_style_confirmed || 'N/A'} | **Colours:** ${(v.dominant_colours || []).join(', ') || 'N/A'}\n`
        md += `**Gamer:** ${v.gamer_gender_presentation || 'N/A'} | ${v.hoodie_status || 'N/A'}\n\n`
      } else {
        md += `**Visual analysis:** Skipped or unavailable\n\n`
      }

      // Etsy performance
      md += '**Etsy Performance**\n'
      if (img.etsy?.physical) {
        const e = img.etsy.physical
        md += `Physical: Views: ${e.views} | Favourites: ${e.favorites} | Price: $${e.price} | Status: ${e.state}\n`
        if (e.url) md += `[View on Etsy](${e.url})\n`
      } else if (img.listing.etsyListingId) {
        md += `Physical: [UNAVAILABLE] (Listing ID: ${img.listing.etsyListingId})\n`
      }
      if (img.etsy?.digital) {
        const e = img.etsy.digital
        md += `Digital: Views: ${e.views} | Favourites: ${e.favorites} | Price: $${e.price} | Status: ${e.state}\n`
        if (e.url) md += `[View on Etsy](${e.url})\n`
      } else if (img.listing.etsyDigitalListingId) {
        md += `Digital: [UNAVAILABLE] (Listing ID: ${img.listing.etsyDigitalListingId})\n`
      }
      if (!img.listing.etsyListingId && !img.listing.etsyDigitalListingId) {
        md += 'No Etsy listing IDs found\n'
      }
      md += '\n'

      // Tags
      md += `**Tags** (${tags.length}/13)\n`
      md += tags.map((t) => `\`${t}\``).join(', ') + '\n\n'

      // Tag audit
      md += '**Tag Audit**\n'
      const auditIssues = []
      if (img.audit.missingGiftIntent) auditIssues.push('Missing gift-intent tag')
      if (img.audit.titleWordsInTags) auditIssues.push(`Title words in tags: ${img.audit.titleWordsInTags.join(', ')}`)
      if (img.audit.genericTags) auditIssues.push(`Generic tags: ${img.audit.genericTags.join(', ')}`)
      if (img.audit.missingStyleTag) auditIssues.push('Missing style tag')
      if (img.audit.missingRoomTag) auditIssues.push('Missing room/decor tag')
      if (img.audit.tooFewTags) auditIssues.push(`Only ${img.audit.tagCount} tags (need 13)`)
      if (img.audit.tagTooLong) auditIssues.push(`Tags too long: ${img.audit.tagTooLong.join(', ')}`)

      if (auditIssues.length === 0) {
        md += 'All checks passed\n\n'
      } else {
        for (const issue of auditIssues) {
          md += `- ${issue}\n`
        }
        md += '\n'
      }

      // Suggested missing tags from vision
      if (img.vision?.suggested_missing_tags?.length > 0) {
        md += `**Suggested missing tags** (from image analysis)\n`
        md += img.vision.suggested_missing_tags.map((t) => `\`${t}\``).join(', ') + '\n\n'
      }

      // IDs
      md += '**IDs**\n'
      md += `Gelato: ${img.listing.gelatoProductId || '—'} | Etsy physical: ${img.listing.etsyListingId || '—'} | Etsy digital: ${img.listing.etsyDigitalListingId || '—'} | Firestore: ${img.id}\n\n`

      md += '---\n'
    }
  }

  return md
}

function compileTagAuditCsv(images) {
  const escCsv = (val) => {
    const s = String(val ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }

  const header = [
    'imageId', 'collection', 'etsyTitle', 'tagCount',
    'missingGiftIntent', 'titleWordsInTags', 'genericTags',
    'missingStyleTag', 'missingRoomTag', 'tagTooLong',
    'suggestedTag1', 'suggestedTag2', 'suggestedTag3',
  ]

  const rows = [header.join(',')]
  for (const img of images) {
    const suggested = img.vision?.suggested_missing_tags || []
    rows.push([
      escCsv(img.id),
      escCsv(img.listing.collectionDisplayName || img.collection || ''),
      escCsv(img.listing.title || ''),
      img.audit.tagCount,
      img.audit.missingGiftIntent ? 'YES' : '',
      img.audit.titleWordsInTags ? escCsv(img.audit.titleWordsInTags.join('; ')) : '',
      img.audit.genericTags ? escCsv(img.audit.genericTags.join('; ')) : '',
      img.audit.missingStyleTag ? 'YES' : '',
      img.audit.missingRoomTag ? 'YES' : '',
      img.audit.tagTooLong ? escCsv(img.audit.tagTooLong.join('; ')) : '',
      escCsv(suggested[0] || ''),
      escCsv(suggested[1] || ''),
      escCsv(suggested[2] || ''),
    ].join(','))
  }

  return rows.join('\n')
}

// ── Step 6: Write files and report ───────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║  The Hoodie Gamer — Product Book Generator  ║')
  console.log('╚══════════════════════════════════════════════╝')
  if (SKIP_VISION) console.log('  ⚡ Vision analysis: SKIPPED')
  if (SKIP_ETSY) console.log('  ⚡ Etsy enrichment: SKIPPED')
  if (LIMIT < Infinity) console.log(`  ⚡ Limit: ${LIMIT} images`)

  try {
    // Step 1
    let images = await fetchPublishedImages()
    if (images.length === 0) {
      console.log('\nNo published images found. Nothing to do.')
      process.exit(0)
    }

    // Step 2
    images = await enrichWithEtsyData(images)

    // Step 3
    images = await analyzeWithVision(images)

    // Step 4
    images = runTagAudits(images)

    // Step 5
    const markdown = compileMarkdown(images)
    const csv = compileTagAuditCsv(images)

    // Write output
    const outDir = path.resolve('product-book')
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

    const mdPath = path.join(outDir, 'product-book.md')
    const csvPath = path.join(outDir, 'tag-audit.csv')
    fs.writeFileSync(mdPath, markdown, 'utf-8')
    fs.writeFileSync(csvPath, csv, 'utf-8')

    // Step 6: Report
    const visionOk = images.filter((i) => i.vision).length
    const visionFail = images.filter((i) => !i.vision).length
    const etsyOk = images.filter((i) => i.etsy?.physical || i.etsy?.digital).length

    const auditTotals = {}
    for (const img of images) {
      if (img.audit.missingGiftIntent) auditTotals['Missing gift-intent'] = (auditTotals['Missing gift-intent'] || 0) + 1
      if (img.audit.titleWordsInTags) auditTotals['Title words in tags'] = (auditTotals['Title words in tags'] || 0) + 1
      if (img.audit.genericTags) auditTotals['Generic tags'] = (auditTotals['Generic tags'] || 0) + 1
      if (img.audit.missingStyleTag) auditTotals['Missing style tag'] = (auditTotals['Missing style tag'] || 0) + 1
      if (img.audit.missingRoomTag) auditTotals['Missing room tag'] = (auditTotals['Missing room tag'] || 0) + 1
      if (img.audit.tooFewTags) auditTotals['< 13 tags'] = (auditTotals['< 13 tags'] || 0) + 1
      if (img.audit.tagTooLong) auditTotals['Tag > 20 chars'] = (auditTotals['Tag > 20 chars'] || 0) + 1
    }

    console.log('\n╔══════════════════════════════════════════════╗')
    console.log('║              Generation Complete             ║')
    console.log('╚══════════════════════════════════════════════╝')
    console.log(`  Listings processed: ${images.length}`)
    console.log(`  Etsy enriched: ${etsyOk}`)
    console.log(`  Vision analyzed: ${visionOk} ok / ${visionFail} skipped`)
    console.log(`  Tag audit issues:`)
    if (Object.keys(auditTotals).length === 0) {
      console.log(`    None — all checks passed!`)
    } else {
      for (const [check, count] of Object.entries(auditTotals)) {
        console.log(`    ${check}: ${count}`)
      }
    }
    console.log(`\n  Output:`)
    console.log(`    ${mdPath}`)
    console.log(`    ${csvPath}`)
  } catch (err) {
    console.error('\nFATAL:', err.message)
    console.error(err.stack)
    process.exit(1)
  }
}

main()
