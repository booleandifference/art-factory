#!/usr/bin/env node
/**
 * Bulk Tag Updater for The Hoodie Gamer Etsy listings
 *
 * Reads tag-audit CSV, builds new 13-tag sets per collection,
 * matches to Etsy listings by title, and updates tags via Etsy API.
 *
 * Usage:
 *   node scripts/bulkUpdateTags.js --dry-run       # preview changes
 *   node scripts/bulkUpdateTags.js                  # live update
 *   node scripts/bulkUpdateTags.js --collection "Spell bound"  # single collection
 */
import dotenv from 'dotenv'
dotenv.config({ override: true })

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import path from 'path'

// ── CLI flags ────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run')
const COL_IDX = process.argv.indexOf('--collection')
const FILTER_COLLECTION = COL_IDX !== -1 ? process.argv[COL_IDX + 1] : null

// ── Validate env ─────────────────────────────────────────────────────────────
if (!process.env.ETSY_API_KEY) {
  console.error('Missing ETSY_API_KEY in .env')
  process.exit(1)
}
// x-api-key needs keystring:sharedsecret format; client_id is keystring only
const ETSY_CLIENT_ID = process.env.ETSY_API_KEY
const ETSY_X_API_KEY = process.env.ETSY_SHARED_SECRET
  ? `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`
  : process.env.ETSY_API_KEY

// ── Firebase init (optional — local token file can bypass Firestore) ────────
const PROJECT_ID = 'gamer-art-factory'
let db = null

try {
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
      if (raw.type === 'authorized_user') {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(p)
        credential = applicationDefault()
        break
      }
      if (raw.project_id && raw.project_id !== PROJECT_ID) continue
      credential = cert(raw)
      break
    } catch { /* next */ }
  }
  if (!credential) {
    try { credential = applicationDefault() } catch { throw new Error('no creds') }
  }

  initializeApp({ credential, projectId: PROJECT_ID })
  db = getFirestore()
} catch {
  console.log('  Firebase init skipped (will use local Etsy token file)')
}

// ── Dead tag blocklist ───────────────────────────────────────────────────────
const DEAD_TAGS = new Set([
  'teen room wall art', 'game room wall art', 'gamer wall decor',
  'gift for gamer', 'gamer gift idea', 'gaming gift for teen',
  'gift for teenage son', 'gaming room gift', 'fantasy art poster',
  'concept art print', 'gamer room poster', 'framed gaming art',
  'illustrated wall art', 'boys room wall art', 'teen gamer wall art',
  'anime gamer poster', 'gaming art for bedroom', 'gamer art print',
  'bedroom wall decor teen', 'gift for boyfriend gamer',
  'watercolor illustration', 'gift for teenage daughter',
  'silhouette wall art', 'personalized gift',
  'gift for him', 'gift for her',
])

// ── Tag configuration by collection ──────────────────────────────────────────
const UNIVERSAL_1_5 = ['gaming decor', 'gaming room decor', 'playroom wall art', 'video game posters', 'gaming wall art']
const FEMININE_1_5 = ['gaming decor', 'gaming room decor', 'girls room wall art', 'gaming wall art', 'video game posters']

const FEMININE_COLLECTIONS = new Set(['Like a butterfly', 'Beautiful Bubbles', 'In the Clouds'])

const AESTHETIC_6_8 = {
  'Spell bound':        ['cyberpunk poster', 'cyberpunk decor', 'dark fantasy decor'],
  'Tunnel Vision':      ['cyberpunk poster', 'cyberpunk decor', 'surreal art print'],
  'Cold as Ice':        ['cyberpunk poster', 'surreal art print', 'dragon wall art'],
  'The Hero Within':    ['surreal art print', 'landscape wall art', 'unique wall art'],
  'Like a butterfly':   ['scandi wall art', 'watercolor art print', 'unique wall art'],
  'Flow State':         ['anime wall art', 'scandi wall art', 'zen wall art'],
  'In the Clouds':      ['scandi wall art', 'watercolor art print', 'landscape wall art'],
  'Beautiful Bubbles':  ['scandi wall art', 'watercolor art print', 'unique wall art'],
  'The Multitasker':    ['gaming decor', 'gaming room decor', 'gaming wall art'],
  'Labyrinth':          ['cyberpunk poster', 'surreal art print', 'unique wall art'],
  'Another Dimension':  ['cyberpunk poster', 'surreal art print', 'unique wall art'],
}

// The Multitasker has completely different slots 1-5
const MULTITASKER_1_5 = ['japanese wall art', 'japanese poster', 'zen wall art', 'asian wall art', 'japanese art print']

const DEFAULT_12_13 = {
  'Spell bound':        ['wizard wall art', 'magic poster'],
  'Tunnel Vision':      ['vortex art print', 'sci fi wall art'],
  'Cold as Ice':        ['apocalypse poster', 'dark fantasy decor'],
  'The Hero Within':    ['silhouette art', 'inspirational poster'],
  'Like a butterfly':   ['butterfly wall art', 'transformation art'],
  'Flow State':         ['meditation wall art', 'landscape wall art'],
  'In the Clouds':      ['kawaii wall art', 'dreamy wall art'],
  'Beautiful Bubbles':  ['bubble wall art', 'dreamy wall art'],
  'The Multitasker':    ['funny gaming art', 'meditation wall art'],
  'Labyrinth':          ['maze wall art', 'dark fantasy decor'],
  'Another Dimension':  ['portal art print', 'sci fi wall art'],
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function isValidTag(tag) {
  if (!tag || typeof tag !== 'string') return false
  const t = tag.trim().toLowerCase()
  if (t.length === 0 || t.length > 20) return false
  if (DEAD_TAGS.has(t)) return false
  return true
}

function buildTagsForListing(collection, suggestedTags) {
  const tags = new Array(13).fill(null)

  // Slots 1-5
  if (collection === 'The Multitasker') {
    MULTITASKER_1_5.forEach((t, i) => { tags[i] = t })
  } else if (FEMININE_COLLECTIONS.has(collection)) {
    FEMININE_1_5.forEach((t, i) => { tags[i] = t })
  } else {
    UNIVERSAL_1_5.forEach((t, i) => { tags[i] = t })
  }

  // Slots 6-8 (aesthetic)
  const aesthetic = AESTHETIC_6_8[collection]
  if (aesthetic) {
    aesthetic.forEach((t, i) => { tags[5 + i] = t })
  }

  // Slots 9-10 (gift + broad)
  if (FEMININE_COLLECTIONS.has(collection)) {
    tags[8] = 'teen girl gifts'
  } else {
    tags[8] = 'teen boy gifts'
  }
  tags[9] = 'gamer gift'

  // Slot 11 (room)
  tags[10] = 'teen boy wall art'

  // Slots 12-13 (collection-specific or from suggested tags)
  const defaults = DEFAULT_12_13[collection] || ['unique wall art', 'gaming poster']
  const usedTags = new Set(tags.slice(0, 11))
  const validSuggested = (suggestedTags || [])
    .map((t) => t?.trim().toLowerCase())
    .filter((t) => isValidTag(t))
    .filter((t) => !usedTags.has(t))
    // Deduplicate within suggested list
    .filter((t, i, arr) => arr.indexOf(t) === i)

  tags[11] = validSuggested[0] || defaults[0]
  usedTags.add(tags[11])
  // Slot 13: pick next valid suggestion that isn't already used
  const remaining = validSuggested.filter((t) => !usedTags.has(t))
  tags[12] = remaining[0] || (defaults[1] !== tags[11] ? defaults[1] : defaults[0])

  // Final validation — every tag must be <= 20 chars
  const errors = []
  for (let i = 0; i < 13; i++) {
    if (!tags[i] || tags[i].length > 20) {
      errors.push(`Slot ${i + 1}: "${tags[i]}" exceeds 20 chars or is empty`)
      // Substitute with a safe fallback
      const fallbacks = DEFAULT_12_13[collection] || ['unique wall art', 'gaming poster']
      tags[i] = i >= 11 ? fallbacks[i - 11] || 'unique wall art' : 'gaming poster'
    }
  }

  return { tags, errors }
}

// ── CSV parser ───────────────────────────────────────────────────────────────
function parseCSV(csvPath) {
  const content = readFileSync(csvPath, 'utf8')
  const lines = content.trim().split('\n')
  const header = lines[0].split(',')

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    // Handle CSV with quoted fields
    const values = []
    let current = ''
    let inQuotes = false
    for (const char of lines[i]) {
      if (char === '"') { inQuotes = !inQuotes; continue }
      if (char === ',' && !inQuotes) { values.push(current); current = ''; continue }
      current += char
    }
    values.push(current)

    const row = {}
    header.forEach((h, idx) => { row[h.trim()] = values[idx]?.trim() || '' })
    rows.push(row)
  }
  return rows
}

// ── Etsy token file (local fallback when Firestore ADC is broken) ───────────
const ETSY_TOKENS_PATH = path.resolve('product-book/.etsy-tokens.json')

function saveLocalTokens(data) {
  writeFileSync(ETSY_TOKENS_PATH, JSON.stringify(data, null, 2), 'utf8')
}

function loadLocalTokens() {
  if (!existsSync(ETSY_TOKENS_PATH)) return null
  try { return JSON.parse(readFileSync(ETSY_TOKENS_PATH, 'utf8')) } catch { return null }
}

// ── Etsy API ─────────────────────────────────────────────────────────────────
async function refreshEtsyToken(refreshToken, shopId) {
  console.log('  Refreshing Etsy token...')
  const response = await fetch('https://api.etsy.com/v3/public/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: ETSY_CLIENT_ID,
      refresh_token: refreshToken,
    }).toString(),
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Etsy token refresh failed (${response.status}): ${errBody}`)
  }

  const tokens = await response.json()
  const result = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    shopId,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  }

  // Save locally so next run doesn't need Firestore
  saveLocalTokens(result)

  // Try to update Firestore too (non-fatal if it fails)
  try {
    if (!db) throw new Error('no db')
    await db.collection('config').doc('etsy').update({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    })
  } catch (e) {
    console.log('  (Could not update Firestore — using local tokens only)')
  }

  return { accessToken: tokens.access_token, shopId }
}

async function getEtsyAccessToken() {
  // 1. Try local token file first (works even when Firestore ADC is broken)
  const local = loadLocalTokens()
  if (local?.accessToken && local?.refreshToken && local?.shopId) {
    const expiresAt = new Date(local.expiresAt).getTime() || 0
    if (Date.now() < expiresAt - 5 * 60 * 1000) {
      console.log('  Using cached local Etsy token')
      return { accessToken: local.accessToken, shopId: local.shopId }
    }
    // Token expired — refresh using local refresh token
    return refreshEtsyToken(local.refreshToken, local.shopId)
  }

  // 2. Fall back to Firestore
  if (!db) {
    throw new Error(
      'No local Etsy token file and Firestore is unavailable.\n' +
      'Run: node scripts/etsyAuth.js   to connect your Etsy account.'
    )
  }
  const configDoc = await db.collection('config').doc('etsy').get()
  if (!configDoc.exists) {
    throw new Error(
      'config/etsy not found in Firestore and no local token file.\n' +
      'Run: node scripts/etsyAuth.js   to connect your Etsy account.'
    )
  }
  const config = configDoc.data()

  const now = Date.now()
  const expiresAt = config.expiresAt?.toMillis?.() || config.expiresAt || 0

  // Save to local file for future use
  saveLocalTokens({
    accessToken: config.accessToken,
    refreshToken: config.refreshToken,
    shopId: config.shopId,
    expiresAt: new Date(expiresAt).toISOString(),
  })

  if (now > expiresAt - 5 * 60 * 1000) {
    return refreshEtsyToken(config.refreshToken, config.shopId)
  }

  return { accessToken: config.accessToken, shopId: config.shopId }
}

async function fetchAllEtsyListings(accessToken, shopId) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'x-api-key': ETSY_X_API_KEY,
  }

  const allListings = []
  let offset = 0
  const limit = 100

  while (true) {
    const url = `https://api.etsy.com/v3/application/shops/${shopId}/listings?state=active&limit=${limit}&offset=${offset}`
    const response = await fetch(url, { headers })

    if (!response.ok) {
      throw new Error(`Etsy list listings failed (${response.status}): ${await response.text()}`)
    }

    const data = await response.json()
    allListings.push(...data.results)

    console.log(`  Fetched ${allListings.length}/${data.count} Etsy listings`)
    if (allListings.length >= data.count) break
    offset += limit
    await sleep(200)
  }

  return allListings
}

function matchEtsyListings(etsyListings, csvRows) {
  // Build a map of full Etsy title (lowercase) → listing
  const etsyByFullTitle = new Map()
  for (const listing of etsyListings) {
    const title = listing.title?.trim()
    if (title) {
      etsyByFullTitle.set(title.toLowerCase(), listing)
    }
  }

  // Track which Etsy listings have already been claimed
  const claimedIds = new Set()
  const matched = []
  const unmatched = []

  for (const row of csvRows) {
    const csvTitle = (row.csvTitle || row.etsyTitle || '').trim()
    const csvTitleLower = csvTitle.toLowerCase()
    let etsyListing = null

    // 1. Exact full-title match
    const exact = etsyByFullTitle.get(csvTitleLower)
    if (exact && !claimedIds.has(exact.listing_id)) {
      etsyListing = exact
    }

    // 2. Fuzzy: find the Etsy listing with the longest common prefix
    if (!etsyListing && csvTitleLower) {
      let bestMatch = null
      let bestOverlap = 0
      for (const listing of etsyListings) {
        if (claimedIds.has(listing.listing_id)) continue
        const etTitle = listing.title?.trim().toLowerCase() || ''
        // Calculate shared prefix length
        let overlap = 0
        const maxLen = Math.min(csvTitleLower.length, etTitle.length)
        for (let c = 0; c < maxLen; c++) {
          if (csvTitleLower[c] === etTitle[c]) overlap++
          else break
        }
        // Require at least 30 chars of shared prefix to match
        if (overlap > bestOverlap && overlap >= 30) {
          bestOverlap = overlap
          bestMatch = listing
        }
      }
      if (bestMatch) etsyListing = bestMatch
    }

    if (etsyListing) {
      claimedIds.add(etsyListing.listing_id)
      matched.push({ ...row, etsyListingId: etsyListing.listing_id, etsyTitle: etsyListing.title, oldTags: etsyListing.tags || [] })
    } else {
      unmatched.push(row)
    }
  }

  return { matched, unmatched }
}

async function updateEtsyListingTags(listingId, tags, accessToken, shopId) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'x-api-key': ETSY_X_API_KEY,
    'Content-Type': 'application/x-www-form-urlencoded',
  }

  const response = await fetch(
    `https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}`,
    {
      method: 'PATCH',
      headers,
      body: new URLSearchParams({ tags: tags.join(',') }).toString(),
    }
  )

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Etsy update failed for ${listingId} (${response.status}): ${errBody}`)
  }

  return await response.json()
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║   The Hoodie Gamer — Bulk Tag Updater       ║')
  console.log('╚══════════════════════════════════════════════╝')
  if (DRY_RUN) console.log('  Mode: DRY RUN (no Etsy changes)')
  else console.log('  Mode: LIVE UPDATE')
  if (FILTER_COLLECTION) console.log(`  Filter: ${FILTER_COLLECTION}`)

  // ── 1. Read CSV ──
  const csvPath = path.resolve('product-book/tag-audit - Kopi.csv')
  if (!existsSync(csvPath)) {
    // Try without the copy suffix
    const altPath = path.resolve('product-book/tag-audit.csv')
    if (!existsSync(altPath)) {
      console.error(`CSV not found at ${csvPath} or ${altPath}`)
      process.exit(1)
    }
  }

  const csvRows = parseCSV(existsSync(csvPath) ? csvPath : path.resolve('product-book/tag-audit.csv'))
  console.log(`\n  Read ${csvRows.length} rows from CSV`)

  // Filter by collection if specified
  let rows = FILTER_COLLECTION
    ? csvRows.filter((r) => r.collection === FILTER_COLLECTION)
    : csvRows

  console.log(`  Processing ${rows.length} listings`)

  // ── 2. Build new tags for each listing ──
  const updates = []
  const tagErrors = []

  for (const row of rows) {
    const collection = row.collection
    if (!AESTHETIC_6_8[collection]) {
      console.warn(`  Unknown collection "${collection}" for ${row.imageId}, skipping`)
      continue
    }

    const suggestedTags = [row.suggestedTag1, row.suggestedTag2, row.suggestedTag3].filter(Boolean)
    const { tags, errors } = buildTagsForListing(collection, suggestedTags)

    if (errors.length > 0) {
      tagErrors.push({ imageId: row.imageId, collection, errors })
    }

    updates.push({
      imageId: row.imageId,
      collection,
      csvTitle: row.etsyTitle,
      newTags: tags,
      suggestedUsed: suggestedTags.filter((t) => tags.includes(t?.trim().toLowerCase())),
    })
  }

  if (tagErrors.length > 0) {
    console.log(`\n  Tag validation errors:`)
    tagErrors.forEach((e) => console.log(`    ${e.imageId}: ${e.errors.join(', ')}`))
  }

  // ── 3. Match to Etsy listings ──
  let etsyConfig = null
  let etsyListings = []
  let matchResult = { matched: [], unmatched: [] }

  if (!DRY_RUN) {
    console.log('\n── Connecting to Etsy API ──')
    try {
      etsyConfig = await getEtsyAccessToken()
      console.log(`  Shop ID: ${etsyConfig.shopId}`)

      console.log('  Fetching all active listings...')
      etsyListings = await fetchAllEtsyListings(etsyConfig.accessToken, etsyConfig.shopId)

      matchResult = matchEtsyListings(etsyListings, updates)
      console.log(`  Matched: ${matchResult.matched.length}`)
      console.log(`  Unmatched: ${matchResult.unmatched.length}`)
    } catch (err) {
      console.error(`\n  Etsy API error: ${err.message}`)
      if (!DRY_RUN) {
        console.error('  Cannot proceed with live update. Use --dry-run to preview changes.')
        process.exit(1)
      }
    }
  }

  // ── 4. Output dry-run or execute updates ──
  const logLines = []
  logLines.push(`# Tag Update Log`)
  logLines.push(`Date: ${new Date().toISOString()}`)
  logLines.push(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  logLines.push(`Total listings: ${updates.length}`)
  logLines.push('')

  let updatedCount = 0
  let skippedCount = 0
  let failedCount = 0

  if (DRY_RUN) {
    // Dry run — just show proposed changes
    for (const update of updates) {
      const line = [
        `[${update.collection}] ${update.csvTitle?.split('|')[0]?.trim() || update.imageId}`,
        `  NEW: ${update.newTags.join(', ')}`,
      ].join('\n')
      console.log(`\n${line}`)
      logLines.push(line)
      logLines.push('')
      updatedCount++
    }
  } else {
    // Live update — process matched listings in batches of 5
    const toUpdate = matchResult.matched
    for (let i = 0; i < toUpdate.length; i++) {
      const item = toUpdate[i]
      // Find the matching update
      const update = updates.find((u) => u.imageId === item.imageId)
      if (!update) { skippedCount++; continue }

      const line = [
        `[${update.collection}] Etsy #${item.etsyListingId}`,
        `  TITLE: ${item.etsyTitle?.slice(0, 80)}`,
        `  OLD: ${item.oldTags.join(', ')}`,
        `  NEW: ${update.newTags.join(', ')}`,
      ].join('\n')

      try {
        await updateEtsyListingTags(item.etsyListingId, update.newTags, etsyConfig.accessToken, etsyConfig.shopId)
        console.log(`  [${i + 1}/${toUpdate.length}] Updated: ${item.etsyListingId}`)
        logLines.push(line)
        logLines.push('  STATUS: UPDATED')
        logLines.push('')
        updatedCount++
      } catch (err) {
        console.error(`  [${i + 1}/${toUpdate.length}] Failed: ${item.etsyListingId} — ${err.message}`)
        logLines.push(line)
        logLines.push(`  STATUS: FAILED — ${err.message}`)
        logLines.push('')
        failedCount++
      }

      // Rate limit: pause every 5 requests
      if ((i + 1) % 5 === 0 && i + 1 < toUpdate.length) {
        await sleep(500)
      }
    }

    // Log unmatched
    for (const item of matchResult.unmatched) {
      logLines.push(`[${item.collection}] ${item.csvTitle?.split('|')[0]?.trim() || item.imageId}`)
      logLines.push('  STATUS: SKIPPED (no Etsy match)')
      logLines.push('')
      skippedCount++
    }
  }

  // ── 5. Write log ──
  const outDir = path.resolve('product-book')
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  logLines.push('---')
  logLines.push(`Updated: ${updatedCount}`)
  logLines.push(`Skipped (no Etsy ID): ${skippedCount}`)
  logLines.push(`Failed: ${failedCount}`)

  const logPath = path.join(outDir, 'tag-update-log.md')
  writeFileSync(logPath, logLines.join('\n'), 'utf8')

  // ── 6. Summary ──
  console.log('\n╔══════════════════════════════════════════════╗')
  console.log('║              Update Complete                 ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log(`  ${DRY_RUN ? 'Would update' : 'Updated'}: ${updatedCount} listings`)
  console.log(`  Skipped (no Etsy ID): ${skippedCount} listings`)
  console.log(`  Failed: ${failedCount} listings`)
  console.log(`  Log: ${logPath}`)
}

main().catch((err) => {
  console.error('\nFATAL:', err.message)
  process.exit(1)
})
