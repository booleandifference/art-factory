#!/usr/bin/env node
/**
 * Audit listing attributes (Etsy v3 "properties") for The Hoodie Gamer.
 *
 * Etsy v3 note: what the dashboard calls "attributes" are "properties" in the API.
 *   - GET /v3/application/listings/{id}/properties           (read current)
 *   - PUT /v3/application/shops/{shop}/listings/{id}/properties/{property_id}  (update one)
 *   - GET /v3/application/seller-taxonomy/nodes/{tid}/properties               (valid options)
 *
 * Usage:
 *   node scripts/auditAttributes.js               # default — read-only audit
 *   node scripts/auditAttributes.js --dry-run     # alias for default (no writes ever happen)
 *
 * Outputs:
 *   product-book/attribute-mapping.json — taxonomy 2078 property + value IDs
 *   product-book/attribute-audit.md     — per-listing current vs target diff
 */
import dotenv from 'dotenv'
dotenv.config({ override: true })

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import path from 'path'

const TAXONOMY_ID = 2078 // Art Prints

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
    throw new Error(`Etsy token refresh failed (${response.status}): ${await response.text()}`)
  }
  const tokens = await response.json()
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
    throw new Error(
      `No tokens at ${ETSY_TOKENS_PATH}. Run: node scripts/etsyAuth.js`
    )
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

// ── Etsy API calls ───────────────────────────────────────────────────────────
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
    console.log(`  Fetched ${all.length}/${data.count} listings`)
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
  if (!r.ok) {
    const body = await r.text()
    throw new Error(`Properties for ${listingId} failed (${r.status}): ${body}`)
  }
  return await r.json()
}

// ── Target framework ─────────────────────────────────────────────────────────
const UNIVERSAL = {
  Orientation: ['Vertical'],
  Format: ['Print'],
  Subject: ['People and Portraits'],
  Occasion: ['Birthday', 'Christmas', 'Graduation'],
}

const COLLECTION_RECIPIENT = {
  'The Hero Within':          ['Him', 'Teen Boys'],
  'Boss Level':               ['Him', 'Teen Boys'],
  'Respawn':                  ['Him', 'Teen Boys'],
  'Neon District':            ['Him', 'Teen Boys'],
  'Cold as Ice':              ['Him', 'Teen Boys'],
  'Laser Focus':              ['Him', 'Teen Boys'],
  'Sleep is Overrated':       ['Him', 'Teen Boys'],
  'Tunnel Vision':            ['Him', 'Teen Boys'],
  'Labyrinth':                ['Him', 'Teen Boys'],
  'Pixel Nostalgia':          ['Him', 'Teen Boys'],
  'Like a butterfly':         ['Her', 'Teen Girls', 'Teen Boys'],
  'Beautiful Bubbles':        ['Her', 'Teen Girls', 'Teen Boys', 'Kids'],
  'In the Clouds':            ['Her', 'Teen Girls', 'Teen Boys', 'Kids'],
  'Flow State':               ['Her', 'Teen Girls', 'Teen Boys'],
  'The Multitasker':          ['Him', 'Her', 'Teen Boys', 'Teen Girls'],
  'Another Dimension':        ['Him', 'Her', 'Teen Boys', 'Teen Girls'],
  'In This Life or the Next': ['Him', 'Her', 'Teen Boys', 'Teen Girls'],
}

const COLLECTION_COLOR = {
  'The Hero Within':          ['Orange', 'Blue'],
  'Boss Level':               ['Gold', 'Black'],
  'Respawn':                  ['Black'],
  'Neon District':            ['Black'],
  'Cold as Ice':              ['Blue', 'White'],
  'Laser Focus':              ['Multicolor'],
  'Sleep is Overrated':       ['Purple', 'Black'],
  'Tunnel Vision':            ['Purple', 'Black'],
  'Labyrinth':                ['Green', 'Brown'],
  'Pixel Nostalgia':          ['Multicolor'],
  'Like a butterfly':         ['Pink', 'Mint Green'],
  'Beautiful Bubbles':        ['Blue', 'White', 'Pink', 'Mint Green'],
  'In the Clouds':            ['Pink', 'Mint Green'],
  'Flow State':               ['Blue', 'White'],
  'The Multitasker':          ['Multicolor'],
  'In This Life or the Next': ['Black'],
  // 'Another Dimension': not specified — color not enforced
}

// Normalize collection name → canonical key (case-insensitive lookup)
const KNOWN_COLLECTIONS = Object.keys(COLLECTION_RECIPIENT)
function normalizeCollection(raw) {
  if (!raw) return null
  const r = raw.trim().toLowerCase()
  for (const k of KNOWN_COLLECTIONS) if (k.toLowerCase() === r) return k
  return null
}

function parseCollectionFromTitle(title) {
  if (!title) return null
  const first = title.split('|')[0]?.trim() || ''
  return normalizeCollection(first) || first
}

function targetForCollection(collection) {
  const target = { ...UNIVERSAL }
  if (COLLECTION_RECIPIENT[collection]) target.Recipient = COLLECTION_RECIPIENT[collection]
  if (COLLECTION_COLOR[collection])     target['Primary color'] = COLLECTION_COLOR[collection]
  return target
}

// ── Mapping builder ──────────────────────────────────────────────────────────
// We need to find Etsy property IDs by display name (case-insensitive), and
// translate human value names → value IDs.
// Etsy's taxonomy property names we expect: Orientation, Format, Subject,
// Occasion, Recipient, Primary color, Secondary color, Holiday, etc.
function buildPropertyIndex(taxonomyResp) {
  // taxonomyResp: { results: [{ property_id, name, display_name, possible_values:[{value_id,name,scale_id?}], ... }] }
  const byDisplay = {}
  for (const p of taxonomyResp.results || []) {
    const display = (p.display_name || p.name || '').toLowerCase()
    byDisplay[display] = {
      property_id: p.property_id,
      name: p.name,
      display_name: p.display_name,
      is_multivalued: p.is_multivalued,
      values: (p.possible_values || []).reduce((acc, v) => {
        acc[String(v.name).toLowerCase()] = v.value_id
        return acc
      }, {}),
    }
  }
  return byDisplay
}

// Property names we care about (display name → key in our framework)
const FRAMEWORK_KEYS = {
  'orientation':    'Orientation',
  'format':         'Format',
  'subject':        'Subject',
  'occasion':       'Occasion',
  'recipient':      'Recipient',
  'primary color':  'Primary color',
}

function describeMapping(propIndex) {
  const out = {}
  for (const [displayLower, key] of Object.entries(FRAMEWORK_KEYS)) {
    const p = propIndex[displayLower]
    if (!p) { out[key] = { found: false }; continue }
    out[key] = {
      found: true,
      property_id: p.property_id,
      name: p.name,
      display_name: p.display_name,
      is_multivalued: p.is_multivalued,
      values: p.values, // lowercase name → value_id
    }
  }
  return out
}

// ── Audit logic ──────────────────────────────────────────────────────────────
function diffAttributes(currentProps, target, mapping) {
  // currentProps from Etsy: { results: [{ property_id, property_name, values: [...], value_ids: [...] }] }
  const current = {}
  for (const p of currentProps.results || []) {
    current[p.property_name?.toLowerCase()] = (p.values || []).map(String)
  }
  const diff = {}
  for (const [displayLower, frameworkKey] of Object.entries(FRAMEWORK_KEYS)) {
    const targetVals = target[frameworkKey]
    if (!targetVals || targetVals.length === 0) continue
    const cur = current[displayLower] || []
    const curLower = cur.map((v) => v.toLowerCase())
    const missing = targetVals.filter((v) => !curLower.includes(v.toLowerCase()))
    const mappingEntry = mapping[frameworkKey]
    const unmappableValues = mappingEntry?.found
      ? targetVals.filter((v) => mappingEntry.values[v.toLowerCase()] == null)
      : targetVals.slice()
    diff[frameworkKey] = {
      current: cur,
      target: targetVals,
      missing,
      unmappableValues,
      propertyMissingFromTaxonomy: !mappingEntry?.found,
    }
  }
  return diff
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║  The Hoodie Gamer — Attribute Audit         ║')
  console.log('╚══════════════════════════════════════════════╝')

  const outDir = path.resolve('product-book')
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const { accessToken, shopId } = await getEtsyAccessToken()
  console.log(`  Shop ID: ${shopId}`)

  // 1. Taxonomy properties
  console.log('\n── Fetching taxonomy properties (2078 — Art Prints) ──')
  const taxonomy = await fetchTaxonomyProperties(accessToken, TAXONOMY_ID)
  const propIndex = buildPropertyIndex(taxonomy)
  const mapping = describeMapping(propIndex)

  const mappingPath = path.join(outDir, 'attribute-mapping.json')
  writeFileSync(mappingPath, JSON.stringify({
    taxonomy_id: TAXONOMY_ID,
    framework_properties: mapping,
    raw_properties: Object.fromEntries(
      Object.entries(propIndex).map(([k, v]) => [k, {
        property_id: v.property_id,
        name: v.name,
        display_name: v.display_name,
        is_multivalued: v.is_multivalued,
        possible_values_count: Object.keys(v.values).length,
      }]),
    ),
  }, null, 2), 'utf8')
  console.log(`  Mapping saved: ${mappingPath}`)

  for (const [k, v] of Object.entries(mapping)) {
    if (!v.found) console.log(`  Property NOT in taxonomy 2078: ${k}`)
  }

  // 2. Listings
  console.log('\n── Fetching all active listings ──')
  const listings = await fetchAllActiveListings(accessToken, shopId)

  // 3. Per-listing audit
  console.log(`\n── Auditing ${listings.length} listings ──`)
  const lines = []
  lines.push(`# Attribute Audit`)
  lines.push(`Date: ${new Date().toISOString()}`)
  lines.push(`Shop: ${shopId}  Taxonomy: ${TAXONOMY_ID} (Art Prints)`)
  lines.push(`Total active listings: ${listings.length}`)
  lines.push('')

  // Mapping summary
  lines.push(`## Property mapping (taxonomy ${TAXONOMY_ID})`)
  for (const [k, v] of Object.entries(mapping)) {
    if (v.found) {
      lines.push(`- **${k}** → property_id ${v.property_id} · multivalued: ${v.is_multivalued} · ${Object.keys(v.values).length} possible values`)
    } else {
      lines.push(`- **${k}** → NOT AVAILABLE for this taxonomy`)
    }
  }
  lines.push('')

  // Per-collection counters
  const byCollection = {}
  const unknownCollections = new Set()
  const allDiffs = []

  for (let i = 0; i < listings.length; i++) {
    const L = listings[i]
    const title = L.title || ''
    const collection = parseCollectionFromTitle(title)
    const known = collection && COLLECTION_RECIPIENT[collection]

    let listingProps
    try {
      listingProps = await fetchListingProperties(accessToken, shopId, L.listing_id)
    } catch (err) {
      lines.push(`### ${L.listing_id} — ERROR fetching properties`)
      lines.push(`- Title: ${title.slice(0, 60)}`)
      lines.push(`- ${err.message}`)
      lines.push('')
      console.error(`  [${i + 1}/${listings.length}] ${L.listing_id} ERROR: ${err.message}`)
      await sleep(200)
      continue
    }

    const target = known ? targetForCollection(collection) : null
    const diff = target ? diffAttributes(listingProps, target, mapping) : null

    if (!known) unknownCollections.add(collection || '(unparseable)')

    const collKey = collection || '(unknown)'
    byCollection[collKey] = (byCollection[collKey] || 0) + 1

    allDiffs.push({ listing_id: L.listing_id, title, collection: collKey, diff, listingProps })

    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${listings.length}`)
    await sleep(200)
  }

  // Summary section
  lines.push(`## Summary by collection`)
  const sortedCols = Object.entries(byCollection).sort((a, b) => b[1] - a[1])
  for (const [c, n] of sortedCols) {
    const tag = COLLECTION_RECIPIENT[c] ? '' : ' (NOT IN FRAMEWORK)'
    lines.push(`- ${c}: ${n}${tag}`)
  }
  if (unknownCollections.size) {
    lines.push('')
    lines.push(`Collections in titles that are not in the framework:`)
    for (const u of unknownCollections) lines.push(`  - ${u}`)
  }
  lines.push('')

  // Per-listing detail
  lines.push(`## Listings`)
  for (const a of allDiffs) {
    const titleShort = (a.title || '').slice(0, 60)
    lines.push(`### [${a.collection}] ${a.listing_id} — ${titleShort}`)
    if (!a.diff) {
      lines.push(`- Skipped diff: collection not in framework`)
      const cur = (a.listingProps?.results || []).map((p) => `${p.property_name}=${(p.values || []).join('/')}`).join('; ')
      lines.push(`- Current attrs: ${cur || '(none)'}`)
      lines.push('')
      continue
    }
    let anyMissing = false
    for (const [k, d] of Object.entries(a.diff)) {
      if (d.propertyMissingFromTaxonomy) {
        lines.push(`- ${k}: PROPERTY NOT AVAILABLE in taxonomy`)
        continue
      }
      const flag = d.missing.length > 0 ? '  ⚠' : ''
      if (d.missing.length > 0) anyMissing = true
      lines.push(`- ${k}: current [${d.current.join(', ') || '—'}] · target [${d.target.join(', ')}] · missing [${d.missing.join(', ') || '—'}]${flag}`)
      if (d.unmappableValues.length > 0) {
        lines.push(`  · UNMAPPABLE values (no matching value_id in taxonomy): ${d.unmappableValues.join(', ')}`)
      }
    }
    if (!anyMissing) lines.push(`- ✓ all framework attributes already present`)
    lines.push('')
  }

  const auditPath = path.join(outDir, 'attribute-audit.md')
  writeFileSync(auditPath, lines.join('\n'), 'utf8')

  // Console summary
  const compliant = allDiffs.filter((a) => a.diff && Object.values(a.diff).every((d) => d.missing.length === 0 && !d.propertyMissingFromTaxonomy)).length
  const needsUpdate = allDiffs.filter((a) => a.diff && Object.values(a.diff).some((d) => d.missing.length > 0 && !d.propertyMissingFromTaxonomy)).length
  const skipped = allDiffs.filter((a) => !a.diff).length

  console.log('\n╔══════════════════════════════════════════════╗')
  console.log('║              Audit Complete                  ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log(`  Total listings:     ${allDiffs.length}`)
  console.log(`  Already compliant:  ${compliant}`)
  console.log(`  Needs update:       ${needsUpdate}`)
  console.log(`  Skipped (unknown):  ${skipped}`)
  console.log(`  Mapping: ${mappingPath}`)
  console.log(`  Audit:   ${auditPath}`)
}

main().catch((err) => {
  console.error('\nFATAL:', err.message)
  console.error(err.stack)
  process.exit(1)
})
