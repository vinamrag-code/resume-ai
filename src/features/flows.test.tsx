import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setLlmClient, LlmError } from '@/lib/llm'
import { resumeToText } from '@/lib/resume'
import { useCoverLetters } from '@/store/coverLetters'
import { useJobs } from '@/store/jobs'
import { useResumes } from '@/store/resumes'
import { sampleContent, SAMPLE_JD } from '@/test/fixtures'
import { mockLlm, renderAt } from '@/test/helpers'
import { AtsPanel } from './ats/AtsPanel'
import { useResumeScore } from './ats/useResumeScore'
import type { Embedder } from '@/lib/ats/embeddings'
import type { Resume } from '@/types/resume'
import { ChatPanel } from './chat/ChatPanel'
import { useChats } from './chat/chatStore'
import { CoverLetterPage } from './cover/CoverLetterPage'
import { ImportPage } from './import/ImportPage'
import { TailorPanel } from './tailor/TailorPanel'
import { TrackerPage } from './tracker/TrackerPage'
import { WorkspacePage } from './workspace/WorkspacePage'

beforeEach(() => {
  useResumes.setState({ resumes: [] })
  useJobs.setState({ jobs: [] })
  useCoverLetters.setState({ letters: [] })
  useChats.setState({ byResume: {} })
})
afterEach(() => setLlmClient(null))

const seedResume = (target = { title: 'Frontend Engineer', company: 'Acme', description: SAMPLE_JD }) => {
  const r = useResumes.getState().create('Base', sampleContent())
  useResumes.getState().setTarget(r.id, target)
  return useResumes.getState().resumes.find((x) => x.id === r.id)!
}

describe('import flow', () => {
  const parsedJson = JSON.stringify({
    contact: { name: 'Grace Hopper', email: 'grace@navy.mil', phone: '', location: 'NYC', links: [] },
    summary: 'Computer scientist',
    experience: [{ company: 'US Navy', title: 'Rear Admiral', location: '', start: '1943', end: '1986', bullets: ['Built the first compiler'] }],
    education: [],
    projects: [],
    skills: ['COBOL'],
    certifications: [],
  })

  it('parses pasted text with the LLM, saves a resume and opens the editor', async () => {
    const llm = mockLlm([parsedJson])
    renderAt(<ImportPage />, { path: '/import', route: '/import' })
    const button = screen.getByRole('button', { name: 'Parse with AI' })
    expect(button).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/paste resume text/i), 'Grace Hopper. Rear Admiral at US Navy 1943-1986. Built the first compiler.')
    await userEvent.click(button)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/resume\//))
    const saved = useResumes.getState().resumes[0]!
    expect(saved.content.contact.name).toBe('Grace Hopper')
    expect(saved.content.experience[0]!.bullets).toEqual(['Built the first compiler'])
    expect(llm.calls[0]![0]!.content).toMatch(/never invent|Never invent/i)
  })

  it('shows a friendly error when Ollama is unreachable and keeps the text', async () => {
    mockLlm([new LlmError('unreachable', 'Could not reach Ollama. Start it and try again.')])
    renderAt(<ImportPage />, { path: '/import', route: '/import' })
    await userEvent.type(screen.getByLabelText(/paste resume text/i), 'Some resume text that is long enough to parse.')
    await userEvent.click(screen.getByRole('button', { name: 'Parse with AI' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach ollama/i)
    expect(screen.getByRole('link', { name: /open settings/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/paste resume text/i)).toHaveValue('Some resume text that is long enough to parse.')
    expect(useResumes.getState().resumes).toHaveLength(0)
  })

  it('creates a blank resume from scratch', async () => {
    renderAt(<ImportPage />, { path: '/import', route: '/import' })
    await userEvent.click(screen.getByRole('button', { name: 'Start from scratch' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/resume\//))
    expect(useResumes.getState().resumes).toHaveLength(1)
  })
})

describe('editor and preview', () => {
  const open = () => {
    const r = seedResume()
    renderAt(<WorkspacePage />, { path: '/resume/:id', route: `/resume/${r.id}` })
    return r
  }

  it('edits live in the preview and autosaves to the store', async () => {
    const r = open()
    const name = screen.getByLabelText('Full name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Ada King')
    expect(within(screen.getByTestId('resume-preview')).getByRole('heading', { level: 1 })).toHaveTextContent('Ada King')
    expect(useResumes.getState().resumes.find((x) => x.id === r.id)!.content.contact.name).toBe('Ada King')
  })

  it('adds, reorders and removes bullets', async () => {
    const r = open()
    const bullets = () => useResumes.getState().resumes.find((x) => x.id === r.id)!.content.experience[0]!.bullets
    await userEvent.click(screen.getAllByRole('button', { name: 'Add bullet' })[0]!)
    expect(bullets()).toHaveLength(4)
    const first = bullets()[0]!
    await userEvent.click(screen.getAllByRole('button', { name: 'Move bullet 1 down' })[0]!)
    expect(bullets()[1]).toBe(first)
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove bullet 4' })[0]!)
    expect(bullets()).toHaveLength(3)
  })

  it('adds and removes experience entries', async () => {
    const r = open()
    await userEvent.click(screen.getByRole('button', { name: 'Add role' }))
    expect(useResumes.getState().resumes.find((x) => x.id === r.id)!.content.experience).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Remove role 2' }))
    expect(useResumes.getState().resumes.find((x) => x.id === r.id)!.content.experience).toHaveLength(1)
  })

  it('switches templates and style controls', async () => {
    const r = open()
    await userEvent.click(screen.getByRole('button', { name: 'Design' }))
    await userEvent.click(screen.getByRole('radio', { name: /modern/i }))
    fireEvent.change(screen.getByLabelText(/font size/i), { target: { value: '12' } })
    const stored = useResumes.getState().resumes.find((x) => x.id === r.id)!
    expect(stored.templateId).toBe('modern')
    expect(stored.style.fontSize).toBe(12)
    expect(screen.getByTestId('resume-preview').style.fontSize).toBe('12pt')
  })

  it('shows a not-found state for unknown resumes', () => {
    renderAt(<WorkspacePage />, { path: '/resume/:id', route: '/resume/nope' })
    expect(screen.getByText('Resume not found')).toBeInTheDocument()
  })
})

describe('score badge', () => {
  it('shows a live ATS score in the workspace header and updates after edits', async () => {
    const r = seedResume()
    renderAt(<WorkspacePage />, { path: '/resume/:id', route: `/resume/${r.id}` })
    const badge = screen.getByText(/ATS score \d+\/100/)
    const before = badge.textContent
    await userEvent.clear(screen.getByLabelText('Email'))
    expect(screen.getByText(/ATS score \d+\/100/).textContent).not.toBe(before)
  })
})

function AtsHarness({ resume, embedderFactory }: { resume: Resume; embedderFactory?: () => Embedder }) {
  const scoring = useResumeScore(resume, embedderFactory)
  return (
    <>
      <p data-testid="overall">{scoring.report.overall}</p>
      <AtsPanel resume={resume} scoring={scoring} />
    </>
  )
}

describe('ATS panel', () => {
  it('shows the breakdown and missing keywords, and adds the semantic part on demand', async () => {
    const r = seedResume()
    const embedderFactory = () => ({ embed: async (t: string[]) => t.map(() => [1, 0]) })
    renderAt(<AtsHarness resume={r} embedderFactory={embedderFactory} />)
    expect(screen.getByText(/missing keywords/i)).toBeInTheDocument()
    expect(screen.getByText('graphql')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar', { name: /Semantic similarity/ })).not.toBeInTheDocument()
    const before = screen.getByTestId('overall').textContent
    await userEvent.click(screen.getByRole('button', { name: 'Run semantic match' }))
    expect(await screen.findByRole('progressbar', { name: /Semantic similarity/ })).toBeInTheDocument()
    expect(screen.getByTestId('overall').textContent).not.toBe(before)
  })

  it('works without a job description', () => {
    const r = seedResume({ title: '', company: '', description: '' })
    renderAt(<AtsHarness resume={r} />)
    expect(screen.queryByText(/missing keywords/i)).not.toBeInTheDocument()
    expect(screen.getByText(/add a job description/i)).toBeInTheDocument()
  })

  it('lets you edit a weak bullet in place and saves it into the resume', async () => {
    const r = seedResume()
    renderAt(<AtsHarness resume={r} />)
    const box = screen.getByLabelText(/Software Engineer at Analytical Co, bullet 2/)
    expect(box).toHaveValue('worked on APIs')
    await userEvent.clear(box)
    await userEvent.type(box, 'Maintained 6 internal APIs used by the analytics team every day')
    expect(screen.getByText(/100\/100/)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Save to resume' })[0]!)
    expect(useResumes.getState().resumes[0]!.content.experience[0]!.bullets[1]).toBe('Maintained 6 internal APIs used by the analytics team every day')
  })
})

describe('target job tab', () => {
  it('groups ATS analysis, Tailor and Agent under one Target job tab with a single job form and one score', async () => {
    const r = seedResume()
    renderAt(<WorkspacePage />, { path: '/resume/:id', route: `/resume/${r.id}` })
    expect(screen.queryByRole('button', { name: 'Tailor' })).not.toBeInTheDocument()
    expect(screen.getAllByText(/ATS score \d+\/100/)).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Target job' }))
    expect(screen.getAllByLabelText('Job description')).toHaveLength(1)
    for (const name of ['Tailor', 'Agent', 'ATS analysis']) {
      await userEvent.click(screen.getByRole('button', { name }))
      expect(screen.getAllByLabelText('Job description')).toHaveLength(1)
    }
    expect(screen.getByText(/Score breakdown/)).toBeInTheDocument()
    expect(screen.getAllByText(/ATS score \d+\/100/)).toHaveLength(1)
  })

  it('clicking the header score opens the Target job tab', async () => {
    const r = seedResume()
    renderAt(<WorkspacePage />, { path: '/resume/:id', route: `/resume/${r.id}` })
    await userEvent.click(screen.getByRole('button', { name: /ATS score/ }))
    expect(screen.getByText(/Score breakdown/)).toBeInTheDocument()
  })
})

describe('tailoring', () => {
  const reply = JSON.stringify({
    summary: 'Frontend-leaning engineer building reliable React and TypeScript applications.',
    bullets: [
      { section: 'experience', entry: 0, bullet: 1, text: 'Maintained internal APIs used across the analytics team', reason: 'clearer' },
      { section: 'experience', entry: 0, bullet: 0, text: 'Built a React dashboard used by 40 internal analysts every day, improving 99% uptime', reason: 'adds a number' },
    ],
    skills: ['React', 'TypeScript'],
  })

  it('shows diffs, honours accept/reject, and saves a copy without touching the original', async () => {
    const r = seedResume()
    mockLlm([reply])
    renderAt(<TailorPanel resume={r} />, { path: '/resume/:id', route: `/resume/${r.id}` })
    await userEvent.click(screen.getByLabelText(/save as a new tailored copy/i))
    await userEvent.click(screen.getByRole('button', { name: 'Suggest tailored changes' }))
    const cards = await screen.findAllByRole('listitem', { name: /^Change:/ })
    expect(cards).toHaveLength(4)
    expect(screen.getAllByTestId('diff-before').length).toBe(4)
    expect(screen.getByText(/"99%" does not appear in your resume/)).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Save as tailored copy' })).toBeDisabled()
    await userEvent.click(within(cards[0]!).getByRole('button', { name: 'Accept' }))
    expect(screen.getByRole('status')).toHaveTextContent('1 of 4 accepted')
    await userEvent.click(screen.getByRole('button', { name: 'Accept all' }))
    expect(screen.getByRole('status')).toHaveTextContent('4 of 4 accepted')
    await userEvent.click(within(cards[1]!).getByRole('button', { name: 'Reject' }))
    expect(screen.getByRole('status')).toHaveTextContent('3 of 4 accepted')

    await userEvent.click(screen.getByRole('button', { name: 'Save as tailored copy' }))
    await waitFor(() => expect(useResumes.getState().resumes).toHaveLength(2))
    const [copy, original] = useResumes.getState().resumes
    expect(original!.id).toBe(r.id)
    expect(resumeToText(original!.content)).toBe(resumeToText(sampleContent()))
    expect(copy!.baseResumeId).toBe(r.id)
    expect(copy!.content.summary).toMatch(/Frontend-leaning/)
    const job = useJobs.getState().jobs[0]!
    expect(job).toMatchObject({ company: 'Acme', status: 'saved', resumeId: copy!.id })
    expect(copy!.jobId).toBe(job.id)
  })

  it('edit mode: accepting writes into this resume, shows score impact, and can be undone', async () => {
    const r = seedResume()
    mockLlm([reply])
    renderAt(<TailorPanel resume={useResumes.getState().resumes[0]!} />)
    await userEvent.click(screen.getByRole('button', { name: 'Suggest tailored changes' }))
    const cards = await screen.findAllByRole('listitem', { name: /^Change:/ })
    const score = screen.getByLabelText('Score impact')
    expect(score).toHaveTextContent(/Before \d+/)
    expect(score).toHaveTextContent(/If all accepted \d+/)
    const bullets = () => useResumes.getState().resumes.find((x) => x.id === r.id)!.content.experience[0]!.bullets
    expect(bullets()[1]).toBe('worked on APIs')
    await userEvent.click(within(cards[1]!).getByRole('button', { name: 'Accept' }))
    expect(bullets()[1]).toBe('Maintained internal APIs used across the analytics team')
    expect(within(cards[1]!).getByText(/Applied/)).toBeInTheDocument()
    expect(useResumes.getState().resumes).toHaveLength(1)
    await userEvent.click(within(cards[1]!).getByRole('button', { name: 'Undo' }))
    expect(bullets()[1]).toBe('worked on APIs')
    expect(within(cards[1]!).queryByText(/Applied/)).not.toBeInTheDocument()
  })

  it('requires a job description and shows errors', async () => {
    const r = seedResume({ title: '', company: '', description: '' })
    renderAt(<TailorPanel resume={r} />)
    expect(screen.getByRole('button', { name: 'Suggest tailored changes' })).toBeDisabled()
  })

  it('surfaces model errors', async () => {
    const r = seedResume()
    mockLlm(['not json', 'still not json'])
    renderAt(<TailorPanel resume={r} />)
    await userEvent.click(screen.getByRole('button', { name: 'Suggest tailored changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/did not return valid structured data/i)
  })
})

describe('resume agent chat', () => {
  const edits = `Great answers. Here is a tighter bullet.\n<edits>${JSON.stringify({
    bullets: [{ section: 'experience', entry: 0, bullet: 1, text: 'Maintained internal APIs used by analysts', reason: 'specific' }],
  })}</edits>`

  it('asks clarifying questions first, then offers a one-click edit', async () => {
    const r = seedResume()
    const llm = mockLlm(['1. What APIs did you maintain?\n2. Who used them?', edits])
    renderAt(<ChatPanel resume={r} />)
    await userEvent.type(screen.getByLabelText(/message the resume counselor/i), 'Improve my experience')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText(/What APIs did you maintain/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply to resume' })).not.toBeInTheDocument()
    const system = llm.calls[0]![0]!.content
    expect(system).toMatch(/Ask 2-3 clarifying questions only/)
    expect(system).toContain('Acme') // resume + job context are included
    expect(system).toContain('GraphQL')

    await userEvent.type(screen.getByLabelText(/message the resume counselor/i), 'Internal analytics APIs for analysts')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    const apply = await screen.findByRole('button', { name: 'Apply to resume' })
    expect(screen.queryByText(/<edits>/)).not.toBeInTheDocument()
    await userEvent.click(apply)
    expect(useResumes.getState().resumes[0]!.content.experience[0]!.bullets[1]).toBe('Maintained internal APIs used by analysts')
    expect(screen.getByText(/Applied/)).toBeInTheDocument()
  })

  it('lets the user edit a suggestion before applying it', async () => {
    const r = seedResume()
    mockLlm(['Which APIs?', edits])
    renderAt(<ChatPanel resume={r} />)
    await userEvent.click(screen.getByRole('button', { name: 'Review my summary' }))
    await screen.findByText(/Which APIs/)
    await userEvent.type(screen.getByLabelText(/message the resume counselor/i), 'internal ones')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    const box = await screen.findByLabelText('Edit before applying')
    await userEvent.clear(box)
    await userEvent.type(box, 'Maintained internal APIs for analysts')
    await userEvent.click(screen.getByRole('button', { name: 'Apply my edited version' }))
    expect(useResumes.getState().resumes[0]!.content.experience[0]!.bullets[1]).toBe('Maintained internal APIs for analysts')
  })

  it('ignores edit blocks the model emits on the clarifying turn', async () => {
    const r = seedResume()
    mockLlm([edits])
    renderAt(<ChatPanel resume={r} />)
    await userEvent.click(screen.getByRole('button', { name: 'Review my summary' }))
    await screen.findByText(/Great answers/)
    expect(screen.queryByRole('button', { name: 'Apply to resume' })).not.toBeInTheDocument()
  })

  it('shows an error if the server is down', async () => {
    const r = seedResume()
    mockLlm([new LlmError('unreachable', 'Could not reach Ollama.')])
    renderAt(<ChatPanel resume={r} />)
    await userEvent.click(screen.getByRole('button', { name: 'Review my summary' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach ollama/i)
  })
})

describe('cover letters', () => {
  it('streams a letter, lets the user edit it, and keeps it saved', async () => {
    const r = seedResume()
    const llm = mockLlm(['Dear Hiring Manager,\n\nI build React apps.\n\nSincerely,\nAda Lovelace'])
    renderAt(<CoverLetterPage />, { path: '/cover', route: `/cover?resume=${r.id}` })
    await userEvent.click(screen.getByLabelText('Friendly'))
    await userEvent.click(screen.getByRole('button', { name: 'Generate letter' }))
    const body = (await screen.findByLabelText(/letter \(editable\)/i)) as HTMLTextAreaElement
    await waitFor(() => expect(body.value).toContain('Sincerely'))
    expect(llm.calls[0]![0]!.content).toMatch(/Warm, personable/)
    expect(useCoverLetters.getState().letters[0]).toMatchObject({ tone: 'friendly', resumeId: r.id })
    await userEvent.type(body, ' P.S. Thanks!')
    expect(useCoverLetters.getState().letters[0]!.body).toContain('P.S. Thanks!')
    expect(screen.getByTestId('letter-preview')).toHaveTextContent('P.S. Thanks!')
  })

  it('shows an empty state without resumes', () => {
    renderAt(<CoverLetterPage />, { path: '/cover', route: '/cover' })
    expect(screen.getByText('You need a resume first')).toBeInTheDocument()
  })
})

describe('job tracker', () => {
  it('adds a job and moves it between columns by drag and drop and by menu', async () => {
    renderAt(<TrackerPage />, { path: '/tracker', route: '/tracker' })
    await userEvent.click(screen.getAllByRole('button', { name: 'Add job' })[0]!)
    await userEvent.type(screen.getByLabelText('Job title'), 'Engineer')
    await userEvent.type(screen.getByLabelText('Company'), 'Initech')
    await userEvent.type(screen.getByLabelText('Notes'), 'Referral from Sam')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const card = within(screen.getByTestId('col-saved')).getByText('Engineer').closest('li')!
    expect(useJobs.getState().jobs[0]).toMatchObject({ title: 'Engineer', company: 'Initech', notes: 'Referral from Sam', status: 'saved' })

    fireEvent.dragStart(card)
    fireEvent.dragOver(screen.getByTestId('col-applied'))
    fireEvent.drop(screen.getByTestId('col-applied'))
    expect(useJobs.getState().jobs[0]!.status).toBe('applied')
    expect(within(screen.getByTestId('col-applied')).getByText('Engineer')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText(/move engineer to/i), 'offer')
    expect(useJobs.getState().jobs[0]!.status).toBe('offer')
  })

  it('links a resume and cover letter to a job', async () => {
    const r = seedResume()
    const letter = useCoverLetters.getState().add({ title: 'Letter A', resumeId: r.id, tone: 'formal', jobTitle: '', company: '', jobDescription: '', body: 'x' })
    useJobs.getState().add({ title: 'Dev', company: 'Hooli' })
    renderAt(<TrackerPage />, { path: '/tracker', route: '/tracker' })
    await userEvent.click(screen.getByRole('button', { name: /edit dev at hooli/i }))
    await userEvent.selectOptions(screen.getByLabelText('Tailored resume'), r.id)
    await userEvent.selectOptions(screen.getByLabelText('Cover letter'), letter.id)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(useJobs.getState().jobs[0]).toMatchObject({ resumeId: r.id, coverLetterId: letter.id })
  })

  it('deletes a job', async () => {
    useJobs.getState().add({ title: 'Dev', company: 'Hooli' })
    renderAt(<TrackerPage />, { path: '/tracker', route: '/tracker' })
    await userEvent.click(screen.getByRole('button', { name: /edit dev at hooli/i }))
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    })
    expect(useJobs.getState().jobs).toHaveLength(0)
  })
})
