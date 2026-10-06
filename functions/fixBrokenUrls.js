#!/usr/bin/env node
/**
 * Migration script: Fix broken signed URLs → permanent token-based URLs
 *
 * Signed URLs (getSignedUrl) expire after 7 days. This script finds all images
 * whose url field does NOT use the permanent token format and regenerates them
 * from the storagePath using the same getPermUrl approach as processJob.
 *
 * Run from functions/: node fixBrokenUrls.js
 * Dry run: node fixBrokenUrls.js --dry-run
 */
const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");

admin.initializeApp({ projectId: "gamer-art-factory", storageBucket: "gamer-art-factory.firebasestorage.app" });
const db = admin.firestore();
const bucket = admin.storage().bucket();

const DRY_RUN = process.argv.includes("--dry-run");
const PERM_URL_PREFIX = "https://firebasestorage.googleapis.com/v0/b/";

async function getPermUrl(file) {
  const [metadata] = await file.getMetadata();
  let token = metadata.metadata?.firebaseStorageDownloadTokens;
  if (!token) {
    token = uuidv4();
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
  }
  const encodedPath = encodeURIComponent(file.name);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
}

async function fixBrokenUrls() {
  const snapshot = await db.collection("images").get();
  console.log(`\nScanning ${snapshot.size} images...`);
  if (DRY_RUN) console.log("(DRY RUN — no changes will be made)\n");

  let fixed = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const updates = {};

    // Fix main url
    if (data.url && !data.url.startsWith(PERM_URL_PREFIX) && data.storagePath) {
      try {
        const file = bucket.file(data.storagePath);
        const [exists] = await file.exists();
        if (exists) {
          updates.url = await getPermUrl(file);
        } else {
          console.log(`  SKIP ${doc.id}: storagePath not found: ${data.storagePath}`);
          skipped++;
          continue;
        }
      } catch (err) {
        console.log(`  ERROR ${doc.id}: ${err.message}`);
        errors++;
        continue;
      }
    }

    // Fix urlPrint
    if (data.urlPrint && !data.urlPrint.startsWith(PERM_URL_PREFIX) && data.storagePathPrint) {
      try {
        const file = bucket.file(data.storagePathPrint);
        const [exists] = await file.exists();
        if (exists) {
          updates.urlPrint = await getPermUrl(file);
        }
      } catch (err) {
        console.log(`  ERROR ${doc.id} (urlPrint): ${err.message}`);
      }
    }

    // Fix videoUrl
    if (data.videoUrl && !data.videoUrl.startsWith(PERM_URL_PREFIX) && data.videoPath) {
      try {
        const file = bucket.file(data.videoPath);
        const [exists] = await file.exists();
        if (exists) {
          updates.videoUrl = await getPermUrl(file);
        }
      } catch (err) {
        console.log(`  ERROR ${doc.id} (video): ${err.message}`);
      }
    }

    if (Object.keys(updates).length > 0) {
      if (DRY_RUN) {
        console.log(`  WOULD FIX ${doc.id}: ${Object.keys(updates).join(", ")}`);
      } else {
        await db.collection("images").doc(doc.id).update(updates);
        console.log(`  FIXED ${doc.id}: ${Object.keys(updates).join(", ")}`);
      }
      fixed++;
    } else {
      skipped++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Total images: ${snapshot.size}`);
  console.log(`  Fixed: ${fixed}`);
  console.log(`  Skipped (already OK): ${skipped}`);
  console.log(`  Errors: ${errors}`);
  if (DRY_RUN) console.log(`\nRe-run without --dry-run to apply changes.`);
}

fixBrokenUrls().catch(console.error);
