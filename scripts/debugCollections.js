#!/usr/bin/env node
/**
 * Debug script: check what collection values are stored on images
 * Run: node scripts/debugCollections.js
 */
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Use the default Firebase project (requires GOOGLE_APPLICATION_CREDENTIALS or gcloud auth)
initializeApp({ projectId: 'gamer-art-factory' })
const db = getFirestore()

async function debug() {
  // 1. Get all collections from Firestore
  const colSnap = await db.collection('collections').orderBy('order').get()
  const collections = colSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  console.log(`\n=== ${collections.length} Collections in Firestore ===`)
  collections.forEach(c => console.log(`  slug: "${c.slug}" | name: "${c.name}"`))

  // 2. Get all unique collection values from images
  const imgSnap = await db.collection('images').get()
  const collectionValues = {}
  let noCollection = 0
  let noCreatedAt = 0

  imgSnap.docs.forEach(d => {
    const data = d.data()
    const col = data.collection
    if (!data.createdAt) noCreatedAt++
    if (!col) {
      noCollection++
    } else {
      if (!collectionValues[col]) collectionValues[col] = { count: 0, sample: d.id }
      collectionValues[col].count++
    }
  })

  console.log(`\n=== ${imgSnap.size} Images total ===`)
  console.log(`  No collection: ${noCollection}`)
  console.log(`  No createdAt: ${noCreatedAt}`)
  console.log(`\n=== Collection values on images ===`)
  Object.entries(collectionValues)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([val, info]) => {
      const match = collections.find(c => c.slug === val)
      console.log(`  "${val}" → ${info.count} images ${match ? '✅ matches' : '❌ NO MATCH in collections'}`)
    })

  // 3. Check for collections with 0 matching images
  console.log(`\n=== Collections with 0 images ===`)
  collections.forEach(c => {
    if (!collectionValues[c.slug]) {
      console.log(`  "${c.slug}" (${c.name}) — 0 images`)
    }
  })
}

debug().catch(console.error)
