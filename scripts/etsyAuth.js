#!/usr/bin/env node
/**
 * Local Etsy OAuth flow — follows Etsy's quickstart tutorial pattern exactly.
 *
 * 1. Starts a local Express server on port 3003
 * 2. Opens the Etsy OAuth page in your browser
 * 3. Receives the callback with auth code
 * 4. Exchanges for access + refresh tokens
 * 5. Writes tokens to Firestore config/etsy
 *
 * Usage: node scripts/etsyAuth.js
 */
import dotenv from 'dotenv'
dotenv.config({ override: true })

import crypto from 'crypto'
import http from 'http'
import { URL } from 'url'
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'

const ETSY_API_KEY = process.env.ETSY_API_KEY
const ETSY_SHARED_SECRET = process.env.ETSY_SHARED_SECRET
if (!ETSY_API_KEY) {
  console.error('Missing ETSY_API_KEY in .env')
  process.exit(1)
}
// x-api-key header needs keystring:sharedsecret format
const ETSY_X_API_KEY = ETSY_SHARED_SECRET ? `${ETSY_API_KEY}:${ETSY_SHARED_SECRET}` : ETSY_API_KEY

// ── Firebase init (optional — tokens also saved locally) ─────────────────────
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
  console.log('  Firebase init skipped (tokens will be saved locally only)')
}

// ── PKCE generation (matches Etsy's tutorial exactly) ────────────────────────
const base64URLEncode = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest()

const codeVerifier = base64URLEncode(crypto.randomBytes(32))
const codeChallenge = base64URLEncode(sha256(codeVerifier))
const state = crypto.randomBytes(16).toString('hex')

const PORT = 3003
const REDIRECT_URI = `http://localhost:${PORT}/oauth/redirect`
const SCOPES = 'listings_w listings_r shops_r'

// ── Build OAuth URL ──────────────────────────────────────────────────────────
const authUrl =
  `https://www.etsy.com/oauth/connect?` +
  `response_type=code` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&client_id=${ETSY_API_KEY}` +
  `&state=${state}` +
  `&code_challenge=${codeChallenge}` +
  `&code_challenge_method=S256`

// ── Start local HTTP server ──────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (url.pathname === '/') {
    // Landing page with auth link
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(`
      <!DOCTYPE html>
      <html>
      <body style="font-family: sans-serif; padding: 40px; text-align: center;">
        <h1>Gamer Art Factory — Etsy OAuth</h1>
        <p>Click below to authorize your Etsy account:</p>
        <a href="${authUrl}" style="display: inline-block; padding: 16px 32px; background: #F56400; color: white; text-decoration: none; border-radius: 8px; font-size: 18px;">
          Connect Etsy Account
        </a>
      </body>
      </html>
    `)
    return
  }

  if (url.pathname === '/oauth/redirect') {
    const authCode = url.searchParams.get('code')
    const returnedState = url.searchParams.get('state')

    if (!authCode) {
      res.writeHead(400, { 'Content-Type': 'text/html' })
      res.end('<h1>Error: No auth code received</h1>')
      return
    }

    if (returnedState !== state) {
      res.writeHead(400, { 'Content-Type': 'text/html' })
      res.end('<h1>Error: State mismatch</h1>')
      return
    }

    console.log('  Auth code received, exchanging for tokens...')

    try {
      // Exchange auth code for tokens
      const tokenResponse = await fetch('https://api.etsy.com/v3/public/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: ETSY_API_KEY,
          redirect_uri: REDIRECT_URI,
          code: authCode,
          code_verifier: codeVerifier,
        }),
      })

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text()
        console.error('  Token exchange failed:', tokenResponse.status, errText)
        res.writeHead(500, { 'Content-Type': 'text/html' })
        res.end(`<h1>Token exchange failed</h1><pre>${errText}</pre>`)
        return
      }

      const tokenData = await tokenResponse.json()
      console.log('  Tokens received!')

      // Extract user/shop ID from access token (format: userId.tokenString)
      const userId = tokenData.access_token.split('.')[0]

      // Fetch shop ID
      let shopId = null
      try {
        const shopResponse = await fetch(
          `https://api.etsy.com/v3/application/users/${userId}/shops`,
          {
            headers: {
              'x-api-key': ETSY_X_API_KEY,
              Authorization: `Bearer ${tokenData.access_token}`,
            },
          }
        )
        if (shopResponse.ok) {
          const shopData = await shopResponse.json()
          shopId = String(shopData.results?.[0]?.shop_id || '')
          console.log(`  Shop ID: ${shopId}`)
        }
      } catch (err) {
        console.warn('  Could not fetch shop ID:', err.message)
      }

      // Write to Firestore
      const configData = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        shopId: shopId,
        defaultPrice: 6.99,
        taxonomyId: 2078,
        whoMade: 'i_did',
        whenMade: '2020_2025',
        scope: SCOPES,
      }

      if (db) {
        try {
          await db.collection('config').doc('etsy').set(configData, { merge: true })
          console.log('  Written to Firestore config/etsy')
        } catch (e) {
          console.log('  Could not write to Firestore:', e.message?.slice(0, 100))
        }
      } else {
        console.log('  Firestore unavailable — skipping Firestore write')
      }

      // Also save tokens locally for scripts that can't reach Firestore
      const localTokens = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        shopId: shopId,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      }
      const localPath = path.resolve('product-book/.etsy-tokens.json')
      try { mkdirSync(path.dirname(localPath), { recursive: true }) } catch {}
      writeFileSync(localPath, JSON.stringify(localTokens, null, 2), 'utf8')
      console.log('  Written to product-book/.etsy-tokens.json')

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`
        <!DOCTYPE html>
        <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>Etsy Connected!</h1>
          <p>Shop ID: <strong>${shopId}</strong></p>
          <p>Token expires: <strong>${new Date(Date.now() + tokenData.expires_in * 1000).toISOString()}</strong></p>
          <p>Config written to Firestore <code>config/etsy</code></p>
          <p style="color: green; font-size: 24px;">You can close this window and return to the terminal.</p>
        </body>
        </html>
      `)

      // Shut down after a brief delay
      setTimeout(() => {
        console.log('\n  Done! You can now run:')
        console.log('    node scripts/bulkUpdateTags.js --dry-run')
        server.close()
        process.exit(0)
      }, 2000)
    } catch (err) {
      console.error('  Error:', err.message)
      res.writeHead(500, { 'Content-Type': 'text/html' })
      res.end(`<h1>Error</h1><pre>${err.message}</pre>`)
    }
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

server.listen(PORT, () => {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║   Etsy OAuth — Local Authorization Flow     ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log(`\n  Server running at http://localhost:${PORT}`)
  console.log(`\n  1. Make sure http://localhost:${PORT}/oauth/redirect`)
  console.log(`     is registered as a callback URL in your Etsy app:`)
  console.log(`     https://www.etsy.com/developers/your-apps`)
  console.log(`\n  2. Open http://localhost:${PORT} in your browser`)
  console.log(`     and click "Connect Etsy Account"\n`)
})
