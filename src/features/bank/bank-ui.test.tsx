import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Embedder } from '@/lib/ats/embeddings'
import { clearEmbeddingCache } from '@/lib/bank/retrieve'
import { createBackup, restoreBackup } from '@/store/backup'
import { useBank } from '@/store/bank'
import { useResumes } from '@/store/resumes'
import { sampleContent } from '@/test/fixtures'
import { renderAt } from '@/test/helpers'
import { BankList } from './BankList'
import { BuildPanel } from './BuildPanel'

const TOPICS = [/react|frontend|ui|typescript|web/i, /python|machine|model|data|ml/i, /cook|kitchen/i]
const embedder: Embedder = { embed: async (texts) => texts.map((t) => TOPICS.map((r) => (r.test(t) ? 1 : 0.01))) }
const draft = (over: Partial<Parameters<ReturnType<typeof useBank.getState>['add']>[0]>) => ({ kind: 'project' as const, title: '', org: '', location: '', start: '', end: '', link: '', bullets: [], skills: [], ...over })

beforeEach(() => {
  clearEmbeddingCache()
  useBank.setState({ items: [] })
  useResumes.setState({ resumes: [] })
})

describe('experience bank list', () => {
  it('adds an item with bullets and skills, edits it and deletes it', async () => {
    renderAt(<BankList />)
    expect(screen.getByText('Your experience bank is empty')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add experience' }))
    await userEvent.type(screen.getByLabelText('Project name'), 'Habit tracker')
    await userEvent.type(screen.getByLabelText(/What you did/), '- Built a React app{enter}Reached 300 users')
    await userEvent.type(screen.getByLabelText(/Skills and tools/), 'React, React, Firebase')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(useBank.getState().items[0]).toMatchObject({ kind: 'project', title: 'Habit tracker', bullets: ['Built a React app', 'Reached 300 users'], skills: ['React', 'Firebase'] })
    expect(screen.getByText('Built a React app')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit Habit tracker' }))
    await userEvent.clear(screen.getByLabelText('Project name'))
    await userEvent.type(screen.getByLabelText('Project name'), 'Habit app')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(useBank.getState().items).toHaveLength(1)
    expect(useBank.getState().items[0]!.title).toBe('Habit app')

    await userEvent.click(screen.getByRole('button', { name: 'Delete Habit app' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm delete Habit app' }))
    expect(useBank.getState().items).toHaveLength(0)
  })

  it('needs a company for work experience and at least one bullet', async () => {
    renderAt(<BankList />)
    await userEvent.click(screen.getByRole('button', { name: 'Add experience' }))
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'work')
    await userEvent.type(screen.getByLabelText('Job title'), 'Engineer')
    await userEvent.type(screen.getByLabelText(/What you did/), 'Did things')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Company'), 'Acme')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('imports from existing resumes once, without duplicates', async () => {
    useResumes.getState().create('A', sampleContent())
    useResumes.getState().create('B', sampleContent())
    renderAt(<BankList />)
    await userEvent.click(screen.getByRole('button', { name: 'Import from my resumes' }))
    const n = useBank.getState().items.length
    expect(n).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'Import from my resumes' }))
    expect(useBank.getState().items).toHaveLength(n)
    expect(screen.getByRole('status')).toHaveTextContent('already in the bank')
  })
})

describe('build a resume from the bank', () => {
  const seed = () => {
    useBank.getState().addMany([
      draft({ title: 'Line cook', kind: 'work', org: 'Bistro', start: '2020', end: '2021', bullets: ['Cooked in a busy kitchen'] }),
      draft({ title: 'Dashboard', bullets: ['Built a React and TypeScript dashboard', 'Wrote the web UI tests', 'Organised the team lunch'], skills: ['React'] }),
      draft({ title: 'Churn model', bullets: ['Trained a Python machine learning model'] }),
    ])
  }
  const fillJob = async () => {
    await userEvent.type(screen.getByLabelText('Job title'), 'Frontend Engineer')
    await userEvent.type(screen.getByLabelText('Company'), 'Globex')
    await userEvent.type(screen.getByLabelText('Job description'), 'We need a frontend engineer who builds React and TypeScript web user interfaces.')
  }

  it('asks for experience first when the bank is empty', () => {
    renderAt(<BuildPanel embedderFactory={() => embedder} />)
    expect(screen.getByText(/Add some experience first/)).toBeInTheDocument()
  })

  it('ranks items for the job, lets the user change the selection, and creates the resume', async () => {
    seed()
    const base = useResumes.getState().create('Base', sampleContent())
    renderAt(<BuildPanel embedderFactory={() => embedder} initialResumeId={base.id} />, { path: '/bank', route: '/bank' })
    expect(screen.getByRole('button', { name: 'Find the best matches' })).toBeDisabled()
    await fillJob()
    await userEvent.click(screen.getByRole('button', { name: 'Find the best matches' }))
    const list = await screen.findByRole('list')
    const rows = within(list).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Dashboard')
    expect(screen.queryByText(/keywords only/)).not.toBeInTheDocument()

    // Only the clearly relevant item is pre-selected; the user can add another and take it off again.
    expect(screen.getByRole('button', { name: 'Create resume from 1 item' })).toBeEnabled()
    await userEvent.click(screen.getByLabelText(/Churn model/))
    expect(screen.getByRole('button', { name: 'Create resume from 2 items' })).toBeEnabled()
    await userEvent.click(screen.getByLabelText(/Churn model/))
    await userEvent.click(screen.getByRole('button', { name: 'Create resume from 1 item' }))

    await waitFor(() => expect(useResumes.getState().resumes).toHaveLength(2))
    const made = useResumes.getState().resumes.find((r) => r.name === 'Frontend Engineer at Globex')!
    expect(made.target).toMatchObject({ title: 'Frontend Engineer', company: 'Globex' })
    expect(made.content.projects.map((p) => p.name)).toEqual(['Dashboard'])
    expect(made.content.projects[0]!.bullets).toHaveLength(3)
    expect(made.content.experience).toEqual([])
    expect(made.content.contact).toEqual(sampleContent().contact)
    expect(made.content.projects[0]!.bullets).not.toContain('Cooked in a busy kitchen')
  })

  it('says so when it had to fall back to keywords', async () => {
    seed()
    renderAt(<BuildPanel embedderFactory={() => ({ embed: async () => Promise.reject(new Error('offline')) })} />)
    await fillJob()
    await userEvent.click(screen.getByRole('button', { name: 'Find the best matches' }))
    expect(await screen.findByText(/keywords only/)).toBeInTheDocument()
    expect(within(screen.getByRole('list')).getAllByRole('listitem')[0]).toHaveTextContent('Dashboard')
  })
})

describe('backup', () => {
  it('includes the bank and restores it, and older backups without one still load', () => {
    useBank.getState().add(draft({ title: 'Kept', bullets: ['x'] }))
    const backup = createBackup()
    expect(backup.bank).toHaveLength(1)
    useBank.setState({ items: [] })
    expect(restoreBackup(JSON.stringify(backup)).ok).toBe(true)
    expect(useBank.getState().items[0]!.title).toBe('Kept')
    const { bank: _bank, ...old } = backup
    void _bank
    expect(restoreBackup(JSON.stringify(old)).ok).toBe(true)
    expect(useBank.getState().items).toEqual([])
  })
})
