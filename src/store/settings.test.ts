import { describe, expect, it } from 'vitest'
import { useSettings } from './settings'

describe('settings migration', () => {
  it('resets a provider this build does not have (saved by another build) to Auto, and drops its model', async () => {
    localStorage.setItem('resume-ai:settings', JSON.stringify({ state: { provider: 'inception', models: { inception: 'mercury-2.5', groq: 'llama-x' }, theme: 'dark', onboarded: true }, version: 4 }))
    await useSettings.persist.rehydrate()
    const s = useSettings.getState()
    expect(s.provider).toBe('auto')
    expect(s.models).toEqual({ groq: 'llama-x' })
    expect(s.theme).toBe('dark')
    expect(s.onboarded).toBe(true)
  })
})
