#!/usr/bin/env node
/**
 * Fix gendered gift tags → gamer gift across all Etsy listings
 *
 * Usage:
 *   node scripts/fixGiftTags.js --dry-run   # preview changes
 *   node scripts/fixGiftTags.js              # live update
 */
import dotenv from 'dotenv'
dotenv.config({ override: true })

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'

// ── CLI flags ────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run')

// ── Env ──────────────────────────────────────────────────────────────────────
const ETSY_CLIENT_ID = process.env.ETSY_API_KEY
const ETSY_X_API_KEY = process.env.ETSY_SHARED_SECRET
  ? `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`
  : process.env.ETSY_API_KEY

// ── Local Etsy tokens ────────────────────────────────────────────────────────
const TOKENS_PATH = path.resolve('product-book/.etsy-tokens.json')

function loadTokens() {
  if (!existsSync(TOKENS_PATH)) {
    console.error('No token file at', TOKENS_PATH)
    process.exit(1)
  }
  return JSON.parse(readFileSync(TOKENS_PATH, 'utf8'))
}

function saveTokens(data) {
  writeFileSync(TOKENS_PATH, JSON.stringify(data, null, 2), 'utf8')
}

async function getAccessToken() {
  const tokens = loadTokens()
  const expiresAt = new Date(tokens.expiresAt).getTime() || 0

  if (Date.now() < expiresAt - 5 * 60 * 1000) {
    return tokens
  }

  // Refresh
  console.log('  Refreshing Etsy token...')
  const res = await fetch('https://api.etsy.com/v3/public/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: ETSY_CLIENT_ID,
      refresh_token: tokens.refreshToken,
    }).toString(),
  })

  if (!res.ok) throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`)

  const data = await res.json()
  const updated = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    shopId: tokens.shopId,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }
  saveTokens(updated)
  return updated
}

// ── Etsy API helpers ─────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchAllListings(accessToken, shopId) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'x-api-key': ETSY_X_API_KEY,
  }
  const all = []
  let offset = 0

  while (true) {
    const url = `https://api.etsy.com/v3/application/shops/${shopId}/listings?state=active&limit=100&offset=${offset}`
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${await res.text()}`)
    const data = await res.json()
    all.push(...data.results)
    console.log(`  Fetched ${all.length}/${data.count} listings`)
    if (all.length >= data.count) break
    offset += 100
    await sleep(200)
  }
  return all
}

async function patchListingTags(listingId, tags, accessToken, shopId) {
  const res = await fetch(
    `https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-api-key': ETSY_X_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ tags: tags.join(',') }).toString(),
    }
  )
  if (!res.ok) throw new Error(`PATCH ${listingId} failed (${res.status}): ${await res.text()}`)
  return res.json()
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║   Gift Tag Fix — gift for him/her → gamer gift ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE UPDATE'}`)

  const { accessToken, shopId } = await getAccessToken()
  console.log(`  Shop ID: ${shopId}`)

  console.log('\n  Fetching all active listings...')
  const listings = await fetchAllListings(accessToken, shopId)

  // Find listings with gift for him / gift for her
  const REPLACE_TAGS = new Set(['gift for him', 'gift for her'])
  const REPLACEMENT = 'gamer gift'

  const affected = []
  for (const listing of listings) {
    const tags = listing.tags || []
    const found = tags.find((t) => REPLACE_TAGS.has(t.toLowerCase()))
    if (found) {
      affected.push({ listing, oldTag: found })
    }
  }

  console.log(`\n  Found ${affected.length} listings with gendered gift tags out of ${listings.length} total`)

  // Check if any already have gamer gift AND a gendered tag (edge case)
  const logLines = []
  logLines.push('# Gift Tag Fix Log')
  logLines.push(`Date: ${new Date().toISOString()}`)
  logLines.push(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  logLines.push(`Affected: ${affected.length} / ${listings.length} listings`)
  logLines.push('')
  logLines.push('| # | Listing ID | Title | Old Tag | New Tag | Status |')
  logLines.push('|---|-----------|-------|---------|---------|--------|')

  let updatedCount = 0
  let skippedCount = 0
  let failedCount = 0

  for (let i = 0; i < affected.length; i++) {
    const { listing, oldTag } = affected[i]
    const title = listing.title?.slice(0, 60) || '(no title)'
    const tags = [...listing.tags]

    // Replace the gendered tag with gamer gift
    const idx = tags.findIndex((t) => t.toLowerCase() === oldTag.toLowerCase())
    if (idx === -1) {
      logLines.push(`| ${i + 1} | ${listing.listing_id} | ${title} | ${oldTag} | — | SKIPPED (tag not found) |`)
      skippedCount++
      continue
    }

    // Check if gamer gift already exists
    const hasGamerGift = tags.some((t) => t.toLowerCase() === REPLACEMENT)
    if (hasGamerGift) {
      // Remove the gendered tag entirely since gamer gift is already there
      tags.splice(idx, 1)
      console.log(`  [${i + 1}/${affected.length}] ${listing.listing_id} — already has "${REPLACEMENT}", removing "${oldTag}"`)
    } else {
      tags[idx] = REPLACEMENT
    }

    if (DRY_RUN) {
      console.log(`  [${i + 1}/${affected.length}] ${listing.listing_id} — "${oldTag}" → "${REPLACEMENT}" (${title})`)
      logLines.push(`| ${i + 1} | ${listing.listing_id} | ${title} | ${oldTag} | ${REPLACEMENT} | WOULD UPDATE |`)
      updatedCount++
    } else {
      try {
        await patchListingTags(listing.listing_id, tags, accessToken, shopId)
        console.log(`  [${i + 1}/${affected.length}] Updated: ${listing.listing_id}`)
        logLines.push(`| ${i + 1} | ${listing.listing_id} | ${title} | ${oldTag} | ${REPLACEMENT} | UPDATED |`)
        updatedCount++
      } catch (err) {
        console.error(`  [${i + 1}/${affected.length}] Failed: ${listing.listing_id} — ${err.message}`)
        logLines.push(`| ${i + 1} | ${listing.listing_id} | ${title} | ${oldTag} | ${REPLACEMENT} | FAILED: ${err.message.slice(0, 50)} |`)
        failedCount++
      }

      if ((i + 1) % 5 === 0 && i + 1 < affected.length) await sleep(500)
    }
  }

  // Write log
  logLines.push('')
  logLines.push('---')
  logLines.push(`${DRY_RUN ? 'Would update' : 'Updated'}: ${updatedCount}`)
  logLines.push(`Skipped: ${skippedCount}`)
  logLines.push(`Failed: ${failedCount}`)

  const outDir = path.resolve('product-book')
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  const logPath = path.join(outDir, 'gift-tag-fix-log.md')
  writeFileSync(logPath, logLines.join('\n'), 'utf8')

  console.log('\n╔══════════════════════════════════════════════╗')
  console.log('║              Fix Complete                    ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log(`  ${DRY_RUN ? 'Would update' : 'Updated'}: ${updatedCount}`)
  console.log(`  Skipped: ${skippedCount}`)
  console.log(`  Failed: ${failedCount}`)
  console.log(`  Log: ${logPath}`)
}

main().catch((err) => {
  console.error('\nFATAL:', err.message)
  process.exit(1)
})
