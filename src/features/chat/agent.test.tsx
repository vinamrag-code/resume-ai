import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyChanges, buildChanges, currentFormat, formatPatch, invertChange, ProposedEditsSchema, setAllStatus } from '@/lib/changes'
import { setLlmClient } from '@/lib/llm'
import { newResume, resumeToText } from '@/lib/resume'
import { useResumes } from '@/store/resumes'
import { sampleContent } from '@/test/fixtures'
import { mockLlm, renderAt } from '@/test/helpers'
import { ChatPanel } from './ChatPanel'
import { useChats } from '@/store/chats'
import { parseEdits, splitReply, visibleText } from './chatLogic'

const content = sampleContent()
const resume = newResume('x', content)
const build = (edits: Record<string, unknown>) => buildChanges(content, ProposedEditsSchema.parse(edits), resumeToText(content), currentFormat(resume))

beforeEach(() => {
  useResumes.setState({ resumes: [] })
  useChats.setState({ chats: [] })
})
afterEach(() => setLlmClient(null))

describe('richer edits', () => {
  it('builds layout changes from the real current layout and clamps values', () => {
    const c = build({ format: { headerAlign: 'center', bulletIndent: 9, fontSize: 11, spacing: 1, templateId: 'classic' } })
    expect(c.map((x) => x.label).sort()).toEqual(['Layout: bullet indent', 'Layout: font size', 'Layout: header alignment'])
    const indent = c.find((x) => x.target.kind === 'format' && x.target.key === 'bulletIndent')!
    expect(indent).toMatchObject({ before: '1.1', after: '3' })
    expect(formatPatch(indent)).toEqual({ style: { bulletIndent: 3 } })
    expect(formatPatch(c.find((x) => x.label.includes('alignment'))!)).toEqual({ style: { headerAlign: 'center' } })
  })

  it('ignores layout changes when the layout is unknown, and unknown fields', () => {
    expect(buildChanges(content, ProposedEditsSchema.parse({ format: { headerAlign: 'center' } }), 'x')).toEqual([])
    expect(build({ fields: [{ section: 'experience', entry: 0, field: 'salary', value: '1' }] })).toEqual([])
  })

  it('edits fields, adds and removes bullets, and undoes each exactly', () => {
    const all = setAllStatus(
      build({
        fields: [{ section: 'contact', field: 'phone', value: '555-0199' }, { section: 'experience', entry: 0, field: 'title', value: 'Senior Software Engineer' }],
        addBullets: [{ section: 'experience', entry: 0, bullet: 1, text: 'Mentored two junior developers' }],
        removeBullets: [{ section: 'experience', entry: 0, bullet: 1 }],
      }),
      'accepted',
    )
    expect(all).toHaveLength(4)
    const applied = applyChanges(content, all).content
    expect(applied.contact.phone).toBe('555-0199')
    expect(applied.experience[0]!.title).toBe('Senior Software Engineer')
    expect(applied.experience[0]!.bullets).not.toContain('worked on APIs')
    expect(applied.experience[0]!.bullets).toContain('Mentored two junior developers')
    // Undo in reverse order, as a stack.
    expect(applyChanges(applied, [...all].reverse().map(invertChange)).content).toEqual(content)
  })
})

describe('reply parsing never exposes JSON', () => {
  const json = '{"format":{"headerAlign":"center"}}'
  it('handles tags, fences, bare JSON and half-streamed JSON', () => {
    expect(splitReply(`Centered it.<edits>${json}</edits>`)).toEqual({ text: 'Centered it.', editsJson: json })
    expect(splitReply('Done:\n```json\n' + json + '\n```\nEnjoy')).toMatchObject({ text: 'Done:\n\nEnjoy', editsJson: json })
    expect(splitReply(json)).toEqual({ text: '', editsJson: json })
    expect(visibleText('Working on it ```json\n{"for')).toBe('Working on it')
    expect(visibleText('Plain answer without edits')).toBe('Plain answer without edits')
  })
  it('parses bare and fenced JSON into changes, and limits the first turn to layout/explicit fixes', () => {
    expect(parseEdits(json, resume, 'clarify').map((c) => c.label)).toEqual(['Layout: header alignment'])
    expect(parseEdits('```json\n' + json + '\n```', resume, 'edit')).toHaveLength(1)
    const rewrite = JSON.stringify({ summary: 'A rewritten summary of my experience building software.' })
    expect(parseEdits(`<edits>${rewrite}</edits>`, resume, 'clarify')).toEqual([])
    expect(parseEdits(`<edits>${rewrite}</edits>`, resume, 'edit')).toHaveLength(1)
  })
})

describe('agent chat: formatting requests', () => {
  const seed = () => useResumes.getState().create('Base', sampleContent())
  const send = async (text: string) => {
    await userEvent.type(screen.getByLabelText(/message the resume counselor/i), text)
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
  }

  it('applies a layout request on the very first message, without questions or JSON', async () => {
    const r = seed()
    const llm = mockLlm([`Sure, I centered your header.\n<edits>{"format":{"headerAlign":"center","bulletIndent":1.6,"reason":"cleaner look"}}</edits>`])
    renderAt(<ChatPanel resume={r} />)
    await send('center my name and indent the bullets more')
    expect(await screen.findByText(/I centered your header/)).toBeInTheDocument()
    expect(screen.queryByText(/headerAlign|<edits>/)).not.toBeInTheDocument()
    const system = llm.calls[0]![0]!.content
    expect(system).toContain('"headerAlign":"auto"')
    expect(system).toContain('"bulletIndent":1.1')
    const apply = screen.getAllByRole('button', { name: 'Apply to resume' })
    expect(apply).toHaveLength(2)
    await userEvent.click(apply[0]!)
    await userEvent.click(screen.getAllByRole('button', { name: 'Apply to resume' })[0]!)
    const stored = useResumes.getState().resumes[0]!
    expect(stored.style).toMatchObject({ headerAlign: 'center', bulletIndent: 1.6 })
    expect(stored.content).toEqual(sampleContent())
  })

  it('never shows raw JSON when the model replies with only JSON', async () => {
    const r = seed()
    mockLlm(['```json\n{"format":{"headerAlign":"right"}}\n```'])
    renderAt(<ChatPanel resume={r} />)
    await send('align the header to the right')
    expect(await screen.findByText(/Here are my suggested changes/)).toBeInTheDocument()
    expect(screen.queryByText(/headerAlign|```/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Apply to resume' }))
    expect(useResumes.getState().resumes[0]!.style.headerAlign).toBe('right')
  })

  it('explains itself instead of dumping JSON when there is nothing it can apply', async () => {
    const r = seed()
    mockLlm(['{"nothing":"useful"}'])
    renderAt(<ChatPanel resume={r} />)
    await send('indent line 3 by exactly 4 spaces')
    expect(await screen.findByText(/couldn't turn that into a change/i)).toBeInTheDocument()
    expect(screen.queryByText(/nothing/)).not.toBeInTheDocument()
  })

  it('lets the user fix a field explicitly on the first turn', async () => {
    const r = seed()
    mockLlm(['Updated your phone number.<edits>{"fields":[{"section":"contact","field":"phone","value":"+1 555 0100"}]}</edits>'])
    renderAt(<ChatPanel resume={r} />)
    await send('change my phone to +1 555 0100')
    await userEvent.click(await screen.findByRole('button', { name: 'Apply to resume' }))
    expect(useResumes.getState().resumes[0]!.content.contact.phone).toBe('+1 555 0100')
  })
})
