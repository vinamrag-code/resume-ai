import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Embedder } from '@/lib/ats/embeddings'
import { clearEmbeddingCache } from '@/lib/bank/retrieve'
import { ResumeEditor } from '@/features/editor/ResumeEditor'
import { useAuth } from '@/lib/auth/store'
import { useBank } from '@/store/bank'
import { useResumes } from '@/store/resumes'
import { sampleContent } from '@/test/fixtures'
import { mockLlm, renderAt } from '@/test/helpers'
import type { ResumeContent } from '@/types/resume'
import { BankList } from '@/features/bank/BankList'
import { BuildPanel } from './BuildPanel'

const embedder: Embedder = { embed: async (texts) => texts.map((t) => (/cook|kitchen|bistro/i.test(t) ? [0.01, 0.01, 1] : /react|frontend|web/i.test(t) ? [1, 0.01, 0.01] : [0.01, 1, 0.01])) }
const draft = (over: object) => ({ kind: 'project' as const, title: '', org: '', location: '', start: '', end: '', link: '', bullets: [] as string[], skills: [] as string[], ...over })

/** The editor with real state, like the workspace page. */
function Harness({ initial }: { initial: ResumeContent }) {
  const [c, setC] = useState(initial)
  return <ResumeEditor content={c} onChange={(fn) => setC((d) => fn(structuredClone(d)))} />
}
const section = (name: string) => screen.getByRole('region', { name })

beforeEach(() => {
  clearEmbeddingCache()
  useBank.setState({ items: [] })
  useResumes.setState({ resumes: [] })
})

describe('editing a resume from the experience bank', () => {
  it('adds a role from the bank, keeps the link and hides it from the picker afterwards', async () => {
    const item = useBank.getState().add(draft({ kind: 'work', title: 'Platform Engineer', org: 'Initech', start: '2021', end: '2023', bullets: ['Ran the build system'] }))
    renderAt(<Harness initial={{ ...sampleContent(), experience: [] }} />)
    await userEvent.click(within(section('Experience')).getByRole('button', { name: 'Add from experience bank' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Platform Engineer' }))
    expect(within(section('Experience')).getByDisplayValue('Initech')).toBeInTheDocument()
    expect(within(section('Experience')).getByText('Linked to experience bank')).toBeInTheDocument()
    await userEvent.click(within(section('Experience')).getByRole('button', { name: 'Add from experience bank' }))
    expect(screen.getByText('Nothing left to add. Store more in the Experience bank page.')).toBeInTheDocument()
    expect(item.id).toBeTruthy()
  })

  it('does not show the picker button when the bank is empty', () => {
    renderAt(<Harness initial={sampleContent()} />)
    expect(screen.queryByRole('button', { name: 'Add from experience bank' })).not.toBeInTheDocument()
  })

  it('shows when an entry differs, and updates from or saves to the bank', async () => {
    useBank.getState().add(draft({ title: 'Habit tracker', bullets: ['Built it in Firebase'] }))
    const content = { ...sampleContent(), projects: [] }
    renderAt(<Harness initial={content} />)
    await userEvent.click(within(section('Projects')).getByRole('button', { name: 'Add from experience bank' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Habit tracker' }))
    const projects = within(section('Projects'))
    // edit the bullet in the resume -> it now differs
    const box = projects.getByLabelText('Bullet 1')
    await userEvent.clear(box)
    await userEvent.type(box, 'Built it in Firebase for 300 users')
    expect(projects.getByText('Differs from experience bank')).toBeInTheDocument()
    // save the resume's version into the bank
    await userEvent.click(projects.getByRole('button', { name: 'Save changes to bank' }))
    expect(useBank.getState().items[0]!.bullets).toEqual(['Built it in Firebase for 300 users'])
    expect(projects.getByText('Linked to experience bank')).toBeInTheDocument()
    // edit the bank, then pull it into the resume
    useBank.getState().update(useBank.getState().items[0]!.id, { bullets: ['Rewrote it in Firebase'] })
    await userEvent.click(await projects.findByRole('button', { name: 'Update from bank' }))
    expect(projects.getByLabelText('Bullet 1')).toHaveValue('Rewrote it in Firebase')
  })

  it('saves an unlinked entry to the bank and can unlink it again', async () => {
    renderAt(<Harness initial={sampleContent()} />)
    const exp = within(section('Experience'))
    expect(exp.getByText('Not in your experience bank.')).toBeInTheDocument()
    await userEvent.click(exp.getByRole('button', { name: 'Save to experience bank' }))
    expect(useBank.getState().items).toHaveLength(1)
    expect(useBank.getState().items[0]).toMatchObject({ kind: 'work', title: sampleContent().experience[0]!.title })
    expect(exp.getByText('Linked to experience bank')).toBeInTheDocument()
    await userEvent.click(exp.getByRole('button', { name: 'Unlink' }))
    expect(exp.getByText('Not in your experience bank.')).toBeInTheDocument()
  })

  it('says so when the linked bank item was deleted', async () => {
    const it = useBank.getState().add(draft({ title: 'Gone', bullets: ['x'] }))
    const content = { ...sampleContent(), projects: [{ id: 'p', name: 'Gone', link: '', bullets: ['x'], bankId: it.id }] }
    useBank.getState().remove(it.id)
    renderAt(<Harness initial={content} />)
    expect(within(section('Projects')).getByText('Its experience-bank item was deleted.')).toBeInTheDocument()
  })
})

describe('bank page links', () => {
  it('links imported resume entries to the new bank items and shows where an item is used', async () => {
    const r = useResumes.getState().create('Main', sampleContent())
    renderAt(<BankList />)
    await userEvent.click(screen.getByRole('button', { name: 'Import from my resumes' }))
    const saved = useResumes.getState().resumes.find((x) => x.id === r.id)!
    expect(saved.content.experience.every((e) => e.bankId)).toBe(true)
    expect(saved.content.projects.every((p) => p.bankId)).toBe(true)
    const used = await screen.findAllByText(/Used in 1 resume/)
    expect(used.length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Main' }).length).toBeGreaterThan(0)
  })
})

describe('ask AI to build from the bank', () => {
  const seed = () =>
    useBank.getState().addMany([
      draft({ title: 'Dashboard', bullets: ['Built a React dashboard used by 40 people', 'Wrote the web UI tests'], skills: ['React'] }),
      draft({ title: 'Line cook', kind: 'work', org: 'Bistro', bullets: ['Cooked in a busy kitchen'] }),
    ])
  const prepare = async (reply: unknown) => {
    const llm = mockLlm([JSON.stringify(reply)])
    renderAt(<BuildPanel embedderFactory={() => embedder} />)
    await userEvent.type(screen.getByLabelText('Job title'), 'Frontend Engineer')
    await userEvent.type(screen.getByLabelText('Job description'), 'We need a frontend engineer who builds React web interfaces and dashboards.')
    await userEvent.click(screen.getByRole('button', { name: 'Find the best matches' }))
    await screen.findByRole('list')
    return llm
  }

  it('creates the resume with AI wording and reports what it did', async () => {
    seed()
    const dash = useBank.getState().items.find((i) => i.title === 'Dashboard')!
    const llm = await prepare({ summary: null, items: [{ id: dash.id, bullets: [{ from: 0, text: 'Built a React dashboard for 40 people' }, { from: 1, text: 'Built React and Cypress UI tests' }] }], skills: null })
    await userEvent.click(screen.getByRole('button', { name: 'Ask AI to build it' }))
    await waitFor(() => expect(useResumes.getState().resumes).toHaveLength(1))
    const made = useResumes.getState().resumes[0]!
    expect(made.content.projects[0]!.bullets).toEqual(['Built a React dashboard for 40 people', 'Wrote the web UI tests'])
    expect(made.content.projects[0]!.bankId).toBe(dash.id)
    expect(await screen.findByText(/1 bullet reworded by AI, 1 kept as you wrote them/)).toBeInTheDocument()
    expect(screen.getByText(/added Cypress/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open it' })).toHaveAttribute('href', `/resume/${made.id}`)
    // the AI only ever saw the chosen item, not the unrelated one
    expect(JSON.stringify(llm.calls[0])).not.toContain('Bistro')
  })

  it('is disabled while signed out and the sign-in notice explains why', async () => {
    seed()
    mockLlm(['{}'])
    renderAt(<BuildPanel embedderFactory={() => embedder} />)
    useAuth.setState({ required: true, user: null, loaded: true })
    await userEvent.type(await screen.findByLabelText('Job description'), 'We need a frontend engineer who builds React web interfaces.')
    await userEvent.click(screen.getByRole('button', { name: 'Find the best matches' }))
    await screen.findByRole('list')
    expect(screen.getByRole('button', { name: 'Ask AI to build it' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Create resume from/ })).toBeEnabled() // building without AI still works
    expect(screen.getByText(/Sign in to use AI resume building/)).toBeInTheDocument()
  })
})
