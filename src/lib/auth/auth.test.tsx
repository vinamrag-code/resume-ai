import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/App'
import { ErrorBanner } from '@/components/ui'
import { GoogleSignInButton } from '@/components/GoogleSignInButton'
import { ChatPanel } from '@/features/chat/ChatPanel'
import { CoverLetterPage } from '@/features/cover/CoverLetterPage'
import { ImportPage } from '@/features/import/ImportPage'
import { TailorPanel } from '@/features/tailor/TailorPanel'
import { LlmError, setLlmClient } from '@/lib/llm'
import { useResumes } from '@/store/resumes'
import { useSettings } from '@/store/settings'
import { SAMPLE_JD, sampleContent } from '@/test/fixtures'
import { mockLlm, renderAt } from '@/test/helpers'
import { useAuth } from './store'

const signedOut = () => useAuth.setState({ loaded: true, required: true, googleClientId: 'cid', user: null, error: null })
const signedIn = () => useAuth.setState({ loaded: true, required: true, googleClientId: 'cid', user: { email: 'ada@example.com', name: 'Ada', picture: '' }, error: null })

beforeEach(() => {
  useResumes.setState({ resumes: [] })
  useSettings.setState({ provider: 'auto', onboarded: true })
  useAuth.setState({ loaded: true, required: false, googleClientId: '', user: null, error: null })
  window.google = { accounts: { id: { initialize: vi.fn(), renderButton: vi.fn() } } }
})
afterEach(() => {
  vi.unstubAllGlobals()
  setLlmClient(null)
  delete window.google
})

const seed = () => {
  const r = useResumes.getState().create('Base', sampleContent())
  useResumes.getState().setTarget(r.id, { title: 'Engineer', company: 'Acme', description: SAMPLE_JD })
  return useResumes.getState().resumes.find((x) => x.id === r.id)!
}

describe('auth store', () => {
  it('loads config and the current user', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => new Response(JSON.stringify(u.endsWith('config') ? { required: true, googleClientId: 'cid' } : { user: { email: 'a@b.c', name: 'A', picture: '' } }))))
    await useAuth.getState().load()
    expect(useAuth.getState()).toMatchObject({ loaded: true, required: true, googleClientId: 'cid', user: { email: 'a@b.c' } })
  })
  it('treats a failing server as "no sign-in needed" so local use keeps working', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await useAuth.getState().load()
    expect(useAuth.getState()).toMatchObject({ loaded: true, required: false, user: null })
  })
  it('signs in with a credential, surfaces server errors, and signs out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ user: { email: 'a@b.c', name: 'A', picture: '' } }))))
    expect(await useAuth.getState().signInWithCredential('tok')).toBe(true)
    expect(useAuth.getState().user?.email).toBe('a@b.c')
    await useAuth.getState().signOut()
    expect(useAuth.getState().user).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Token has expired.' } }), { status: 401 })))
    expect(await useAuth.getState().signInWithCredential('bad')).toBe(false)
    expect(useAuth.getState().error).toBe('Token has expired.')
  })
})

describe('Google button', () => {
  it('initialises Google Identity Services with the server client id and signs in on callback', async () => {
    useAuth.setState({ googleClientId: 'cid' })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ user: { email: 'a@b.c', name: 'A', picture: '' } })))
    vi.stubGlobal('fetch', fetchMock)
    render(<GoogleSignInButton />)
    await waitFor(() => expect(window.google!.accounts.id.renderButton).toHaveBeenCalled())
    const init = vi.mocked(window.google!.accounts.id.initialize).mock.calls[0]![0]
    expect(init.client_id).toBe('cid')
    init.callback({ credential: 'jwt-from-google' })
    await waitFor(() => expect(useAuth.getState().user?.email).toBe('a@b.c'))
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ credential: 'jwt-from-google' })
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

  it('does not gate anything when the server does not require sign-in, or when using local Ollama', () => {
    const r = seed()
    const a = renderAt(<ChatPanel resume={r} />)
    expect(screen.getByLabelText(/message the resume counselor/i)).toBeEnabled()
    a.unmount()
    signedOut()
    useSettings.setState({ provider: 'ollama' })
    renderAt(<ChatPanel resume={r} />)
    expect(screen.getByLabelText(/message the resume counselor/i)).toBeEnabled()
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

describe('profile menu', () => {
  const setup = () =>
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => new Response(JSON.stringify(u.includes('providers') || u.includes('status') ? { providers: {} } : { required: false }))))
  })

  it('offers Google sign-in when signed out and required', async () => {
    signedOut()
    vi.stubGlobal('fetch', vi.fn(async (u: string) => new Response(JSON.stringify(u.endsWith('config') ? { required: true, googleClientId: 'cid' } : { user: null, providers: {} }))))
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Profile' }))
    expect(await screen.findByText(/Sign in to use AI features and sync/)).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it('shows the account and signs out when signed in', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string, i?: RequestInit) => {
        calls.push(`${i?.method ?? 'GET'} ${u}`)
        if (u.endsWith('config')) return new Response(JSON.stringify({ required: true, googleClientId: 'cid' }))
        if (u.endsWith('/me')) return new Response(JSON.stringify({ user: { email: 'ada@example.com', name: 'Ada L', picture: '' } }))
        if (u === '/api/sync') return new Response(JSON.stringify({ rev: 0, data: null }))
        return new Response(JSON.stringify({ ok: true, providers: {} }))
      }),
    )
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Profile' }))
    expect(await screen.findByText('ada@example.com')).toBeInTheDocument()
    expect(screen.getByText('Ada L')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    await waitFor(() => expect(calls).toContain('POST /api/auth/logout'))
    await waitFor(() => expect(useAuth.getState().user).toBeNull())
  })
})
