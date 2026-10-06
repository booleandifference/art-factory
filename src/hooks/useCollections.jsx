import { useState, useEffect, useCallback, useRef } from 'react'
import { collection, doc, getDocs, setDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { COLLECTIONS as DEFAULT_COLLECTIONS } from '../lib/imageUtils'

/**
 * Hook to manage collections from Firestore.
 * Seeds from hardcoded defaults on first load if Firestore is empty.
 * Returns collections array + CRUD operations.
 */
export function useCollections() {
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const seededRef = useRef(false)

  useEffect(() => {
    const q = query(collection(db, 'collections'), orderBy('order', 'asc'))
    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        if (snapshot.empty && !seededRef.current) {
          // Seed from defaults
          seededRef.current = true
          try {
            const batch = DEFAULT_COLLECTIONS.map((col, i) =>
              setDoc(doc(db, 'collections', col.slug), {
                ...col,
                order: i,
                createdAt: serverTimestamp(),
              })
            )
            await Promise.all(batch)
            // Snapshot listener will fire again with data
          } catch (err) {
            console.error('Failed to seed collections:', err)
            setError(err)
            setLoading(false)
          }
        } else {
          const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
          setCollections(docs)
          setLoading(false)
          setError(null)
        }
      },
      (err) => {
        console.error('Collections snapshot error:', err)
        setError(err)
        setLoading(false)
      }
    )
    return () => unsubscribe()
  }, [])

  const addCollection = useCallback(async ({ name, slug, tagline, mood }) => {
    const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    // Get next order number
    const snapshot = await getDocs(collection(db, 'collections'))
    const maxOrder = snapshot.docs.reduce((max, d) => Math.max(max, d.data().order || 0), -1)
    await setDoc(doc(db, 'collections', finalSlug), {
      name,
      slug: finalSlug,
      tagline: tagline || '',
      mood: mood || '',
      order: maxOrder + 1,
      createdAt: serverTimestamp(),
    })
    return finalSlug
  }, [])

  const updateCollection = useCallback(async (slug, data) => {
    await setDoc(doc(db, 'collections', slug), data, { merge: true })
  }, [])

  const removeCollection = useCallback(async (slug) => {
    await deleteDoc(doc(db, 'collections', slug))
  }, [])

  return { collections, loading, error, addCollection, updateCollection, removeCollection }
}
