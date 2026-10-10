import { describe, expect, it } from 'vitest'
import { emptyContent, hydrateParsed, newResume } from '@/lib/resume'
import { sampleContent } from '@/test/fixtures'
import { ParsedResumeSchema, ResumeContentSchema, ResumeSchema } from './resume'

describe('resume schema', () => {
  it('accepts valid content and rejects wrong types', () => {
    expect(ResumeContentSchema.safeParse(sampleContent()).success).toBe(true)
    expect(ResumeContentSchema.safeParse({ ...emptyContent(), skills: 'react' }).success).toBe(false)
    expect(ResumeSchema.safeParse(newResume('x')).success).toBe(true)
  })

  it('parsed schema tolerates nulls and missing sections from the model', () => {
    const p = ParsedResumeSchema.parse({ contact: { name: 'A', email: null }, experience: [{ company: 'X', title: null, bullets: null }] })
    expect(p.contact.email).toBe('')
    expect(p.summary).toBe('')
    expect(p.skills).toEqual([])
    expect(p.experience[0]!.bullets).toEqual([])
  })

  it('hydrate adds ids, trims, de-duplicates skills and drops empty entries', () => {
    const parsed = ParsedResumeSchema.parse({
      experience: [{ company: 'X', title: 'Dev', bullets: [' did a thing ', ''] }, { company: '', title: '' }],
      skills: ['React', 'React', ' '],
    })
    const c = hydrateParsed(parsed)
    expect(c.experience).toHaveLength(1)
    expect(c.experience[0]!.id).toMatch(/^[0-9a-f]{16}$/)
    expect(c.experience[0]!.bullets).toEqual(['did a thing'])
    expect(c.skills).toEqual(['React'])
    expect(ResumeContentSchema.safeParse(c).success).toBe(true)
  })
})
