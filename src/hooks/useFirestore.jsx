import { useState, useEffect, useCallback, useRef } from 'react'
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  startAfter,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

/**
 * Subscribe to a Firestore collection with optional filters.
 * Uses a cancelled flag to handle React StrictMode double-mount safely.
 */
export function useCollection(collectionName, filters = [], sortField = 'createdAt') {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Serialize filters for dependency tracking
  const filterKey = JSON.stringify(filters)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const constraints = []

    const parsedFilters = JSON.parse(filterKey)
    for (const f of parsedFilters) {
      constraints.push(where(f.field, f.op, f.value))
    }
    if (sortField) {
      constraints.push(orderBy(sortField, 'desc'))
    }

    const q = query(collection(db, collectionName), ...constraints)

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (cancelled) return
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
        setDocuments(docs)
        setLoading(false)
        setError(null)
      },
      (err) => {
        if (cancelled) return
        console.error(`Firestore error on ${collectionName}:`, err)
        setError(err)
        setLoading(false)
      }
    )

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [collectionName, filterKey, sortField])

  return { documents, loading, error }
}

/**
 * Paginated Firestore collection — loads `pageSize` docs at a time.
 * Returns { documents, loading, hasMore, loadMore, totalLoaded }
 */
export function usePaginatedCollection(collectionName, filters = [], sortField = 'createdAt', pageSize = 10) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const lastDocRef = useRef(null)
  const unsubscribesRef = useRef([])

  const filterKey = JSON.stringify(filters)

  // Reset when filters change
  useEffect(() => {
    // Cleanup old listeners
    unsubscribesRef.current.forEach((unsub) => unsub())
    unsubscribesRef.current = []
    setDocuments([])
    lastDocRef.current = null
    setHasMore(true)
    setLoading(true)

    const constraints = []
    const parsedFilters = JSON.parse(filterKey)
    for (const f of parsedFilters) {
      constraints.push(where(f.field, f.op, f.value))
    }
    if (sortField) {
      constraints.push(orderBy(sortField, 'desc'))
    }
    constraints.push(firestoreLimit(pageSize))

    const q = query(collection(db, collectionName), ...constraints)

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
        setDocuments(docs)
        lastDocRef.current = snapshot.docs[snapshot.docs.length - 1] || null
        setHasMore(snapshot.docs.length >= pageSize)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(`Firestore error on ${collectionName}:`, err)
        setError(err)
        setLoading(false)
      }
    )
    unsubscribesRef.current.push(unsubscribe)

    return () => {
      unsubscribesRef.current.forEach((unsub) => unsub())
      unsubscribesRef.current = []
    }
  }, [collectionName, filterKey, sortField, pageSize])

  const loadMore = useCallback(async () => {
    if (!lastDocRef.current || !hasMore || loadingMore) return
    setLoadingMore(true)

    const constraints = []
    const parsedFilters = JSON.parse(filterKey)
    for (const f of parsedFilters) {
      constraints.push(where(f.field, f.op, f.value))
    }
    if (sortField) {
      constraints.push(orderBy(sortField, 'desc'))
    }
    constraints.push(startAfter(lastDocRef.current))
    constraints.push(firestoreLimit(pageSize))

    const q = query(collection(db, collectionName), ...constraints)

    try {
      const snapshot = await getDocs(q)
      const newDocs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      lastDocRef.current = snapshot.docs[snapshot.docs.length - 1] || lastDocRef.current
      setHasMore(snapshot.docs.length >= pageSize)
      setDocuments((prev) => {
        // Deduplicate by id
        const existingIds = new Set(prev.map((d) => d.id))
        const unique = newDocs.filter((d) => !existingIds.has(d.id))
        return [...prev, ...unique]
      })
    } catch (err) {
      console.error('Load more error:', err)
      setError(err)
    } finally {
      setLoadingMore(false)
    }
  }, [collectionName, filterKey, sortField, pageSize, hasMore, loadingMore])

  return { documents, loading, loadingMore, hasMore, loadMore, error, totalLoaded: documents.length }
}

/**
 * Subscribe to a single Firestore document.
 */
export function useDocument(collectionName, docId) {
  const [document, setDocument] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!docId) {
      setDocument(null)
      setLoading(false)
      return
    }

    let cancelled = false

    const unsubscribe = onSnapshot(
      doc(db, collectionName, docId),
      (snapshot) => {
        if (cancelled) return
        if (snapshot.exists()) {
          setDocument({ id: snapshot.id, ...snapshot.data() })
        } else {
          setDocument(null)
        }
        setLoading(false)
      },
      (err) => {
        if (cancelled) return
        console.error(`Firestore error on ${collectionName}/${docId}:`, err)
        setError(err)
        setLoading(false)
      }
    )

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [collectionName, docId])

  return { document, loading, error }
}

/**
 * CRUD operations for a Firestore collection.
 */
export function useFirestoreCrud(collectionName) {
  const add = useCallback(
    async (data) => {
      const docRef = await addDoc(collection(db, collectionName), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      return docRef.id
    },
    [collectionName]
  )

  const update = useCallback(
    async (docId, data) => {
      await updateDoc(doc(db, collectionName, docId), {
        ...data,
        updatedAt: serverTimestamp(),
      })
    },
    [collectionName]
  )

  const remove = useCallback(
    async (docId) => {
      await deleteDoc(doc(db, collectionName, docId))
    },
    [collectionName]
  )

  const get = useCallback(
    async (docId) => {
      const snapshot = await getDoc(doc(db, collectionName, docId))
      if (snapshot.exists()) {
        return { id: snapshot.id, ...snapshot.data() }
      }
      return null
    },
    [collectionName]
  )

  return { add, update, remove, get }
}
