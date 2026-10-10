import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/App'
import { GoogleSignInButton } from '@/components/GoogleSignInButton'
import { ErrorBanner } from '@/components/ui'
import { ChatPanel } from '@/features/chat/ChatPanel'
import { CoverLetterPage } from '@/features/cover/CoverLetterPage'
import { ImportPage } from '@/features/import/ImportPage'
import { TailorPanel } from '@/features/tailor/TailorPanel'
import { LlmError, setLlmClient } from '@/lib/llm'
import { useResumes } from '@/store/resumes'
import { useSettings } from '@/store/settings'
import { SAMPLE_JD, sampleContent } from '@/test/fixtures'
import { mockLlm, renderAt } from '@/test/helpers'
import { getIdToken, resetAuthForTests, useAuth } from './store'

// A scripted stand-in for the Firebase SDK.
const fb = vi.hoisted(() => {
  const state = {
    user: null as null | { uid: string; email: string; displayName: string; photoURL: string; emailVerified: boolean },
    listener: null as null | ((u: unknown) => void),
    popupError: null as null | { code: string },
    currentUser: null as null | { getIdToken: () => Promise<string> },
  }
  return state
})
// Controls the background "is this user an admin?" lookup.
const admin = vi.hoisted(() => ({ check: (_uid: string): Promise<boolean> => Promise.resolve(false) }))
const adminResult = vi.hoisted(() => ({ error: null as null | string }))
vi.mock('@/lib/admin/models', () => ({
  checkAdmin: async (uid: string) => (adminResult.error ? { status: 'error', message: adminResult.error } : (await admin.check(uid)) ? { status: 'admin' } : { status: 'member' }),
}))

// Like the real Auth object: one stable instance whose `currentUser` is live.
const auth = vi.hoisted(() => ({ get currentUser() { return fb.currentUser } }))
vi.mock('@/lib/firebase/app', () => ({ getFirebase: () => ({ app: {}, db: {}, auth }) }))
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void) => {
    fb.listener = cb
    cb(fb.user)
    return () => undefined
  },
  signInWithPopup: vi.fn(async () => {
    if (fb.popupError) throw fb.popupError
    fb.user = { uid: 'u1', email: 'ada@example.com', displayName: 'Ada', photoURL: '', emailVerified: true }
    fb.currentUser = { getIdToken: async () => 'firebase-token' }
    fb.listener?.(fb.user)
  }),
  signOut: vi.fn(async () => {
    fb.user = null
    fb.currentUser = null
    fb.listener?.(null)
  }),
}))

const CONFIG = { apiKey: 'k', authDomain: 'x.firebaseapp.com', projectId: 'x', appId: '1' }
const serverConfig = (required = true) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (u: string) => new Response(JSON.stringify(u.includes('auth/config') ? { required, firebase: required ? CONFIG : null } : { providers: {} }))),
  )
const signedOut = () => useAuth.setState({ loaded: true, required: true, firebase: CONFIG, user: null, error: null })
const signedIn = () => useAuth.setState({ loaded: true, required: true, firebase: CONFIG, user: { uid: 'u1', email: 'ada@example.com', name: 'Ada', picture: '', emailVerified: true }, error: null })

beforeEach(() => {
  resetAuthForTests()
  fb.user = null
  fb.currentUser = null
  fb.popupError = null
  useResumes.setState({ resumes: [] })
  useSettings.setState({ provider: 'auto', onboarded: true })
  useAuth.setState({ loaded: true, required: false, user: null })
})
afterEach(() => {
  vi.unstubAllGlobals()
  setLlmClient(null)
})

const seed = () => {
  const r = useResumes.getState().create('Base', sampleContent())
  useResumes.getState().setTarget(r.id, { title: 'Engineer', company: 'Acme', description: SAMPLE_JD })
  return useResumes.getState().resumes.find((x) => x.id === r.id)!
}

describe('auth store (Firebase)', () => {
  it('stays off when the server does not require sign-in', async () => {
    serverConfig(false)
    await useAuth.getState().load()
    expect(useAuth.getState()).toMatchObject({ loaded: true, required: false, user: null })
  })
  it('loads the config from the server and reports the signed-in user', async () => {
    serverConfig()
    fb.user = { uid: 'u1', email: 'a@b.c', displayName: 'A', photoURL: 'p', emailVerified: true }
    await useAuth.getState().load()
    expect(useAuth.getState()).toMatchObject({ loaded: true, required: true, firebase: CONFIG, user: { uid: 'u1', email: 'a@b.c', name: 'A', picture: 'p', emailVerified: true } })
  })
  it('keeps local use working if the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await useAuth.getState().load()
    expect(useAuth.getState()).toMatchObject({ loaded: true, user: null })
  })
  it('signs in with a Google popup, exposes an ID token, and signs out', async () => {
    serverConfig()
    await useAuth.getState().load()
    expect(await getIdToken()).toBeNull()
    await useAuth.getState().signIn()
    expect(useAuth.getState().user).toMatchObject({ email: 'ada@example.com' })
    expect(await getIdToken()).toBe('firebase-token')
    await useAuth.getState().signOut()
    expect(useAuth.getState().user).toBeNull()
    expect(await getIdToken()).toBeNull()
  })
  it('explains common sign-in failures and ignores a closed popup', async () => {
    serverConfig()
    await useAuth.getState().load()
    fb.popupError = { code: 'auth/popup-closed-by-user' }
    await useAuth.getState().signIn()
    expect(useAuth.getState().error).toBeNull()
    fb.popupError = { code: 'auth/popup-blocked' }
    await useAuth.getState().signIn()
    expect(useAuth.getState().error).toMatch(/blocked/)
    fb.popupError = { code: 'auth/unauthorized-domain' }
    await useAuth.getState().signIn()
    expect(useAuth.getState().error).toMatch(/authorised domain/)
  })
})

describe('admin status', () => {
  const asUser = (uid: string) => ({ uid, email: `${uid}@example.com`, displayName: uid, photoURL: '', emailVerified: true })
  afterEach(() => {
    admin.check = () => Promise.resolve(false)
    adminResult.error = null
  })

  it('records why an account is a member, and can check again after the admin document is created', async () => {
    serverConfig()
    fb.user = asUser('A')
    fb.currentUser = { getIdToken: async () => 't' }
    await useAuth.getState().load()
    await waitFor(() => expect(useAuth.getState().adminStatus).toBe('member'))
    expect(useAuth.getState().isAdmin).toBe(false)
    admin.check = async () => true // the admin document now exists
    await useAuth.getState().recheckAdmin()
    expect(useAuth.getState()).toMatchObject({ isAdmin: true, adminStatus: 'admin' })
  })

  it('reports a failed check as an error instead of silently saying member', async () => {
    serverConfig()
    adminResult.error = 'Firestore refused the admin check.'
    fb.user = asUser('A')
    fb.currentUser = { getIdToken: async () => 't' }
    await useAuth.getState().load()
    await waitFor(() => expect(useAuth.getState().adminStatus).toBe('error'))
    expect(useAuth.getState()).toMatchObject({ isAdmin: false, adminMessage: 'Firestore refused the admin check.' })
  })

  it('is true only for the account that has an admin document', async () => {
    serverConfig()
    admin.check = async (uid) => uid === 'A'
    fb.user = asUser('A')
    await useAuth.getState().load()
    await waitFor(() => expect(useAuth.getState().isAdmin).toBe(true))
    fb.listener?.(asUser('B'))
    expect(useAuth.getState().isAdmin).toBe(false)
    await new Promise((r) => setTimeout(r, 10))
    expect(useAuth.getState().isAdmin).toBe(false)
  })

  it("never gives a new account the previous account's admin status, even if A's slow check finishes late", async () => {
    serverConfig()
    let releaseA: (v: boolean) => void = () => undefined
    let aStarted = false
    admin.check = (uid) => {
      if (uid !== 'A') return Promise.resolve(false)
      aStarted = true
      return new Promise<boolean>((r) => (releaseA = r))
    }
    fb.user = asUser('A')
    await useAuth.getState().load()
    await waitFor(() => expect(aStarted).toBe(true)) // A's lookup is now in flight
    fb.listener?.(asUser('B')) // account B signs in before A's check returns
    await new Promise((r) => setTimeout(r, 20)) // B's own (negative) check completes first
    expect(useAuth.getState().isAdmin).toBe(false)
    releaseA(true) // ...and only now does A's stale "admin" answer arrive
    await new Promise((r) => setTimeout(r, 20))
    expect(useAuth.getState().user?.uid).toBe('B')
    expect(useAuth.getState().isAdmin).toBe(false)
  })

  it('is cleared on sign-out', async () => {
    serverConfig()
    admin.check = async () => true
    fb.user = asUser('A')
    await useAuth.getState().load()
    await waitFor(() => expect(useAuth.getState().isAdmin).toBe(true))
    await useAuth.getState().signOut()
    expect(useAuth.getState().isAdmin).toBe(false)
  })
})

describe('Google button', () => {
  it('starts the sign-in when clicked', async () => {
    serverConfig()
    await useAuth.getState().load()
    render(<GoogleSignInButton />)
    await userEvent.click(screen.getByRole('button', { name: /Sign in with Google/ }))
    await waitFor(() => expect(useAuth.getState().user?.email).toBe('ada@example.com'))
  })
})

describe('AI features need sign-in; manual editing does not', () => {
  it('Agent: notice shown and input disabled when signed out, enabled after sign in', () => {
    signedOut()
    const r = seed()
    const { unmount } = renderAt(<ChatPanel resume={r} />)
    expect(screen.getByRole('region', { name: 'Sign in required' })).toHaveTextContent(/Sign in to use the Agent/)
    expect(screen.getByLabelText(/message the resume counselor/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Review my summary' })).toBeDisabled()
    unmount()
    signedIn()
    renderAt(<ChatPanel resume={r} />)
    expect(screen.queryByRole('region', { name: 'Sign in required' })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/message the resume counselor/i)).toBeEnabled()
  })

  it('Tailor, Import parsing and Cover letters are blocked when signed out', async () => {
    signedOut()
    const r = seed()
    const t = renderAt(<TailorPanel resume={r} />)
    expect(screen.getByRole('button', { name: 'Suggest tailored changes' })).toBeDisabled()
    t.unmount()
    const i = renderAt(<ImportPage />, { path: '/import', route: '/import' })
    await userEvent.type(screen.getByLabelText(/paste resume text/i), 'Some resume text that is long enough to parse.')
    expect(screen.getByRole('button', { name: 'Parse with AI' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Start from scratch' })).toBeEnabled() // manual path stays open
    i.unmount()
    renderAt(<CoverLetterPage />, { path: '/cover', route: `/cover?resume=${r.id}` })
    expect(screen.getByRole('button', { name: 'Generate letter' })).toBeDisabled()
  })

  it('does not gate anything when the server does not require sign-in, and a saved Ollama choice never bypasses sign-in', () => {
    const r = seed()
    const a = renderAt(<ChatPanel resume={r} />)
    expect(screen.getByLabelText(/message the resume counselor/i)).toBeEnabled()
    a.unmount()
    signedOut()
    useSettings.setState({ provider: 'ollama' })
    renderAt(<ChatPanel resume={r} />)
    expect(screen.getByLabelText(/message the resume counselor/i)).toBeDisabled()
  })

  it('turns a 401 from the proxy into a friendly sign-in prompt', async () => {
    signedIn() // stale session: the server says 401 anyway
    const r = seed()
    mockLlm([new LlmError('signin', 'Sign in with Google to use AI features.')])
    renderAt(<TailorPanel resume={r} />)
    await userEvent.click(screen.getByRole('button', { name: 'Suggest tailored changes' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Sign in with Google/)
    expect(alert.querySelector('[data-testid="google-button"]')).toBeInTheDocument()
  })

  it('ErrorBanner shows a sign-in button only for sign-in errors', () => {
    render(
      <MemoryRouter>
        <ErrorBanner error={new LlmError('rate-limit', 'slow down')} />
      </MemoryRouter>,
    )
    expect(screen.queryByTestId('google-button')).not.toBeInTheDocument()
  })
})

describe('the AI proxy request carries the Firebase token', () => {
  it('sends Authorization: Bearer <token> to /api/llm when signed in', async () => {
    serverConfig()
    await useAuth.getState().load()
    await useAuth.getState().signIn()
    const { OpenAiCompatibleClient } = await import('@/lib/llm/openai')
    const calls: RequestInit[] = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => (calls.push(init ?? {}), new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })))))
    await new OpenAiCompatibleClient({ baseUrl: '/api/llm/groq', model: 'm', label: 'Groq', supportsJsonFormat: true, getToken: getIdToken }).chat([{ role: 'user', content: 'hi' }])
    expect((calls[0]!.headers as Record<string, string>).Authorization).toBe('Bearer firebase-token')
  })
})

describe('profile menu', () => {
  const setup = () =>
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

  it('shows the landing page instead of the app when signed out and sign-in is required', async () => {
    serverConfig()
    resetAuthForTests()
    setup()
    expect(await screen.findByRole('button', { name: 'Sign up free' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Profile' })).not.toBeInTheDocument()
  })

  it('shows the account and signs out when signed in', async () => {
    serverConfig()
    fb.user = { uid: 'u1', email: 'ada@example.com', displayName: 'Ada L', photoURL: '', emailVerified: true }
    fb.currentUser = { getIdToken: async () => 't' }
    resetAuthForTests()
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Profile' }))
    expect(await screen.findByText('ada@example.com')).toBeInTheDocument()
    expect(screen.getByText('Ada L')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    await waitFor(() => expect(useAuth.getState().user).toBeNull())
  })
})
