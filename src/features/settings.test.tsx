import { screen } from '@testing-library/react'
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
  useSettings.setState({ provider: 'groq', onboarded: true, models: { groq: 'openai/gpt-oss-120b', openrouter: 'nvidia/nemotron-3-super-120b-a12b:free' } })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('settings', () => {
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
