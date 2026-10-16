import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchIsAdmin, parseModelList } from '@/lib/admin/models'
import { useAuth } from '@/lib/auth/store'
import { createLlm, loadServerProviders, resolveModel, setServerModels, setServerProviders } from '@/lib/llm'
import { useSettings, defaultModels } from '@/store/settings'
import { renderAt } from '@/test/helpers'
import { SettingsPage } from './SettingsPage'

const fs = vi.hoisted(() => ({
  exists: false,
  setDoc: vi.fn(async (..._a: unknown[]) => undefined),
  setDocError: null as null | Error,
}))
vi.mock('@/lib/firebase/app', () => ({ getFirebase: () => ({ app: {}, auth: {}, db: { name: 'db' } }) }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getDoc: vi.fn(async () => ({ exists: () => fs.exists })),
  setDoc: (...a: unknown[]) => (fs.setDocError ? Promise.reject(fs.setDocError) : fs.setDoc(...a)),
}))

const MODELS = { allowed: { groq: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'], openrouter: ['nvidia/nemotron-3-super-120b-a12b:free'], inception: ['mercury-2.5'] }, defaults: { groq: 'llama-3.3-70b-versatile', openrouter: 'nvidia/nemotron-3-super-120b-a12b:free', inception: 'mercury-2.5' } }
const CONFIG = { apiKey: 'k', authDomain: 'x', projectId: 'x', appId: '1' }

beforeEach(() => {
  fs.exists = false
  fs.setDocError = null
  fs.setDoc.mockClear()
  setServerModels(MODELS)
  setServerProviders(new Set(['groq', 'openrouter']))
  useSettings.setState({ provider: 'auto', onboarded: true, models: defaultModels() })
  useAuth.setState({ loaded: true, required: true, firebase: CONFIG, user: { uid: 'u1', email: 'me@example.com', name: 'Me', picture: '', emailVerified: true }, isAdmin: false })
})
afterEach(() => {
  setServerModels(null)
  setServerProviders(null)
  vi.unstubAllGlobals()
})

describe('what a member can actually use', () => {
  const bodies: { url: string; model: string }[] = []
  beforeEach(() => {
    bodies.length = 0
    vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => (bodies.push({ url: u, model: JSON.parse(init!.body as string).model }), new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })))))
  })
  const chat = async () => (await import('@/lib/llm')).getLlm().chat([{ role: 'user', content: 'hi' }])

  it("ignores a member's saved provider and model, using Auto mode with the admin default", async () => {
    useSettings.setState({ provider: 'inception', models: { inception: 'mercury-2.5', groq: 'openai/gpt-oss-120b' } })
    await chat()
    expect(bodies[0]).toEqual({ url: '/api/llm/groq/chat/completions', model: 'llama-3.3-70b-versatile' })
  })

  it("honours an admin's own choice", async () => {
    useAuth.setState({ isAdmin: true })
    useSettings.setState({ provider: 'groq', models: { groq: 'openai/gpt-oss-120b' } })
    await chat()
    expect(bodies[0]).toEqual({ url: '/api/llm/groq/chat/completions', model: 'openai/gpt-oss-120b' })
  })

  it('does not let anyone skip sign-in gating with a saved provider choice', async () => {
    useAuth.setState({ user: null, isAdmin: true })
    useSettings.setState({ provider: 'groq' })
    const { renderHook } = await import('@testing-library/react')
    const { useAiAccess } = await import('@/lib/auth/useAiAccess')
    expect(renderHook(() => useAiAccess()).result.current).toBe(false)
    useAuth.setState({ user: { uid: 'u1', email: 'me@example.com', name: 'Me', picture: '', emailVerified: true } })
    expect(renderHook(() => useAiAccess()).result.current).toBe(true)
  })
})

describe('model resolution', () => {
  it('keeps an allowed choice, replaces a disallowed one with the admin default, and trusts the choice when the list is unknown', () => {
    expect(resolveModel('groq', 'openai/gpt-oss-120b')).toBe('openai/gpt-oss-120b')
    expect(resolveModel('groq', 'old/removed-model')).toBe('llama-3.3-70b-versatile')
    expect(resolveModel('groq', undefined)).toBe('llama-3.3-70b-versatile')
    setServerModels(null)
    expect(resolveModel('groq', 'whatever/model')).toBe('whatever/model')
  })

  it('requests use the admin default when the saved model is no longer allowed', async () => {
    const bodies: { model: string }[] = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => (bodies.push(JSON.parse(init!.body as string)), new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })))))
    await createLlm({ provider: 'groq', models: { ...defaultModels(), groq: 'old/removed-model' } }).chat([{ role: 'user', content: 'hi' }])
    expect(bodies[0]!.model).toBe('llama-3.3-70b-versatile')
  })

  it('learns the allowlist and defaults from the server status', async () => {
    setServerModels(null)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ providers: { groq: true }, models: MODELS.allowed, defaults: MODELS.defaults }))))
    await loadServerProviders()
    expect(resolveModel('groq', 'nope')).toBe('llama-3.3-70b-versatile')
  })
})

describe('admin detection and helpers', () => {
  it('is admin only when admins/{uid} exists', async () => {
    expect(await fetchIsAdmin('u1')).toBe(false)
    fs.exists = true
    expect(await fetchIsAdmin('u1')).toBe(true)
  })
  it('parses model lists and reports invalid names', () => {
    expect(parseModelList('a/b\n c/d:free ,a/b\nbad name\n')).toEqual({ models: ['a/b', 'c/d:free'], invalid: ['bad name'] })
  })
})

describe('account diagnostics', () => {
  it('shows the User ID and explains a Member result, with a way to check again', async () => {
    const recheck = vi.fn(async () => undefined)
    useAuth.setState({ adminStatus: 'member', recheckAdmin: recheck })
    const writeText = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    renderAt(<SettingsPage />)
    expect(screen.getByText('u1')).toBeInTheDocument()
    expect(screen.getByText(/No admin document was found for this User ID/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Copy User ID' }))
    expect(writeText).toHaveBeenCalledWith('u1')
    await userEvent.click(screen.getByRole('button', { name: 'Check admin status again' }))
    expect(recheck).toHaveBeenCalled()
  })

  it('shows the reason when the admin check failed, and Unknown instead of Member', () => {
    useAuth.setState({ adminStatus: 'error', adminMessage: 'Firestore refused the admin check.' })
    renderAt(<SettingsPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('Firestore refused the admin check.')
    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(screen.queryByText('Member')).not.toBeInTheDocument()
  })

  it('hides the diagnostics for an admin', () => {
    useAuth.setState({ isAdmin: true, adminStatus: 'admin' })
    renderAt(<SettingsPage />)
    expect(screen.queryByRole('button', { name: 'Check admin status again' })).not.toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })
})

describe('account roles', () => {
  it('shows Member for an ordinary account and Admin for an admin, and hides the admin panel from members', () => {
    const first = renderAt(<SettingsPage />)
    expect(screen.getByText('Member')).toBeInTheDocument()
    expect(screen.queryByText('Admin: AI models')).not.toBeInTheDocument()
    first.unmount()
    useAuth.setState({ isAdmin: true })
    renderAt(<SettingsPage />)
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('Admin: AI models')).toBeInTheDocument()
  })
})

describe('Settings model picker and admin panel', () => {
  it('removes every model and provider control for members', () => {
    renderAt(<SettingsPage />)
    expect(screen.queryByText('AI models')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Provider')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/groq model/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/openrouter model/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /model/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Test connection' })).not.toBeInTheDocument()
    expect(screen.queryByText('Admin: AI models')).not.toBeInTheDocument()
    expect(screen.getByText(/chosen by the site administrator/i)).toBeInTheDocument()
  })

  it('shows admins the model dropdown (default marked) and the admin panel', async () => {
    useAuth.setState({ isAdmin: true })
    renderAt(<SettingsPage />)
    const groq = screen.getByRole('combobox', { name: /^Groq model/ }) as HTMLSelectElement
    expect([...groq.options].map((o) => o.value)).toEqual(MODELS.allowed.groq)
    expect(groq).toHaveValue('llama-3.3-70b-versatile') // nothing chosen yet: the admin default applies
    expect(screen.getByRole('option', { name: /llama-3.3-70b-versatile \(default\)/ })).toBeInTheDocument()
    await userEvent.selectOptions(groq, 'openai/gpt-oss-120b')
    expect(useSettings.getState().models.groq).toBe('openai/gpt-oss-120b')
    expect(screen.getByText('Admin: AI models')).toBeInTheDocument()
  })

  it('keeps everything available when no sign-in is configured (a private or local install)', () => {
    useAuth.setState({ required: false, isAdmin: false })
    renderAt(<SettingsPage />)
    expect(screen.getByLabelText('Provider')).toBeInTheDocument()
  })

  it("follows the admin's default until an admin picks a model, and drops a pick that is no longer allowed", () => {
    renderAt(<SettingsPage />)
    expect(useSettings.getState().models.groq).toBeUndefined()
    expect(resolveModel('groq', useSettings.getState().models.groq)).toBe('llama-3.3-70b-versatile')
    setServerModels({ ...MODELS, defaults: { ...MODELS.defaults, groq: 'openai/gpt-oss-120b' } }) // admin switches the default
    expect(resolveModel('groq', useSettings.getState().models.groq)).toBe('openai/gpt-oss-120b')
    useSettings.getState().setModel('groq', 'llama-3.3-70b-versatile') // user's own pick wins
    expect(resolveModel('groq', useSettings.getState().models.groq)).toBe('llama-3.3-70b-versatile')
    setServerModels({ ...MODELS, allowed: { ...MODELS.allowed, groq: ['openai/gpt-oss-120b'] }, defaults: { ...MODELS.defaults, groq: 'openai/gpt-oss-120b' } }) // admin removes it
    expect(resolveModel('groq', useSettings.getState().models.groq)).toBe('openai/gpt-oss-120b')
  })

  it('lets an admin add models, pick the default and save them for everyone', async () => {
    useAuth.setState({ isAdmin: true })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ providers: { groq: true }, models: { groq: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'new/model'], openrouter: MODELS.allowed.openrouter, inception: MODELS.allowed.inception }, defaults: { groq: 'new/model', openrouter: MODELS.defaults.openrouter, inception: MODELS.defaults.inception } }))))
    renderAt(<SettingsPage />)
    expect(screen.getByText('Admin: AI models')).toBeInTheDocument()
    const list = screen.getByLabelText(/Groq models \(one per line\)/)
    await userEvent.type(list, '{Enter}new/model{Enter}bad name')
    expect(screen.getByText(/Ignored invalid names: bad name/)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText(/Default Groq model/), 'new/model')
    await userEvent.click(screen.getByRole('button', { name: 'Save models' }))
    expect(await screen.findByText(/Everyone now uses these models/)).toBeInTheDocument()
    const [ref, data] = fs.setDoc.mock.calls[0] as [{ path: string }, Record<string, unknown>]
    expect(ref.path).toBe('config/models')
    expect(data).toMatchObject({ groq: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'new/model'], defaults: { groq: 'new/model' } })
    expect(typeof data.updatedAt).toBe('number')
    // The page refreshed the server list, so the new model is selectable right away.
    await waitFor(() => expect(screen.getByRole('combobox', { name: /^Groq model/ })).toHaveValue('new/model'))
  })

  it('explains a refused save (missing admin document or unpublished rules)', async () => {
    useAuth.setState({ isAdmin: true })
    fs.setDocError = new Error('Missing or insufficient permissions (permission-denied)')
    renderAt(<SettingsPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Save models' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/admins document/)
  })

  it('will not save an empty model list', async () => {
    useAuth.setState({ isAdmin: true })
    renderAt(<SettingsPage />)
    await userEvent.clear(screen.getByLabelText(/Groq models \(one per line\)/))
    await userEvent.click(screen.getByRole('button', { name: 'Save models' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least one groq model/i)
    expect(fs.setDoc).not.toHaveBeenCalled()
  })
})
