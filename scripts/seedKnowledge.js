/**
 * Seed the Firestore `knowledge` collection from local .md files.
 *
 * Usage:
 *   node scripts/seedKnowledge.js
 *
 * Reads LISTING-AI.md and PROJECT_CONTEXT.md from the gitignored private/ folder
 * and upserts them into the `knowledge` collection (matched by slug).
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize Firebase Admin
const serviceAccount = JSON.parse(
  readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || "./service-account.json", "utf8")
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const KNOWLEDGE_DOCS = [
  {
    slug: "listing-ai",
    name: "LISTING-AI",
    category: "core",
    filePath: resolve(__dirname, "../private/LISTING-AI.md"),
  },
  {
    slug: "project-context",
    name: "PROJECT_CONTEXT",
    category: "core",
    filePath: resolve(__dirname, "../private/PROJECT_CONTEXT.md"),
  },
];

async function seed() {
  console.log("Seeding knowledge collection...\n");

  for (const doc of KNOWLEDGE_DOCS) {
    if (!existsSync(doc.filePath)) {
      console.warn(`  SKIP: ${doc.filePath} not found`);
      continue;
    }

    const content = readFileSync(doc.filePath, "utf-8");

    // Check if doc already exists by slug
    const existing = await db
      .collection("knowledge")
      .where("slug", "==", doc.slug)
      .limit(1)
      .get();

    const data = {
      slug: doc.slug,
      name: doc.name,
      category: doc.category,
      content,
      enabled: true,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (existing.empty) {
      data.createdAt = FieldValue.serverTimestamp();
      const ref = await db.collection("knowledge").add(data);
      console.log(`  CREATED: ${doc.name} (${ref.id}) — ${content.length} chars`);
    } else {
      const docRef = existing.docs[0].ref;
      await docRef.update(data);
      console.log(`  UPDATED: ${doc.name} (${docRef.id}) — ${content.length} chars`);
    }
  }

  console.log("\nDone!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
