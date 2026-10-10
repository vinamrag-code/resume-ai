import { create } from 'zustand'
import type { FirebaseWebConfig } from '@/lib/firebase/app'

export interface AuthUser {
  uid: string
  email: string
  name: string
  picture: string
  /** Google accounts are always verified; email/password accounts must click the link we send. */
  emailVerified: boolean
}

export interface SignUpInput {
  name: string
  email: string
  password: string
}

interface AuthState {
  /** The server config was read and, if sign-in is on, Firebase reported who is signed in. */
  loaded: boolean
  /** Sign-in is configured on the server, so AI features and sync need it. */
  required: boolean
  firebase: FirebaseWebConfig | null
  user: AuthUser | null
  /** Has an admins/{uid} document, so may manage AI models. */
  isAdmin: boolean
  error: string | null
  load: () => Promise<void>
  /** True while an email/password or Google request is in flight. */
  busy: boolean
  signIn: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<boolean>
  signUp: (input: SignUpInput) => Promise<boolean>
  resetPassword: (email: string) => Promise<boolean>
  resendVerification: () => Promise<boolean>
  /** Re-read the account (after the user clicked the verification link). */
  refreshUser: () => Promise<void>
  clearError: () => void
  signOut: () => Promise<void>
}

type Fb = Awaited<ReturnType<typeof loadFirebase>>
async function loadFirebase(config: FirebaseWebConfig) {
  const [{ getFirebase }, authMod] = await Promise.all([import('@/lib/firebase/app'), import('firebase/auth')])
  return { ...getFirebase(config), authMod }
}

type FbUser = { uid: string; email: string | null; displayName: string | null; photoURL: string | null; emailVerified: boolean }
const mapUser = (u: FbUser): AuthUser => ({ uid: u.uid, email: u.email ?? '', name: u.displayName ?? u.email ?? '', picture: u.photoURL ?? '', emailVerified: u.emailVerified })

/** Plain-language messages for Firebase Auth error codes. */
export function authErrorMessage(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try logging in instead.'
    case 'auth/invalid-email':
      return 'That email address does not look right.'
    case 'auth/weak-password':
      return 'Choose a stronger password (at least 8 characters).'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'Incorrect email or password.'
    case 'auth/user-disabled':
      return 'This account has been disabled.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.'
    case 'auth/network-request-failed':
      return 'Network problem. Check your connection and try again.'
    case 'auth/operation-not-allowed':
      return 'Email sign-in is not switched on for this app yet. The site owner must enable Email/Password in Firebase.'
    case 'auth/unauthorized-domain':
      return 'This site is not an authorised domain in Firebase yet. The site owner must add it under Authentication → Settings.'
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.'
    default:
      return 'Something went wrong. Please try again.'
  }
}
const codeOf = (e: unknown) => (e as { code?: string })?.code ?? ''

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
  isAdmin: false,
  error: null,
  busy: false,
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
            set({ loaded: true, isAdmin: false, user: u ? mapUser(u) : null })
            if (u) {
              void import('@/lib/admin/models')
                .then((m) => m.fetchIsAdmin(u.uid))
                // Ignore the answer if a different account is signed in by now (fast account switching).
                .then((isAdmin) => (get().user?.uid === u.uid ? set({ isAdmin }) : undefined))
                .catch(() => undefined)
            }
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
    set({ error: null, busy: true })
    try {
      if (!fb) await get().load()
      if (!fb) return set({ error: 'Sign-in is not available right now. Check your connection and try again.' })
      await fb.authMod.signInWithPopup(fb.auth, new fb.authMod.GoogleAuthProvider())
    } catch (e) {
      const code = codeOf(e)
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') set({ error: authErrorMessage(code) })
    } finally {
      set({ busy: false })
    }
  },
  signInWithEmail: async (email, password) => {
    set({ error: null, busy: true })
    try {
      if (!fb) await get().load()
      if (!fb) throw new Error('offline')
      await fb.authMod.signInWithEmailAndPassword(fb.auth, email.trim(), password)
      return true
    } catch (e) {
      set({ error: authErrorMessage(codeOf(e)) })
      return false
    } finally {
      set({ busy: false })
    }
  },
  signUp: async ({ name, email, password }) => {
    set({ error: null, busy: true })
    try {
      if (!fb) await get().load()
      if (!fb) throw new Error('offline')
      const cred = await fb.authMod.createUserWithEmailAndPassword(fb.auth, email.trim(), password)
      await fb.authMod.updateProfile(cred.user, { displayName: name.trim() })
      // The verification link proves the address belongs to them. Failure to send is not fatal: they can resend.
      await fb.authMod.sendEmailVerification(cred.user).catch(() => undefined)
      set({ user: mapUser(cred.user) })
      return true
    } catch (e) {
      set({ error: authErrorMessage(codeOf(e)) })
      return false
    } finally {
      set({ busy: false })
    }
  },
  resetPassword: async (email) => {
    set({ error: null, busy: true })
    try {
      if (!fb) await get().load()
      if (!fb) throw new Error('offline')
      await fb.authMod.sendPasswordResetEmail(fb.auth, email.trim())
      return true
    } catch (e) {
      // Do not reveal whether an address has an account.
      const code = codeOf(e)
      if (code === 'auth/user-not-found') return true
      set({ error: authErrorMessage(code) })
      return false
    } finally {
      set({ busy: false })
    }
  },
  resendVerification: async () => {
    set({ error: null, busy: true })
    try {
      const u = fb?.auth.currentUser
      if (!u) return false
      await fb!.authMod.sendEmailVerification(u)
      return true
    } catch (e) {
      set({ error: authErrorMessage(codeOf(e)) })
      return false
    } finally {
      set({ busy: false })
    }
  },
  refreshUser: async () => {
    const u = fb?.auth.currentUser
    if (!u) return
    try {
      await u.reload()
      await u.getIdToken(true) // pick up the new email_verified claim
      set({ user: mapUser(u) })
    } catch {
      /* keep the current state */
    }
  },
  clearError: () => set({ error: null }),
  signOut: async () => {
    await fb?.authMod.signOut(fb.auth)
    set({ user: null, isAdmin: false })
  },
}))

/** True when the user may use AI features: sign-in is not required, or they are signed in with a verified email. */
export function canUseAi(s: Pick<AuthState, 'required' | 'user'>): boolean {
  return !s.required || (s.user !== null && s.user.emailVerified)
}

/** Test helper: forget the cached Firebase instance and loading state. */
export function resetAuthForTests(): void {
  fb = null
  loading = null
  useAuth.setState({ loaded: false, required: false, firebase: null, user: null, isAdmin: false, error: null, busy: false })
}
