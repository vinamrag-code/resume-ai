import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/App'
import { setServerProviders } from '@/lib/llm'
import { useResumes } from '@/store/resumes'
import { useSettings } from '@/store/settings'
import { sampleContent } from '@/test/fixtures'
import { renderAt } from '@/test/helpers'
import { SettingsPage } from './settings/SettingsPage'
import { MemoryRouter } from 'react-router-dom'
import { render } from '@testing-library/react'

beforeEach(() => {
  useResumes.setState({ resumes: [] })
  useSettings.setState({ provider: 'groq', onboarded: true, models: { groq: 'openai/gpt-oss-120b', openrouter: 'nvidia/nemotron-3-super-120b-a12b:free' } })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('settings', () => {
  it('shows a friendly error when the provider cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    renderAt(<SettingsPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/could not reach groq/i)
  })

  it('reports success and names the model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))))
    renderAt(<SettingsPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    expect(await screen.findByText(/connected/i)).toBeInTheDocument()
  })

  it('saves the model to the store', async () => {
    renderAt(<SettingsPage />)
    const model = screen.getByLabelText(/groq model/i)
    await userEvent.clear(model)
    await userEvent.type(model, 'llama-3.3-70b-versatile')
    expect(useSettings.getState().models.groq).toBe('llama-3.3-70b-versatile')
  })

  it('imports a backup file and rejects invalid ones', async () => {
    useResumes.getState().create('Old', sampleContent())
    renderAt(<SettingsPage />)
    const input = screen.getByLabelText('Import backup file')
    await userEvent.upload(input, new File(['nope'], 'bad.json', { type: 'application/json' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/not valid JSON/)
    expect(useResumes.getState().resumes).toHaveLength(1)
  })
})

describe('onboarding', () => {
  it('does not show the API-key modal on first run (hosted users share the owner key)', () => {
    useSettings.setState({ onboarded: false })
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('provider choice', () => {
  afterEach(() => setServerProviders(null))

  it('defaults to Auto with both cloud models, a privacy notice, and shows server availability', async () => {
    setServerProviders(new Set(['groq']))
    useSettings.setState({ provider: 'auto' })
    renderAt(<SettingsPage />)
    expect(screen.getByLabelText('Provider')).toHaveValue('auto')
    expect(screen.getByLabelText(/groq model/i)).toHaveValue('openai/gpt-oss-120b')
    expect(screen.getByLabelText(/openrouter model/i)).toHaveValue('nvidia/nemotron-3-super-120b-a12b:free')
    expect(screen.getByText(/Groq model/)).toHaveTextContent('available on server ✓')
    expect(screen.getByText(/OpenRouter model/)).toHaveTextContent('not configured on server')
    expect(screen.getByRole('note')).toHaveTextContent(/sent to Groq \/ OpenRouter/)
    expect(screen.getByRole('note')).toHaveTextContent(/never sent to your browser/)
  })

  it('tells visitors when the server has no provider configured', () => {
    setServerProviders(new Set())
    useSettings.setState({ provider: 'auto' })
    renderAt(<SettingsPage />)
    expect(screen.getByRole('note')).toHaveTextContent('GROQ_API_KEY')
  })

  it('shows only the chosen provider, and no longer offers Ollama', async () => {
    useSettings.setState({ provider: 'auto' })
    renderAt(<SettingsPage />)
    expect(screen.queryByRole('option', { name: /ollama/i })).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'openrouter')
    expect(screen.getByLabelText(/openrouter model/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/groq model/i)).not.toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('OpenRouter')
  })
})
