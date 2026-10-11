import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useResumes } from '@/store/resumes'
import { sampleContent } from '@/test/fixtures'
import { renderAt } from '@/test/helpers'
import { TargetJobForm } from './TargetJobForm'

const job = { title: 'Platform Engineer', company: 'Globex', location: 'Remote', description: 'Build and run our platform.\n- Kubernetes\n- Go' }

function seed(target = { title: '', company: '', description: '' }) {
  const r = useResumes.getState().create('Base', sampleContent())
  useResumes.getState().setTarget(r.id, target)
  return r.id
}
const current = (id: string) => useResumes.getState().resumes.find((x) => x.id === id)!.target
const mockFetch = (res: { ok: boolean; status?: number; body: unknown }) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: res.ok, status: res.status ?? (res.ok ? 200 : 422), json: async () => res.body } as Response)

beforeEach(() => useResumes.setState({ resumes: [] }))
afterEach(() => vi.restoreAllMocks())

describe('job link import', () => {
  it('fills the description, title and company from a link', async () => {
    const id = seed()
    const f = mockFetch({ ok: true, body: { job } })
    renderAt(<TargetJobForm resume={useResumes.getState().resumes[0]!} />)
    await userEvent.type(screen.getByLabelText('Import from a job link'), 'https://globex.com/jobs/1')
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    await waitFor(() => expect(current(id).description).toBe(job.description))
    expect(current(id)).toMatchObject({ title: 'Platform Engineer', company: 'Globex' })
    expect(JSON.parse((f.mock.calls[0]![1] as RequestInit).body as string)).toEqual({ url: 'https://globex.com/jobs/1' })
    expect(f.mock.calls[0]![0]).toBe('/api/job/import')
    expect(await screen.findByText(/Imported Platform Engineer at Globex/)).toBeInTheDocument()
  })

  it('keeps a title and company the user already typed', async () => {
    const id = seed({ title: 'My title', company: 'My co', description: '' })
    mockFetch({ ok: true, body: { job } })
    renderAt(<TargetJobForm resume={useResumes.getState().resumes[0]!} />)
    await userEvent.type(screen.getByLabelText('Import from a job link'), 'https://globex.com/jobs/1{Enter}')
    await waitFor(() => expect(current(id).description).toBe(job.description))
    expect(current(id)).toMatchObject({ title: 'My title', company: 'My co' })
  })

  it('asks before replacing an existing description, and keeps it on cancel', async () => {
    const id = seed({ title: '', company: '', description: 'My own notes' })
    mockFetch({ ok: true, body: { job } })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderAt(<TargetJobForm resume={useResumes.getState().resumes[0]!} />)
    await userEvent.type(screen.getByLabelText('Import from a job link'), 'https://globex.com/jobs/1')
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(current(id).description).toBe('My own notes')
  })

  it('shows the server message when a page cannot be read, and leaves the form alone', async () => {
    const id = seed()
    mockFetch({ ok: false, body: { error: { message: 'That site does not allow automatic access. Paste it instead.' } } })
    renderAt(<TargetJobForm resume={useResumes.getState().resumes[0]!} />)
    await userEvent.type(screen.getByLabelText('Import from a job link'), 'https://linkedin.com/jobs/view/1')
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('does not allow automatic access')
    expect(current(id).description).toBe('')
  })

  it('rejects text that is not a link without calling the server', async () => {
    seed()
    const f = mockFetch({ ok: true, body: { job } })
    renderAt(<TargetJobForm resume={useResumes.getState().resumes[0]!} />)
    await userEvent.type(screen.getByLabelText('Import from a job link'), 'software engineer{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('full link')
    expect(f).not.toHaveBeenCalled()
  })
})
