import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useResumes } from '@/store/resumes'
import { sampleContent } from '@/test/fixtures'
import { renderAt } from '@/test/helpers'
import type { TargetJob } from '@/types/resume'
import { TargetJobForm } from './TargetJobForm'

const job = { title: 'Platform Engineer', company: 'Globex', location: 'Pune, India', workType: 'hybrid', description: 'Build and run our platform.\n- Kubernetes\n- Go' }

function seed(target = empty) {
  const r = useResumes.getState().create('Base', sampleContent())
  useResumes.getState().setTarget(r.id, target)
  return r.id
}
const current = (id: string) => useResumes.getState().resumes.find((x) => x.id === id)!.target
const empty: TargetJob = { title: '', company: '', description: '', location: '', workType: 'unspecified' }
const mockFetch = (res: { ok: boolean; status?: number; body: unknown }) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: res.ok, status: res.status ?? (res.ok ? 200 : 422), json: async () => res.body } as Response)

/** Like the real page: re-renders when the store changes. */
function Live({ id }: { id: string }) {
  const r = useResumes((s) => s.resumes.find((x) => x.id === id))
  return r ? <TargetJobForm resume={r} /> : null
}

beforeEach(() => useResumes.setState({ resumes: [] }))
afterEach(() => vi.restoreAllMocks())

describe('job link import', () => {
  it('fills the description, title and company from a link', async () => {
    const id = seed()
    const f = mockFetch({ ok: true, body: { job } })
    renderAt(<Live id={id} />)
    await userEvent.type(screen.getByLabelText('Import from a job link'), 'https://globex.com/jobs/1')
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    await waitFor(() => expect(current(id).description).toBe(job.description))
    expect(current(id)).toMatchObject({ title: 'Platform Engineer', company: 'Globex', location: 'Pune, India', workType: 'hybrid' })
    expect(screen.getByLabelText('Location (optional)')).toHaveValue('Pune, India')
    expect(screen.getByLabelText('Work type')).toHaveValue('hybrid')
    expect(JSON.parse((f.mock.calls[0]![1] as RequestInit).body as string)).toEqual({ url: 'https://globex.com/jobs/1' })
    expect(f.mock.calls[0]![0]).toBe('/api/job/import')
    expect(await screen.findByText(/Imported Platform Engineer at Globex/)).toBeInTheDocument()
  })

  it('lets the user set location and work type by hand, and does not clear them when the link has none', async () => {
    const id = seed({ ...empty, location: 'Delhi', workType: 'remote' })
    mockFetch({ ok: true, body: { job: { ...job, location: '', workType: 'unspecified' } } })
    renderAt(<Live id={id} />)
    await userEvent.selectOptions(screen.getByLabelText('Work type'), 'onsite')
    expect(current(id).workType).toBe('onsite')
    await userEvent.type(screen.getByLabelText('Import from a job link'), 'https://globex.com/jobs/1{Enter}')
    await waitFor(() => expect(current(id).description).toBe(job.description))
    expect(current(id)).toMatchObject({ location: 'Delhi', workType: 'onsite' })
  })

  it('keeps a title and company the user already typed', async () => {
    const id = seed({ ...empty, title: 'My title', company: 'My co' })
    mockFetch({ ok: true, body: { job } })
    renderAt(<Live id={id} />)
    await userEvent.type(screen.getByLabelText('Import from a job link'), 'https://globex.com/jobs/1{Enter}')
    await waitFor(() => expect(current(id).description).toBe(job.description))
    expect(current(id)).toMatchObject({ title: 'My title', company: 'My co' })
  })

  it('asks before replacing an existing description, and keeps it on cancel', async () => {
    const id = seed({ ...empty, description: 'My own notes' })
    mockFetch({ ok: true, body: { job } })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderAt(<Live id={id} />)
    await userEvent.type(screen.getByLabelText('Import from a job link'), 'https://globex.com/jobs/1')
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(current(id).description).toBe('My own notes')
  })

  it('shows the server message when a page cannot be read, and leaves the form alone', async () => {
    const id = seed()
    mockFetch({ ok: false, body: { error: { message: 'That site does not allow automatic access. Paste it instead.' } } })
    renderAt(<Live id={id} />)
    await userEvent.type(screen.getByLabelText('Import from a job link'), 'https://linkedin.com/jobs/view/1')
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('does not allow automatic access')
    expect(current(id).description).toBe('')
  })

  it('rejects text that is not a link without calling the server', async () => {
    const id = seed()
    const f = mockFetch({ ok: true, body: { job } })
    renderAt(<Live id={id} />)
    await userEvent.type(screen.getByLabelText('Import from a job link'), 'software engineer{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('full link')
    expect(f).not.toHaveBeenCalled()
  })
})

describe('saved resumes from before location and work type existed', () => {
  it('load with empty defaults', async () => {
    const { ResumeSchema } = await import('@/types/resume')
    const r = useResumes.getState().create('Old', sampleContent())
    const { location: _l, workType: _w, ...oldTarget } = r.target
    void _l
    void _w
    const parsed = ResumeSchema.parse({ ...r, target: oldTarget })
    expect(parsed.target).toMatchObject({ location: '', workType: 'unspecified' })
    expect(ResumeSchema.parse({ ...r, target: { ...oldTarget, workType: 'weird' } }).target.workType).toBe('unspecified')
  })
})
