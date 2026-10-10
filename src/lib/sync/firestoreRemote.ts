import type { Remote } from './engine'
import type { RemoteItem } from './items'

/** Firestore implementation: users/{uid}/items/{id}. The security rules only allow a user to touch their own. */
export async function createFirestoreRemote(uid: string): Promise<Remote> {
  const [{ useAuth }, fs, { getFirebase }] = await Promise.all([import('@/lib/auth/store'), import('firebase/firestore'), import('@/lib/firebase/app')])
  const cfg = useAuth.getState().firebase
  if (!cfg) throw new Error('Firebase is not configured.')
  const { db } = getFirebase(cfg)
  const col = fs.collection(db, 'users', uid, 'items')

  const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))
  return {
    subscribe(onItems, onError) {
      return fs.onSnapshot(
        col,
        (snap) => onItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RemoteItem, 'id'>) }))),
        (e) => onError(new Error(e.code === 'permission-denied' ? 'Cloud sync is not allowed. The Firestore security rules may not be deployed yet.' : 'Could not reach cloud sync.')),
      )
    },
    async write(items) {
      for (const group of chunks(items, 400)) {
        const batch = fs.writeBatch(db)
        for (const { id, ...data } of group) batch.set(fs.doc(col, id), data)
        await batch.commit()
      }
    },
    async deleteAll() {
      const snap = await fs.getDocs(col)
      for (const group of chunks(snap.docs, 400)) {
        const batch = fs.writeBatch(db)
        group.forEach((d) => batch.delete(d.ref))
        await batch.commit()
      }
    },
  }
}
