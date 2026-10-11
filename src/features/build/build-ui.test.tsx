import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Embedder } from '@/lib/ats/embeddings'
import { clearEmbeddingCache } from '@/lib/bank/retrieve'
import { useBank } from '@/store/bank'
import { useResumes } from '@/store/resumes'
import { sampleContent } from '@/test/fixtures'
import { renderAt } from '@/test/helpers'
import { BuildPanel } from './BuildPanel'

const TOPICS = [/react|frontend|ui|typescript|web/i, /python|machine|model|data|ml/i, /cook|kitchen/i]
const embedder: Embedder = { embed: async (texts) => texts.map((t) => TOPICS.map((r) => (r.test(t) ? 1 : 0.01))) }
const draft = (over: Partial<Parameters<ReturnType<typeof useBank.getState>['add']>[0]>) => ({ kind: 'project' as const, title: '', org: '', location: '', start: '', end: '', link: '', bullets: [], skills: [], ...over })

beforeEach(() => {
  clearEmbeddingCache()
  useBank.setState({ items: [] })
  useResumes.setState({ resumes: [] })
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
    expect(screen.getByText(/Your experience bank is empty/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Add your projects and achievements there/ })).toHaveAttribute('href', '/bank')
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


describe('where building lives', () => {
  it('is offered on the Resumes page and opens the build page, not the bank page', async () => {
    const { DashboardPage } = await import('@/features/dashboard/DashboardPage')
    renderAt(<DashboardPage />)
    expect(screen.getByRole('link', { name: 'Build from experience bank' })).toHaveAttribute('href', '/build')
  })

  it('the build page can be pre-filled from a resume', async () => {
    const { BuildPage } = await import('./BuildPage')
    useBank.getState().add(draft({ title: 'Dashboard', bullets: ['Built it'] }))
    const r = useResumes.getState().create('Base', sampleContent())
    useResumes.getState().setTarget(r.id, { title: 'Data Analyst', company: 'Initech', description: 'Analyse data.' })
    renderAt(<BuildPage />, { path: '/build', route: `/build?from=${r.id}` })
    expect(screen.getByLabelText('Job title')).toHaveValue('Data Analyst')
    expect(screen.getByLabelText('Contact details and education from')).toHaveValue(r.id)
  })

  it('the Experience bank page is storage only', async () => {
    const { BankPage } = await import('@/features/bank/BankPage')
    renderAt(<BankPage />)
    expect(screen.getByRole('heading', { name: 'Experience bank' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add experience' })).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByText(/Build a resume for a job/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Find the best matches' })).not.toBeInTheDocument()
  })
})
