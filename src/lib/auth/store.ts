import { create } from 'zustand'
import type { FirebaseWebConfig } from '@/lib/firebase/app'

export interface AuthUser {
  uid: string
  email: string
  name: string
  picture: string
}

interface AuthState {
  /** The server config was read and, if sign-in is on, Firebase reported who is signed in. */
  loaded: boolean
  /** Sign-in is configured on the server, so AI features and sync need it. */
  required: boolean
  firebase: FirebaseWebConfig | null
  user: AuthUser | null
  error: string | null
  load: () => Promise<void>
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

type Fb = Awaited<ReturnType<typeof loadFirebase>>
async function loadFirebase(config: FirebaseWebConfig) {
  const [{ getFirebase }, authMod] = await Promise.all([import('@/lib/firebase/app'), import('firebase/auth')])
  return { ...getFirebase(config), authMod }
}

let fb: Fb | null = null
let loading: Promise<void> | null = null

/** Firebase ID token for the signed-in user (refreshed automatically), or null. */
export async function getIdToken(): Promise<string | null> {
  try {
    return (await fb?.auth.currentUser?.getIdToken()) ?? null
  } catch {
    return null
  }
}

export const useAuth = create<AuthState>()((set, get) => ({
  loaded: false,
  required: false,
  firebase: null,
  user: null,
  error: null,
  load: () => {
    loading ??= (async () => {
      try {
        const res = await fetch('/api/auth/config')
        const cfg = (await res.json()) as { required?: boolean; firebase?: FirebaseWebConfig | null }
        if (!res.ok || !cfg.required || !cfg.firebase) return set({ loaded: true, required: false })
        set({ required: true, firebase: cfg.firebase })
        fb = await loadFirebase(cfg.firebase)
        await new Promise<void>((resolve) => {
          fb!.authMod.onAuthStateChanged(fb!.auth, (u) => {
            set({ loaded: true, user: u ? { uid: u.uid, email: u.email ?? '', name: u.displayName ?? u.email ?? '', picture: u.photoURL ?? '' } : null })
            resolve()
          })
        })
      } catch {
        // Server or Firebase unreachable: keep local features working.
        set({ loaded: true })
      }
    })()
    return loading
  },
  signIn: async () => {
    set({ error: null })
    if (!fb) await get().load()
    if (!fb) return set({ error: 'Sign-in is not available right now. Check your connection and try again.' })
    try {
      await fb.authMod.signInWithPopup(fb.auth, new fb.authMod.GoogleAuthProvider())
    } catch (e) {
      const code = (e as { code?: string }).code ?? ''
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return
      set({
        error:
          code === 'auth/popup-blocked'
            ? 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.'
            : code === 'auth/unauthorized-domain'
              ? 'This site is not an authorised domain in Firebase yet. The site owner must add it under Authentication → Settings.'
              : 'Sign-in failed. Please try again.',
      })
    }
  },
  signOut: async () => {
    await fb?.authMod.signOut(fb.auth)
    set({ user: null })
  },
}))

/** True when the user may use AI features: sign-in is not required, or they are signed in. */
export function canUseAi(s: Pick<AuthState, 'required' | 'user'>): boolean {
  return !s.required || s.user !== null
}

/** Test helper: forget the cached Firebase instance and loading state. */
export function resetAuthForTests(): void {
  fb = null
  loading = null
  useAuth.setState({ loaded: false, required: false, firebase: null, user: null, error: null })
}
