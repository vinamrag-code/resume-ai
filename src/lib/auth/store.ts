import { create } from 'zustand'

export interface AuthUser {
  email: string
  name: string
  picture: string
}

interface AuthState {
  /** The server has answered /api/auth/config. */
  loaded: boolean
  /** Sign-in is configured on the server, so AI features and sync need it. */
  required: boolean
  googleClientId: string
  user: AuthUser | null
  error: string | null
  load: () => Promise<void>
  signInWithCredential: (credential: string) => Promise<boolean>
  signOut: () => Promise<void>
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: T | null }> {
  try {
    const res = await fetch(url, init)
    return { ok: res.ok, status: res.status, body: (await res.json().catch(() => null)) as T | null }
  } catch {
    return { ok: false, status: 0, body: null }
  }
}

export const useAuth = create<AuthState>()((set) => ({
  loaded: false,
  required: false,
  googleClientId: '',
  user: null,
  error: null,
  load: async () => {
    const cfg = await fetchJson<{ required: boolean; googleClientId: string }>('/api/auth/config')
    if (!cfg.ok || !cfg.body) return set({ loaded: true, required: false })
    const me = cfg.body.required ? await fetchJson<{ user: AuthUser | null }>('/api/auth/me') : null
    set({ loaded: true, required: cfg.body.required, googleClientId: cfg.body.googleClientId, user: me?.body?.user ?? null })
  },
  signInWithCredential: async (credential) => {
    const r = await fetchJson<{ user?: AuthUser; error?: { message: string } }>('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    })
    if (r.ok && r.body?.user) {
      set({ user: r.body.user, error: null })
      return true
    }
    set({ error: r.body?.error?.message ?? 'Sign-in failed. Please try again.' })
    return false
  },
  signOut: async () => {
    await fetchJson('/api/auth/logout', { method: 'POST' })
    set({ user: null })
  },
}))

/** True when the user may use AI features: sign-in is not required, or they are signed in. */
export function canUseAi(s: Pick<AuthState, 'required' | 'user'>): boolean {
  return !s.required || s.user !== null
}
