import { describe, expect, it } from 'vitest'
import { emailPrompt } from './email'

const base = {
  resumeText: 'Vinamra Agrawal\nvin@example.com | 99999 00000 | Noida\nEXPERIENCE\n- Built things',
  jobTitle: 'Full Stack Developer Intern',
  company: 'POSCIG Technologies',
  jobDescription: 'Build React frontends and REST APIs.',
  kind: 'application' as const,
  tone: 'friendly' as const,
  candidateName: 'Vinamra Agrawal',
  recipientName: '',
  links: ['github.com/vinamrag-code', 'linkedin.com/in/vinamragrawal12'],
  attachments: ['resume'],
}

describe('emailPrompt', () => {
  it('keeps the Subject-first-line contract splitEmail relies on', () => {
    const system = emailPrompt(base)[0]!.content
    expect(system).toContain('The first line is "Subject:')
  })

  it('greets the company hiring team when no recipient is named', () => {
    const system = emailPrompt(base)[0]!.content
    expect(system).toContain('"Hi POSCIG Technologies Hiring Team,"')
    expect(system).toContain('Never a bare "Hello,"')
  })

  it('falls back to a neutral hiring-team greeting without a company', () => {
    const system = emailPrompt({ ...base, company: '' })[0]!.content
    expect(system).toContain('"Hi Hiring Team,"')
  })

  it('adds the email truthfulness rules for invented availability and referrals', () => {
    const system = emailPrompt(base)[0]!.content
    expect(system).toContain('EMAIL TRUTHFULNESS')
    expect(system).toContain('referrals ("referred by X"): mention them only if the resume or background text states them')
    expect(system).toContain('must come from the job description')
  })

  it('bans the stale opening clichés', () => {
    const system = emailPrompt(base)[0]!.content
    expect(system).toContain('Never use "I am writing to apply for"')
    expect(system).toContain('"Please find my resume attached"')
  })

  it('passes links through and requires them verbatim', () => {
    const [system, user] = emailPrompt(base)
    expect(system!.content).toContain('Include the candidate\'s links (GitHub, LinkedIn, portfolio) exactly as given')
    expect(user!.content).toContain('Links to include verbatim: github.com/vinamrag-code | linkedin.com/in/vinamragrawal12')
  })

  it('omits the links block when there are none', () => {
    const user = emailPrompt({ ...base, links: [] })[1]!.content
    expect(user).not.toContain('Links to include')
  })

  it('tells the model to mention or skip attachments', () => {
    expect(emailPrompt(base)[0]!.content).toContain('mention the attachment in one natural sentence ("My resume is attached")')
    expect(emailPrompt({ ...base, attachments: [] })[0]!.content).toContain('do not mention attachments')
  })

  it('describes the email kind and tone', () => {
    const system = emailPrompt(base)[0]!.content
    expect(system).toContain('A first email applying for the role')
    expect(system).toContain('Warm and personable')
  })
})
