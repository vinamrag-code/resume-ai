import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/App'
import { resetAuthForTests, useAuth } from '@/lib/auth/store'

type FbUser = { uid: string; email: string; displayName: string | null; photoURL: string | null; emailVerified: boolean; reload: () => Promise<void>; getIdToken: () => Promise<string> }

const fb = vi.hoisted(() => ({
  user: null as unknown,
  listener: null as null | ((u: unknown) => void),
  next: null as null | { code: string },
  verifiedAfterReload: false,
  calls: [] as string[],
}))
const auth = vi.hoisted(() => ({ get currentUser() { return fb.user } }))
vi.mock('@/lib/firebase/app', () => ({ getFirebase: () => ({ app: {}, db: {}, auth }) }))
vi.mock('firebase/firestore', () => ({ doc: () => ({}), getDoc: async () => ({ exists: () => false }) }))

function makeUser(over: Partial<FbUser> = {}): FbUser {
  const u: FbUser = {
    uid: 'u1', email: 'ada@example.com', displayName: 'Ada', photoURL: null, emailVerified: true, getIdToken: async () => 'tok',
    reload: async () => { if (fb.verifiedAfterReload) u.emailVerified = true },
    ...over,
  }
  return u
}
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => void) => { fb.listener = cb; cb(fb.user); return () => undefined },
  signInWithPopup: vi.fn(async () => { fb.calls.push('google'); if (fb.next) throw fb.next; fb.user = makeUser(); fb.listener?.(fb.user) }),
  signInWithEmailAndPassword: vi.fn(async (_a: unknown, email: string, password: string) => {
    fb.calls.push(`login:${email}:${password}`)
    if (fb.next) throw fb.next
    fb.user = makeUser({ email }); fb.listener?.(fb.user)
  }),
  createUserWithEmailAndPassword: vi.fn(async (_a: unknown, email: string, password: string) => {
    fb.calls.push(`signup:${email}:${password}`)
    if (fb.next) throw fb.next
    const user = makeUser({ email, displayName: null, emailVerified: false })
    fb.user = user; fb.listener?.(user)
    return { user }
  }),
  updateProfile: vi.fn(async (u: FbUser, p: { displayName: string }) => { fb.calls.push(`profile:${p.displayName}`); u.displayName = p.displayName }),
  sendEmailVerification: vi.fn(async () => { fb.calls.push('verify-email') }),
  sendPasswordResetEmail: vi.fn(async (_a: unknown, email: string) => { fb.calls.push(`reset:${email}`); if (fb.next) throw fb.next }),
  signOut: vi.fn(async () => { fb.user = null; fb.listener?.(null) }),
}))

const CONFIG = { apiKey: 'k', authDomain: 'x.firebaseapp.com', projectId: 'x', appId: '1' }
const setup = () => render(<MemoryRouter><App /></MemoryRouter>)

beforeEach(() => {
  fb.user = null; fb.next = null; fb.verifiedAfterReload = false; fb.calls = []
  resetAuthForTests()
  vi.stubGlobal('fetch', vi.fn(async (u: string) => new Response(JSON.stringify(u.includes('auth/config') ? { required: true, firebase: CONFIG } : { providers: {} }))))
})
afterEach(() => vi.unstubAllGlobals())

describe('landing page and gate', () => {
  it('shows only the landing page when signed out: no app, no free access', async () => {
    setup()
    expect(await screen.findByRole('heading', { level: 1, name: /resume that gets read/i })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Welcome back/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Features')).toBeInTheDocument()
  })

  it('opens an animated, accessible modal from either button, and closes with Escape', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Log in' }))
    const dialog = screen.getByRole('dialog', { name: 'Welcome back' })
    expect(dialog).toHaveClass('animate-modal-in')
    expect(dialog.parentElement).toHaveClass('animate-backdrop-in')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sign up free' }))
    expect(screen.getByRole('dialog', { name: 'Create your account' })).toBeInTheDocument()
  })

  it('shows the app only to a verified user, and the verify page to an unverified one', async () => {
    fb.user = makeUser({ emailVerified: false })
    const first = setup()
    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Welcome back/ })).not.toBeInTheDocument()
    first.unmount()
    fb.user = makeUser()
    resetAuthForTests()
    setup()
    expect(await screen.findByRole('heading', { name: /Welcome back/ })).toBeInTheDocument()
  })
})

describe('sign up', () => {
  const open = async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Sign up free' }))
    return screen.getByRole('dialog')
  }

  it('has full name, email, password and confirm password fields', async () => {
    const d = await open()
    for (const label of ['Full name', 'Email', 'Password', 'Confirm password']) expect(within(d).getByLabelText(label)).toBeInTheDocument()
  })

  it('validates before calling Firebase and clears an error when the field is edited', async () => {
    const d = await open()
    await userEvent.click(within(d).getByRole('button', { name: 'Create account' }))
    expect(within(d).getByText('Enter your full name.')).toBeInTheDocument()
    expect(within(d).getByText('Enter your email address.')).toBeInTheDocument()
    expect(within(d).getByLabelText('Full name')).toHaveAttribute('aria-invalid', 'true')
    expect(fb.calls).toEqual([])
    await userEvent.type(within(d).getByLabelText('Full name'), 'Ada')
    expect(within(d).queryByText('Enter your full name.')).not.toBeInTheDocument()
    await userEvent.type(within(d).getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(within(d).getByLabelText('Password'), 'Analytical1')
    await userEvent.type(within(d).getByLabelText('Confirm password'), 'Different1')
    await userEvent.click(within(d).getByRole('button', { name: 'Create account' }))
    expect(within(d).getByText('The passwords do not match.')).toBeInTheDocument()
    expect(fb.calls).toEqual([])
  })

  it('shows and hides the password, and a strength meter', async () => {
    const d = await open()
    const pw = within(d).getByLabelText('Password')
    await userEvent.type(pw, 'Abcdefghijk1!')
    expect(within(d).getByText(/Password strength: Excellent/)).toBeInTheDocument()
    expect(pw).toHaveAttribute('type', 'password')
    await userEvent.click(within(d).getByRole('button', { name: 'Show password' }))
    expect(pw).toHaveAttribute('type', 'text')
  })

  it('creates the account, saves the full name, sends the verification email and moves to the verify page', async () => {
    const d = await open()
    await userEvent.type(within(d).getByLabelText('Full name'), '  Ada   Lovelace ')
    await userEvent.type(within(d).getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(within(d).getByLabelText('Password'), 'Analytical1')
    await userEvent.type(within(d).getByLabelText('Confirm password'), 'Analytical1')
    await userEvent.click(within(d).getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument()
    expect(fb.calls).toEqual(['signup:ada@example.com:Analytical1', 'profile:Ada Lovelace', 'verify-email'])
    expect(useAuth.getState().user).toMatchObject({ name: 'Ada Lovelace', emailVerified: false })
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
  })

  it('shows friendly errors from Firebase', async () => {
    fb.next = { code: 'auth/email-already-in-use' }
    const d = await open()
    await userEvent.type(within(d).getByLabelText('Full name'), 'Ada Lovelace')
    await userEvent.type(within(d).getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(within(d).getByLabelText('Password'), 'Analytical1')
    await userEvent.type(within(d).getByLabelText('Confirm password'), 'Analytical1')
    await userEvent.click(within(d).getByRole('button', { name: 'Create account' }))
    expect(await within(d).findByText(/already exists/)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('log in', () => {
  const open = async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Log in' }))
    return screen.getByRole('dialog')
  }

  it('logs in with email and password and opens the app', async () => {
    const d = await open()
    await userEvent.type(within(d).getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(within(d).getByLabelText('Password'), 'Analytical1')
    await userEvent.click(within(d).getByRole('button', { name: 'Log in' }))
    expect(await screen.findByRole('heading', { name: /Welcome back/ })).toBeInTheDocument()
    expect(fb.calls).toContain('login:ada@example.com:Analytical1')
  })

  it('requires both fields and explains wrong credentials without saying which was wrong', async () => {
    const d = await open()
    await userEvent.click(within(d).getByRole('button', { name: 'Log in' }))
    expect(within(d).getByText('Enter your email address.')).toBeInTheDocument()
    expect(within(d).getByText('Enter your password.')).toBeInTheDocument()
    fb.next = { code: 'auth/invalid-credential' }
    await userEvent.type(within(d).getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(within(d).getByLabelText('Password'), 'wrong')
    await userEvent.click(within(d).getByRole('button', { name: 'Log in' }))
    expect(await within(d).findByText('Incorrect email or password.')).toBeInTheDocument()
  })

  it('switches between Log in and Sign up and clears errors', async () => {
    const d = await open()
    fb.next = { code: 'auth/too-many-requests' }
    await userEvent.type(within(d).getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(within(d).getByLabelText('Password'), 'x')
    await userEvent.click(within(d).getByRole('button', { name: 'Log in' }))
    expect(await within(d).findByText(/Too many attempts/)).toBeInTheDocument()
    await userEvent.click(within(d).getByRole('tab', { name: 'Sign up' }))
    expect(within(d).queryByText(/Too many attempts/)).not.toBeInTheDocument()
    expect(within(d).getByLabelText('Full name')).toBeInTheDocument()
  })

  it('sends a password reset link without revealing whether the account exists', async () => {
    const d = await open()
    await userEvent.click(within(d).getByRole('button', { name: 'Forgot password?' }))
    await userEvent.type(within(d).getByLabelText('Email'), 'nobody@example.com')
    fb.next = { code: 'auth/user-not-found' }
    await userEvent.click(within(d).getByRole('button', { name: 'Send reset link' }))
    expect(await within(d).findByText(/If an account exists for/)).toBeInTheDocument()
    expect(fb.calls).toContain('reset:nobody@example.com')
  })

  it('also offers Google', async () => {
    const d = await open()
    await userEvent.click(within(d).getByRole('button', { name: /Continue with Google/ }))
    expect(await screen.findByRole('heading', { name: /Welcome back/ })).toBeInTheDocument()
    expect(fb.calls).toContain('google')
  })
})

describe('verify email page', () => {
  it('detects verification by itself, lets the user resend, and sign out', async () => {
    fb.user = makeUser({ emailVerified: false })
    setup()
    await screen.findByRole('heading', { name: 'Check your inbox' })
    await userEvent.click(screen.getByRole('button', { name: 'I have verified my email' }))
    expect(await screen.findByText(/Not verified yet/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Resend email' }))
    expect(await screen.findByText(/Verification email sent/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Resend email \(\d+s\)/ })).toBeDisabled()
    fb.verifiedAfterReload = true
    await userEvent.click(screen.getByRole('button', { name: 'I have verified my email' }))
    expect(await screen.findByRole('heading', { name: /Welcome back/ })).toBeInTheDocument()
  })

  it('lets someone abandon the account', async () => {
    fb.user = makeUser({ emailVerified: false })
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Use a different account' }))
    expect(await screen.findByRole('button', { name: 'Sign up free' })).toBeInTheDocument()
    await waitFor(() => expect(useAuth.getState().user).toBeNull())
  })
})
