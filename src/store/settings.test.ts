import { describe, expect, it } from 'vitest'
import { useSettings } from './settings'

describe('settings migration', () => {
  it('resets a provider this build does not have (e.g. the removed Ollama) to Auto, and drops its model', async () => {
    localStorage.setItem('resume-ai:settings', JSON.stringify({ state: { provider: 'ollama', models: { ollama: 'llama3', groq: 'llama-x' }, theme: 'dark', onboarded: true }, version: 4 }))
    await useSettings.persist.rehydrate()
    const s = useSettings.getState()
    expect(s.provider).toBe('auto')
    expect(s.models).toEqual({ groq: 'llama-x' })
    expect(s.theme).toBe('dark')
    expect(s.onboarded).toBe(true)
  })
})
