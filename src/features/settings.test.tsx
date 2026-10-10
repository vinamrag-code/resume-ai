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
  useSettings.setState({ provider: 'ollama', onboarded: true, ollamaUrl: 'http://localhost:11434', model: 'llama3.1:8b' })
})
afterEach(() => vi.unstubAllGlobals())

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

  it('saves model and base URL to the store', async () => {
    renderAt(<SettingsPage />)
    const model = screen.getByLabelText('Model')
    await userEvent.clear(model)
    await userEvent.type(model, 'mistral')
    expect(useSettings.getState().model).toBe('mistral')
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
    expect(dialog).toHaveTextContent('ollama pull')
    expect(dialog).toHaveTextContent('OLLAMA_ORIGINS')
    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(useSettings.getState().onboarded).toBe(true)
  })
})

describe('provider switch', () => {
  it('shows a cloud privacy notice and key status, and remembers models per provider', async () => {
    renderAt(<SettingsPage />)
    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'groq')
    expect(screen.getByRole('note')).toHaveTextContent(/sent to Groq/)
    expect(screen.getByRole('note')).toHaveTextContent('VITE_GROQ_API_KEY')
    expect(screen.getByLabelText('Model')).toHaveValue('llama-3.3-70b-versatile')
    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'ollama')
    expect(screen.getByLabelText('Model')).toHaveValue('llama3.1:8b')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
