import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

export interface FirebaseWebConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
}

/** Initialise Firebase once. This module is only loaded (dynamically) when sign-in is enabled. */
export function getFirebase(config: FirebaseWebConfig) {
  const existing = getApps().length > 0
  const app = existing ? getApp() : initializeApp(config)
  // Local cache lets edits made offline sync later, and is shared between tabs.
  const db = initializeFirestoreOnce(app)
  return { app, auth: getAuth(app), db }
}

let firestore: ReturnType<typeof initializeFirestore> | null = null
function initializeFirestoreOnce(app: ReturnType<typeof getApp>) {
  firestore ??= initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  return firestore
}
