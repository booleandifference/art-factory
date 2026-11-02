import { addDoc, collection, doc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

// Claude runs in the generateBundleListing Cloud Function (bundleListingJobs queue),
// so the Anthropic key stays a Firebase secret and never ships in the browser bundle.
const TIMEOUT_MS = 120_000

export async function generateBundleListing({ bundleName, collectionNames, imageCount, imageTitles }) {
  const jobRef = await addDoc(collection(db, 'bundleListingJobs'), {
    bundleName,
    collectionNames,
    imageCount,
    imageTitles,
    status: 'queued',
    result: null,
    error: null,
    createdAt: serverTimestamp(),
  })

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe()
      reject(new Error('Timed out waiting for the AI — check the generateBundleListing function logs'))
    }, TIMEOUT_MS)

    const unsubscribe = onSnapshot(
      doc(db, 'bundleListingJobs', jobRef.id),
      (snap) => {
        const job = snap.data()
        if (job?.status === 'completed') {
          clearTimeout(timer)
          unsubscribe()
          resolve(job.result)
        } else if (job?.status === 'failed') {
          clearTimeout(timer)
          unsubscribe()
          reject(new Error(job.error || 'AI generation failed'))
        }
      },
      (err) => {
        clearTimeout(timer)
        unsubscribe()
        reject(err)
      }
    )
  })
}
