import { describe, expect, it } from 'vitest'
import { applyChanges, buildChanges, ProposedEditsSchema } from './changes'
import { buildResumeDocx } from './export/docx'
import { resumeToText } from './resume'
import { groupedSkills, parseSkillsText, skillLines, skillsText } from './skills'
import { sampleContent } from '@/test/fixtures'
import { DEFAULT_STYLE } from './resume'

const group = (heading: string, skills: string[]) => ({ id: heading, heading, skills })
const withGroups = () => ({ ...sampleContent(), skills: ['TypeScript', 'React', 'Node.js', 'SQL', 'Docker'], skillGroups: [group('Languages', ['typescript', 'SQL']), group('Tools', ['Docker', 'Gone'])] })

describe('groupedSkills', () => {
  it('is one plain line without sub-headings', () => {
    expect(groupedSkills({ skills: ['A', 'B'], skillGroups: [] })).toEqual([{ heading: '', skills: ['A', 'B'] }])
    expect(groupedSkills({ skills: [], skillGroups: [] })).toEqual([])
  })
  it('uses the resume wording, drops deleted skills and lists the rest under Other', () => {
    expect(groupedSkills(withGroups())).toEqual([
      { heading: 'Languages', skills: ['TypeScript', 'SQL'] },
      { heading: 'Tools', skills: ['Docker'] },
      { heading: 'Other', skills: ['React', 'Node.js'] },
    ])
  })
  it('shows up in the plain text and the DOCX', async () => {
    expect(skillLines(withGroups())[0]).toBe('Languages: TypeScript, SQL')
    expect(resumeToText(withGroups())).toContain('Tools: Docker')
    expect(buildResumeDocx(withGroups(), { ...DEFAULT_STYLE }, 'classic')).toBeTruthy()
  })
})

describe('skills text', () => {
  it('round-trips grouped text', () => {
    const c = withGroups()
    const back = parseSkillsText(skillsText(c))
    expect(back.skills).toEqual(['TypeScript', 'SQL', 'Docker', 'React', 'Node.js'])
    expect(back.skillGroups.map((g) => [g.heading, g.skills])).toEqual([['Languages', ['TypeScript', 'SQL']], ['Tools', ['Docker']]])
  })
  it('reads a plain comma list as no groups', () => {
    expect(parseSkillsText('A, B,, C')).toMatchObject({ skills: ['A', 'B', 'C'], skillGroups: [] })
  })
})

describe('agent sub-headings', () => {
  const only = (over: Record<string, unknown>, userText = '') =>
    buildChanges(sampleContent(), ProposedEditsSchema.parse(over), 'x', undefined, userText).find((c) => c.target.kind === 'skills')

  it('groups only skills the resume has, each once', () => {
    const ch = only({ skillGroups: [{ heading: 'Languages', skills: ['typescript', 'Rust', 'SQL'] }, { heading: 'Tools', skills: ['Docker', 'SQL'] }] })!
    expect(ch.afterGroups!.map((g) => [g.heading, g.skills])).toEqual([['Languages', ['TypeScript', 'SQL']], ['Tools', ['Docker']]])
    expect(ch.afterSkills).toEqual(sampleContent().skills)
    expect(ch.warnings).toEqual([])
  })
  it('puts a skill the user named into a group, and nothing else', () => {
    const ch = only({ addSkills: ['LangChain'], skillGroups: [{ heading: 'AI', skills: ['LangChain', 'LangGraph'] }] }, 'add LangChain')!
    expect(ch.afterGroups!.map((g) => g.skills)).toEqual([['LangChain']])
    expect(ch.afterSkills).toContain('LangChain')
    expect(ch.afterSkills).not.toContain('LangGraph')
  })
  it('adds skills the user listed even when the model only put them inside sub-headings', () => {
    const said = 'add: AI & LLMs: Prompt Engineering, LangGraph\nTools: Git, GitHub Actions'
    const ch = only({ skillGroups: [{ heading: 'AI & LLMs', skills: ['Prompt Engineering', 'LangGraph', 'Rust'] }, { heading: 'Tools', skills: ['Docker', 'GitHub Actions'] }] }, said)!
    expect(ch.afterSkills).toEqual(expect.arrayContaining(['Prompt Engineering', 'LangGraph', 'GitHub Actions']))
    expect(ch.afterSkills).not.toContain('Rust')
    expect(ch.afterGroups!.map((g) => [g.heading, g.skills])).toEqual([['AI & LLMs', ['Prompt Engineering', 'LangGraph']], ['Tools', ['Docker', 'GitHub Actions']]])
  })
  it('applies, and keeps existing sub-headings on a plain reorder', () => {
    const content = withGroups()
    const grouped = buildChanges(sampleContent(), ProposedEditsSchema.parse({ skillGroups: [{ heading: 'Frontend', skills: ['React'] }] }), 'x').find((c) => c.target.kind === 'skills')!
    const done = applyChanges(sampleContent(), [{ ...grouped, status: 'accepted' }]).content
    expect(done.skillGroups.map((g) => g.heading)).toEqual(['Frontend'])
    const reorder = buildChanges(content, ProposedEditsSchema.parse({ skills: ['Docker', 'SQL'] }), 'x').find((c) => c.target.kind === 'skills')!
    const after = applyChanges(content, [{ ...reorder, status: 'accepted' }]).content
    expect(after.skills[0]).toBe('Docker')
    expect(after.skillGroups.map((g) => g.heading)).toEqual(['Languages', 'Tools'])
  })
})

describe('resumes saved before sub-headings', () => {
  it('get an empty skillGroups list', async () => {
    const { withSkillGroups, newResume } = await import('./resume')
    const old = newResume('old', sampleContent())
    delete (old.content as Partial<typeof old.content>).skillGroups
    const [fixed] = withSkillGroups([old])
    expect(fixed!.content.skillGroups).toEqual([])
    expect(() => groupedSkills(fixed!.content)).not.toThrow()
  })
  it('are repaired when the store loads them', async () => {
    const { newResume } = await import('./resume')
    const old = newResume('old', sampleContent())
    delete (old.content as Partial<typeof old.content>).skillGroups
    localStorage.setItem('resume-ai:resumes', JSON.stringify({ state: { resumes: [old] }, version: 0 }))
    const { useResumes } = await import('@/store/resumes')
    await useResumes.persist.rehydrate()
    expect(useResumes.getState().resumes[0]!.content.skillGroups).toEqual([])
  })
})
