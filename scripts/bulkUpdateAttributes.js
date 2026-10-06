#!/usr/bin/env node
/**
 * Bulk Attribute Updater for The Hoodie Gamer Etsy listings
 *
 * Etsy v3 calls these "properties". Update endpoint is one property at a time:
 *   PUT /v3/application/shops/{shop_id}/listings/{listing_id}/properties/{property_id}
 *
 * Framework set per ./auditAttributes.js findings + user decisions:
 *   - Orientation:    Vertical
 *   - Subject:        People & Portrait (multivalued — merged into existing)
 *   - Occasion:       Birthday (single-valued)
 *   - Holiday:        Christmas (single-valued)
 *   - Primary color:  collection-specific (single-valued)
 *   - Secondary color: collection-specific (single-valued, optional)
 *   Format and Recipient are NOT set — taxonomy 2078 doesn't support them.
 *
 * Usage:
 *   node scripts/bulkUpdateAttributes.js --dry-run         # preview only
 *   node scripts/bulkUpdateAttributes.js --live            # execute updates
 *   node scripts/bulkUpdateAttributes.js --collection "The Hero Within" --dry-run
 */
import dotenv from 'dotenv'
dotenv.config({ override: true })

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import path from 'path'

const TAXONOMY_ID = 2078

// ── CLI ──────────────────────────────────────────────────────────────────────
const DRY_RUN = !process.argv.includes('--live')
const COL_IDX = process.argv.indexOf('--collection')
const FILTER_COLLECTION = COL_IDX !== -1 ? process.argv[COL_IDX + 1] : null
const VERIFY = process.argv.includes('--verify')

// ── Auth ─────────────────────────────────────────────────────────────────────
if (!process.env.ETSY_API_KEY) {
  console.error('Missing ETSY_API_KEY in .env')
  process.exit(1)
}
const ETSY_CLIENT_ID = process.env.ETSY_API_KEY
const ETSY_X_API_KEY = process.env.ETSY_SHARED_SECRET
  ? `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`
  : process.env.ETSY_API_KEY

const ETSY_TOKENS_PATH = path.resolve('product-book/.etsy-tokens.json')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function loadLocalTokens() {
  if (!existsSync(ETSY_TOKENS_PATH)) return null
  try { return JSON.parse(readFileSync(ETSY_TOKENS_PATH, 'utf8')) } catch { return null }
}
function saveLocalTokens(data) {
  writeFileSync(ETSY_TOKENS_PATH, JSON.stringify(data, null, 2), 'utf8')
}

async function refreshEtsyToken(refreshToken, shopId) {
  console.log('  Refreshing Etsy token...')
  const r = await fetch('https://api.etsy.com/v3/public/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: ETSY_CLIENT_ID,
      refresh_token: refreshToken,
    }).toString(),
  })
  if (!r.ok) throw new Error(`Token refresh failed (${r.status}): ${await r.text()}`)
  const tokens = await r.json()
  const result = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    shopId,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  }
  saveLocalTokens(result)
  return { accessToken: tokens.access_token, shopId }
}

async function getEtsyAccessToken() {
  const local = loadLocalTokens()
  if (!local?.accessToken || !local?.refreshToken || !local?.shopId) {
    throw new Error(`No tokens at ${ETSY_TOKENS_PATH}. Run: node scripts/etsyAuth.js`)
  }
  const expiresAt = new Date(local.expiresAt).getTime() || 0
  if (Date.now() < expiresAt - 5 * 60 * 1000) {
    console.log('  Using cached local Etsy token')
    return { accessToken: local.accessToken, shopId: local.shopId }
  }
  return refreshEtsyToken(local.refreshToken, local.shopId)
}

function authHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}`, 'x-api-key': ETSY_X_API_KEY }
}

// ── Etsy API ─────────────────────────────────────────────────────────────────
async function fetchAllActiveListings(accessToken, shopId) {
  const all = []
  let offset = 0
  const limit = 100
  while (true) {
    const url = `https://api.etsy.com/v3/application/shops/${shopId}/listings?state=active&limit=${limit}&offset=${offset}`
    const r = await fetch(url, { headers: authHeaders(accessToken) })
    if (!r.ok) throw new Error(`List listings failed (${r.status}): ${await r.text()}`)
    const data = await r.json()
    all.push(...data.results)
    console.log(`  Fetched ${all.length}/${data.count}`)
    if (all.length >= data.count) break
    offset += limit
    await sleep(200)
  }
  return all
}

async function fetchTaxonomyProperties(accessToken, taxonomyId) {
  const url = `https://api.etsy.com/v3/application/seller-taxonomy/nodes/${taxonomyId}/properties`
  const r = await fetch(url, { headers: authHeaders(accessToken) })
  if (!r.ok) throw new Error(`Taxonomy properties failed (${r.status}): ${await r.text()}`)
  return await r.json()
}

async function fetchListingProperties(accessToken, shopId, listingId) {
  const url = `https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/properties`
  const r = await fetch(url, { headers: authHeaders(accessToken) })
  if (!r.ok) throw new Error(`Properties for ${listingId} failed (${r.status}): ${await r.text()}`)
  return await r.json()
}

async function updateListingProperty(accessToken, shopId, listingId, propertyId, valueIds, values) {
  const url = `https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/properties/${propertyId}`
  const body = new URLSearchParams()
  for (const id of valueIds) body.append('value_ids[]', String(id))
  for (const v of values) body.append('values[]', String(v))
  const r = await fetch(url, {
    method: 'PUT',
    headers: { ...authHeaders(accessToken), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!r.ok) throw new Error(`Update ${listingId} prop ${propertyId} failed (${r.status}): ${await r.text()}`)
  return await r.json()
}

// ── Framework ────────────────────────────────────────────────────────────────
// per-collection target { primary, secondary }
const COLLECTION_COLOR = {
  'The Hero Within':          { primary: 'Orange', secondary: 'Blue' },
  'Boss Level':               { primary: 'Gold',   secondary: 'Black' },
  'Respawn':                  { primary: 'Black',  secondary: null },
  'Neon District':            { primary: 'Black',  secondary: null },
  'Cold as Ice':              { primary: 'Blue',   secondary: 'White' },
  'Laser Focus':              { primary: 'Multicolor', secondary: null },
  'Sleep is Overrated':       { primary: 'Purple', secondary: 'Black' },
  'Tunnel Vision':            { primary: 'Purple', secondary: 'Black' },
  'Labyrinth':                { primary: 'Green',  secondary: 'Brown' },
  'Pixel Nostalgia':          { primary: 'Multicolor', secondary: null },
  'Like a butterfly':         { primary: 'Pink',   secondary: 'Mint Green' },
  'Beautiful Bubbles':        { primary: 'Blue',   secondary: 'White' },
  'In the Clouds':            { primary: 'Pink',   secondary: 'Mint Green' },
  'Flow State':               { primary: 'Blue',   secondary: 'White' },
  'The Multitasker':          { primary: 'Multicolor', secondary: null },
  'In This Life or the Next': { primary: 'Black',  secondary: null },
  'Spellbound':               { primary: 'Purple', secondary: 'Black' },
  // 'Another Dimension': color unspecified — leave both null
  'Another Dimension':        { primary: null, secondary: null },
}

// Etsy vocabulary mapping for color values that don't exist verbatim
const COLOR_REMAP = {
  'mint green': 'green',
  'multicolor': 'rainbow',
}

const KNOWN_COLLECTIONS = Object.keys(COLLECTION_COLOR)

function normalizeCollection(raw) {
  if (!raw) return null
  const r = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  // Direct case-insensitive match
  for (const k of KNOWN_COLLECTIONS) if (k.toLowerCase() === r) return k
  // "Spell bound" / "Spell Bound" / "Spellbound" all map to "Spellbound"
  if (r === 'spell bound' || r === 'spellbound') return 'Spellbound'
  return null
}

function parseCollectionFromTitle(title) {
  if (!title) return { collection: null, source: 'no-title', skip: false }
  const first = (title.split('|')[0] || '').trim()
  const direct = normalizeCollection(first)
  if (direct) return { collection: direct, source: 'prefix' }

  const t = title.toLowerCase()

  // Skip digital bundles entirely — different product type
  if (/\bbundle\b.*digital download/i.test(title) || /digital download.*\bbundle\b/i.test(title) || /\bbundle\s*#?\d+/i.test(title)) {
    return { collection: null, source: 'bundle', skip: true }
  }
  if (/\(digital download\)/i.test(title)) {
    return { collection: null, source: 'digital', skip: true }
  }

  // Inference from descriptive titles (priority order — first match wins).
  // No trailing \b so plurals/inflections (Bubbles, Multitasking) still match.
  const rules = [
    { rx: /\b(spell\s*bound|wizard|dark magic|ice magic|golden magic|fantasy forest|mystic|magical realm)/i, c: 'Spellbound' },
    { rx: /\b(butterfly|luna moth)/i,                                                                        c: 'Like a butterfly' },
    { rx: /\b(soap bubble|bubble)/i,                                                                         c: 'Beautiful Bubbles' },
    { rx: /\b(buddha|meditation|zen)/i,                                                                      c: 'Flow State' },
    { rx: /\b(multitask|multi[- ]arm)/i,                                                                     c: 'The Multitasker' },
    { rx: /\b(silhouette|hero journey|hero within|hero silhouette|reflection|sunset|epic hero|hero gamer)/i, c: 'The Hero Within' },
  ]
  for (const r of rules) {
    if (r.rx.test(t)) return { collection: r.c, source: 'inferred' }
  }
  return { collection: null, source: 'unmatched', skip: false }
}

// ── Property index ───────────────────────────────────────────────────────────
function buildPropertyIndex(taxonomyResp) {
  const byDisplay = {}
  for (const p of taxonomyResp.results || []) {
    const display = (p.display_name || p.name || '').toLowerCase()
    byDisplay[display] = {
      property_id: p.property_id,
      name: p.name,
      display_name: p.display_name,
      is_multivalued: p.is_multivalued,
      values: (p.possible_values || []).reduce((acc, v) => {
        acc[String(v.name).toLowerCase()] = { value_id: v.value_id, name: v.name }
        return acc
      }, {}),
    }
  }
  return byDisplay
}

function lookupValue(property, name) {
  if (!property) return null
  const remapped = COLOR_REMAP[name.toLowerCase()] || name
  return property.values[remapped.toLowerCase()] || null
}

// ── Build target update plan for a listing ───────────────────────────────────
function buildPlan(listing, currentProps, collection, propIdx) {
  // currentProps.results: [{ property_id, property_name, values:[], value_ids:[] }]
  const current = {}
  for (const p of currentProps.results || []) {
    current[(p.property_name || '').toLowerCase()] = {
      property_id: p.property_id,
      values: (p.values || []).map(String),
      value_ids: (p.value_ids || []).map(String),
    }
  }

  const orientation = propIdx['orientation']
  const subject     = propIdx['subject']
  const occasion    = propIdx['occasion']
  const holiday     = propIdx['holiday']
  const pColor      = propIdx['primary color']
  const sColor      = propIdx['secondary color']

  const updates = []
  const skipReasons = []

  // 1. Orientation = Vertical (single-valued, replace if mismatched)
  if (orientation) {
    const v = lookupValue(orientation, 'Vertical')
    const cur = current['orientation']
    const already = cur?.values?.[0]?.toLowerCase() === 'vertical'
    if (!already && v) {
      updates.push({ kind: 'Orientation', property_id: orientation.property_id, value_ids: [v.value_id], values: [v.name], cur: cur?.values || [] })
    }
  }

  // 2. Subject (multi-valued) — merge in "People & Portrait"
  if (subject) {
    const v = lookupValue(subject, 'People & Portrait')
    const cur = current['subject']
    const curNames = (cur?.values || []).map((s) => s.toLowerCase())
    if (v && !curNames.includes(v.name.toLowerCase())) {
      const mergedIds = [...(cur?.value_ids || []).map(Number), v.value_id]
      const mergedNames = [...(cur?.values || []), v.name]
      updates.push({ kind: 'Subject', property_id: subject.property_id, value_ids: mergedIds, values: mergedNames, cur: cur?.values || [] })
    }
  }

  // 3. Occasion = Birthday (single-valued)
  if (occasion) {
    const v = lookupValue(occasion, 'Birthday')
    const cur = current['occasion']
    const already = cur?.values?.[0]?.toLowerCase() === 'birthday'
    if (!already && v) {
      updates.push({ kind: 'Occasion', property_id: occasion.property_id, value_ids: [v.value_id], values: [v.name], cur: cur?.values || [] })
    }
  }

  // 4. Holiday = Christmas (single-valued)
  if (holiday) {
    const v = lookupValue(holiday, 'Christmas')
    const cur = current['holiday']
    const already = cur?.values?.[0]?.toLowerCase() === 'christmas'
    if (!already && v) {
      updates.push({ kind: 'Holiday', property_id: holiday.property_id, value_ids: [v.value_id], values: [v.name], cur: cur?.values || [] })
    } else if (!v) {
      skipReasons.push('Christmas not in Holiday possible_values')
    }
  }

  // 5. Primary color
  const colorPlan = COLLECTION_COLOR[collection]
  if (pColor && colorPlan?.primary) {
    const v = lookupValue(pColor, colorPlan.primary)
    if (v) {
      const cur = current['primary color']
      const already = cur?.values?.[0]?.toLowerCase() === v.name.toLowerCase()
      if (!already) {
        updates.push({ kind: 'Primary color', property_id: pColor.property_id, value_ids: [v.value_id], values: [v.name], cur: cur?.values || [] })
      }
    } else {
      skipReasons.push(`Primary color "${colorPlan.primary}" not in Etsy values`)
    }
  }

  // 6. Secondary color
  if (sColor && colorPlan?.secondary) {
    const v = lookupValue(sColor, colorPlan.secondary)
    if (v) {
      const cur = current['secondary color']
      const already = cur?.values?.[0]?.toLowerCase() === v.name.toLowerCase()
      if (!already) {
        updates.push({ kind: 'Secondary color', property_id: sColor.property_id, value_ids: [v.value_id], values: [v.name], cur: cur?.values || [] })
      }
    } else {
      skipReasons.push(`Secondary color "${colorPlan.secondary}" not in Etsy values`)
    }
  }

  return { updates, skipReasons }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║  The Hoodie Gamer — Bulk Attribute Updater  ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no Etsy changes)' : 'LIVE UPDATE'}`)
  if (FILTER_COLLECTION) console.log(`  Filter: ${FILTER_COLLECTION}`)
  console.log()

  const outDir = path.resolve('product-book')
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const { accessToken, shopId } = await getEtsyAccessToken()
  console.log(`  Shop ID: ${shopId}`)

  console.log('\n── Fetching taxonomy properties ──')
  const taxonomy = await fetchTaxonomyProperties(accessToken, TAXONOMY_ID)
  const propIdx = buildPropertyIndex(taxonomy)

  for (const p of ['orientation', 'subject', 'occasion', 'holiday', 'primary color', 'secondary color']) {
    if (!propIdx[p]) console.log(`  WARNING: property "${p}" not found in taxonomy`)
  }

  console.log('\n── Fetching active listings ──')
  const listings = await fetchAllActiveListings(accessToken, shopId)

  // Filter by collection if requested (matches inferred or prefix)
  console.log(`\n── Building update plans ──`)
  const plans = []
  for (let i = 0; i < listings.length; i++) {
    const L = listings[i]
    const parsed = parseCollectionFromTitle(L.title)

    if (parsed.skip) {
      plans.push({ listing: L, parsed, status: 'skipped-bundle' })
      continue
    }
    if (!parsed.collection) {
      plans.push({ listing: L, parsed, status: 'skipped-unmatched' })
      continue
    }
    if (FILTER_COLLECTION && parsed.collection !== FILTER_COLLECTION) {
      plans.push({ listing: L, parsed, status: 'skipped-filter' })
      continue
    }

    let cur
    try {
      cur = await fetchListingProperties(accessToken, shopId, L.listing_id)
    } catch (err) {
      plans.push({ listing: L, parsed, status: 'error-fetch', error: err.message })
      await sleep(200)
      continue
    }

    const { updates, skipReasons } = buildPlan(L, cur, parsed.collection, propIdx)
    plans.push({ listing: L, parsed, status: updates.length === 0 ? 'compliant' : 'planned', updates, skipReasons })

    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${listings.length}`)
    await sleep(200)
  }

  // ── Execute ──
  const log = []
  log.push(`# Attribute Update Log`)
  log.push(`Date: ${new Date().toISOString()}`)
  log.push(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  if (FILTER_COLLECTION) log.push(`Filter: ${FILTER_COLLECTION}`)
  log.push(`Total listings: ${listings.length}`)
  log.push('')

  let updatedCount = 0
  let plannedListings = 0
  let compliantCount = 0
  let skippedBundle = 0
  let skippedUnmatched = 0
  let skippedFilter = 0
  let errorCount = 0
  let propUpdateCount = 0
  let propFailedCount = 0

  // Track inferred collection counts for summary
  const inferredByCollection = {}
  const unmatchedTitles = []
  const bundleTitles = []

  for (let i = 0; i < plans.length; i++) {
    const p = plans[i]
    const L = p.listing
    const titleShort = (L.title || '').slice(0, 70)

    if (p.status === 'skipped-bundle') {
      skippedBundle++
      bundleTitles.push(`${L.listing_id} — ${titleShort}`)
      continue
    }
    if (p.status === 'skipped-unmatched') {
      skippedUnmatched++
      unmatchedTitles.push(`${L.listing_id} — ${titleShort}`)
      continue
    }
    if (p.status === 'skipped-filter') {
      skippedFilter++
      continue
    }
    if (p.status === 'error-fetch') {
      errorCount++
      log.push(`### [${p.parsed.collection || '?'}] ${L.listing_id} — ${titleShort}`)
      log.push(`- ERROR fetching current properties: ${p.error}`)
      log.push('')
      continue
    }
    if (p.status === 'compliant') {
      compliantCount++
      continue
    }

    // planned
    plannedListings++
    if (p.parsed.source === 'inferred') {
      inferredByCollection[p.parsed.collection] = (inferredByCollection[p.parsed.collection] || 0) + 1
    }

    log.push(`### [${p.parsed.collection}] ${L.listing_id} — ${titleShort}`)
    log.push(`- Source: ${p.parsed.source}`)
    if (p.skipReasons?.length) log.push(`- Notes: ${p.skipReasons.join('; ')}`)
    for (const u of p.updates) {
      log.push(`- ${u.kind}: [${u.cur.join(', ') || '—'}] → [${u.values.join(', ')}]`)
    }

    if (DRY_RUN) {
      log.push(`- STATUS: WOULD UPDATE (${p.updates.length} props)`)
      propUpdateCount += p.updates.length
      log.push('')
      continue
    }

    // LIVE: PUT each property update
    let listingUpdated = 0
    let listingFailed = 0
    for (const u of p.updates) {
      try {
        await updateListingProperty(accessToken, shopId, L.listing_id, u.property_id, u.value_ids, u.values)
        listingUpdated++
        propUpdateCount++
        await sleep(200)
      } catch (err) {
        listingFailed++
        propFailedCount++
        log.push(`  · FAIL ${u.kind}: ${err.message.slice(0, 200)}`)
        await sleep(200)
      }
    }
    log.push(`- STATUS: UPDATED ${listingUpdated}/${p.updates.length} props${listingFailed ? ` (${listingFailed} failed)` : ''}`)
    log.push('')
    if (listingUpdated > 0) updatedCount++

    if ((i + 1) % 10 === 0) console.log(`  Progress: ${i + 1}/${plans.length}`)
    // Slightly longer pause between listings
    await sleep(100)
  }

  // ── Footer summary ──
  log.push('---')
  log.push(`## Summary`)
  log.push(`- Total listings: ${listings.length}`)
  log.push(`- ${DRY_RUN ? 'Would update' : 'Updated'}: ${plannedListings} listings (${propUpdateCount} property writes)`)
  if (!DRY_RUN) log.push(`- Failed prop writes: ${propFailedCount}`)
  log.push(`- Already compliant: ${compliantCount}`)
  log.push(`- Skipped (bundle/digital): ${skippedBundle}`)
  log.push(`- Skipped (unmatched title): ${skippedUnmatched}`)
  if (FILTER_COLLECTION) log.push(`- Skipped (filter): ${skippedFilter}`)
  log.push(`- Fetch errors: ${errorCount}`)
  if (Object.keys(inferredByCollection).length) {
    log.push('')
    log.push(`Inferred collections (titles without "Collection |" prefix):`)
    for (const [c, n] of Object.entries(inferredByCollection).sort((a, b) => b[1] - a[1])) {
      log.push(`  - ${c}: ${n}`)
    }
  }
  if (bundleTitles.length) {
    log.push('')
    log.push(`Skipped bundles/digital downloads:`)
    bundleTitles.forEach((t) => log.push(`  - ${t}`))
  }
  if (unmatchedTitles.length) {
    log.push('')
    log.push(`Skipped — could not infer collection:`)
    unmatchedTitles.forEach((t) => log.push(`  - ${t}`))
  }

  const logPath = path.join(outDir, 'attribute-update-log.md')
  writeFileSync(logPath, log.join('\n'), 'utf8')

  // ── Verify (live only) ──
  if (!DRY_RUN && VERIFY) {
    console.log('\n── Verifying 5 random updated listings ──')
    const updated = plans.filter((p) => p.status === 'planned')
    const sample = updated.sort(() => Math.random() - 0.5).slice(0, 5)
    const verifyLines = ['', '## Verification (5 random sample)', '']
    for (const p of sample) {
      const cur = await fetchListingProperties(accessToken, shopId, p.listing.listing_id)
      const summary = (cur.results || []).map((r) => `${r.property_name}=${(r.values || []).join('/')}`).join('; ')
      verifyLines.push(`- ${p.listing.listing_id} [${p.parsed.collection}]: ${summary}`)
      await sleep(200)
    }
    writeFileSync(logPath, log.join('\n') + '\n' + verifyLines.join('\n'), 'utf8')
    console.log(`  Verification appended to ${logPath}`)
  }

  console.log('\n╔══════════════════════════════════════════════╗')
  console.log('║              Run Complete                    ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log(`  ${DRY_RUN ? 'Would update' : 'Updated'}:        ${plannedListings} listings (${propUpdateCount} props)`)
  if (!DRY_RUN) console.log(`  Failed prop writes:  ${propFailedCount}`)
  console.log(`  Already compliant:   ${compliantCount}`)
  console.log(`  Skipped (bundle):    ${skippedBundle}`)
  console.log(`  Skipped (unmatched): ${skippedUnmatched}`)
  if (FILTER_COLLECTION) console.log(`  Skipped (filter):    ${skippedFilter}`)
  console.log(`  Fetch errors:        ${errorCount}`)
  console.log(`  Log: ${logPath}`)
}

main().catch((err) => {
  console.error('\nFATAL:', err.message)
  console.error(err.stack)
  process.exit(1)
})
