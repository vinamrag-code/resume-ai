import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/App'
import { useResumes } from '@/store/resumes'
import { useSettings } from '@/store/settings'
import { sampleContent } from '@/test/fixtures'
import { renderAt } from '@/test/helpers'
import { SettingsPage } from './settings/SettingsPage'
import { MemoryRouter } from 'react-router-dom'
import { render } from '@testing-library/react'

beforeEach(() => {
  useResumes.setState({ resumes: [] })
  useSettings.setState({ provider: 'ollama', onboarded: true, ollamaUrl: 'http://localhost:11434', models: { ollama: 'llama3.1:8b', groq: 'openai/gpt-oss-120b', openrouter: 'nvidia/nemotron-3-super-120b-a12b:free' } })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('settings', () => {
  it('shows a friendly error when Ollama is not running', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    renderAt(<SettingsPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/could not reach ollama/i)
  })

  it('reports success and lists installed models', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ models: [{ name: 'llama3.1:8b' }] }))))
    renderAt(<SettingsPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    expect(await screen.findByText(/connected/i)).toBeInTheDocument()
  })

  it('saves the model to the store', async () => {
    renderAt(<SettingsPage />)
    const model = screen.getByLabelText(/ollama model/i)
    await userEvent.clear(model)
    await userEvent.type(model, 'mistral')
    expect(useSettings.getState().models.ollama).toBe('mistral')
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
  it('shows on first run with Ollama setup steps and can be dismissed', async () => {
    useSettings.setState({ onboarded: false })
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    const dialog = await screen.findByRole('dialog', { name: /welcome/i })
    expect(dialog).toHaveTextContent('VITE_GROQ_API_KEY')
    expect(dialog).toHaveTextContent(/optional, advanced/i)
    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(useSettings.getState().onboarded).toBe(true)
  })
})

describe('provider choice', () => {
  it('defaults to Auto with both cloud models, a privacy notice and missing-key help', async () => {
    vi.stubEnv('VITE_GROQ_API_KEY', '')
    vi.stubEnv('VITE_OPENROUTER_API_KEY', '')
    useSettings.setState({ provider: 'auto' })
    renderAt(<SettingsPage />)
    expect(screen.getByLabelText('Provider')).toHaveValue('auto')
    expect(screen.getByLabelText(/groq model/i)).toHaveValue('openai/gpt-oss-120b')
    expect(screen.getByLabelText(/openrouter model/i)).toHaveValue('nvidia/nemotron-3-super-120b-a12b:free')
    expect(screen.getByRole('note')).toHaveTextContent(/sent to Groq \/ OpenRouter/)
    expect(screen.getByRole('note')).toHaveTextContent(/No API key found/)
  })

  it('shows only the chosen provider, and Ollama as an advanced option', async () => {
    useSettings.setState({ provider: 'auto' })
    renderAt(<SettingsPage />)
    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'ollama')
    expect(screen.getByLabelText(/ollama base url/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/groq model/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
