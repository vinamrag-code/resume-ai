import { afterEach, describe, expect, it } from 'vitest'
import { buildChanges, currentFormat, ProposedEditsSchema } from '@/lib/changes'
import { setLlmClient } from '@/lib/llm'
import { AGENT_RULES, chatSystemPrompt, EDITING_AGENT_RULES, tailorPrompt } from '@/lib/prompts'
import { newResume, resumeToText } from '@/lib/resume'
import { sampleContent } from '@/test/fixtures'
import { mockLlm } from '@/test/helpers'
import { reviewChanges, UNREQUESTED_WARNING } from './reviewChanges'

const content = sampleContent()
const resume = newResume('x', content)
const changesFor = (edits: Record<string, unknown>) => buildChanges(content, ProposedEditsSchema.parse(edits), resumeToText(content), currentFormat(resume), 'add Go to my skills and remove my projects')
const run = (changes: ReturnType<typeof changesFor>) =>
  reviewChanges({ request: 'add Go to my skills and remove my projects', full: 'Done.', changes, messages: [{ role: 'system', content: 's' }], resume, phase: 'edit', userText: 'add Go to my skills and remove my projects' })

afterEach(() => setLlmClient(null))

describe('agent rules', () => {
  it('are part of the chat and tailor prompts, and the editing rules extend the core ones', () => {
    expect(EDITING_AGENT_RULES).toContain(AGENT_RULES)
    expect(EDITING_AGENT_RULES).toContain('<edits>')
    expect(chatSystemPrompt({ resumeJson: '{}', jobTitle: '', company: '', jobDescription: '' }).content).toContain(EDITING_AGENT_RULES)
    expect(tailorPrompt({ resumeJson: '{}', jobDescription: 'x' } as never)[0]!.content).toContain(AGENT_RULES)
  })
})

describe('reviewChanges', () => {
  it('asks once for the part of a request the first reply left out, and keeps what it already had', async () => {
    const first = changesFor({ removeSections: [{ section: 'projects' }] })
    const llm = mockLlm([
      '{"missing":["add Go to my skills"],"unrequested":[]}',
      'I also suggest adding Go.<edits>{"addSkills":["Go"],"removeSections":[{"section":"projects"}]}</edits>',
    ])
    const out = await run(first)
    expect(out.changes.map((c) => c.label)).toEqual(['Remove projects section', 'Skills order'])
    expect(out.changes[1]!.afterSkills).toContain('Go')
    expect(out.note).toBe('I also suggest adding Go.')
    expect(llm.calls).toHaveLength(2)
    expect(llm.calls[1]!.at(-1)!.content).toContain('add Go to my skills')
  })

  it('flags edits the user did not ask for, without removing them', async () => {
    mockLlm(['{"missing":[],"unrequested":[1]}'])
    const out = await run(changesFor({ removeSections: [{ section: 'projects' }], fields: [{ section: 'contact', field: 'phone', value: '555-0199' }] }))
    expect(out.changes).toHaveLength(2)
    expect(out.changes[0]!.warnings).not.toContain(UNREQUESTED_WARNING)
    expect(out.changes[1]!.warnings).toContain(UNREQUESTED_WARNING)
  })

  it('changes nothing when the reviewer fails or nothing is proposed', async () => {
    const first = changesFor({ removeSections: [{ section: 'projects' }] })
    mockLlm(['not json at all'])
    expect((await run(first)).changes).toEqual(first)
    const none = mockLlm(['{"missing":["x"],"unrequested":[]}'])
    expect((await run([])).changes).toEqual([])
    expect(none.calls).toHaveLength(0)
  })
})
