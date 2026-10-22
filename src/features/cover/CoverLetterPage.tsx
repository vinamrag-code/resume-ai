import { IconX } from '@tabler/icons-react'
import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SignInNotice } from '@/components/SignInNotice'
import { EmptyState, ErrorBanner, Spinner } from '@/components/ui'
import { useAiAccess } from '@/lib/auth/useAiAccess'
import { JobUrlImport } from '@/features/workspace/JobUrlImport'
import { AreaField, TextField } from '@/features/editor/controls'
import { letterToDocxBlob } from '@/lib/export/coverLetterDocx'
import { downloadBlob, printToPdf, safeFilename } from '@/lib/export/download'
import { bankToText } from '@/lib/bank/text'
import { useAuth } from '@/lib/auth/store'
import { useBank } from '@/store/bank'
import { useCoverLetters } from '@/store/coverLetters'
import { useJobs } from '@/store/jobs'
import { useResumes } from '@/store/resumes'
import type { CoverTone } from '@/types/job'
import { streamCoverLetter } from './generateLetter'

type JobSource = 'tailored' | 'link' | 'manual'
const TONES: { id: CoverTone; label: string }[] = [
  { id: 'formal', label: 'Formal' },
  { id: 'friendly', label: 'Friendly' },
  { id: 'concise', label: 'Concise' },
]

export function CoverLetterPage() {
  const aiAllowed = useAiAccess()
  const [params, setParams] = useSearchParams()
  const resumes = useResumes((s) => s.resumes)
  const jobs = useJobs((s) => s.jobs)
  const letters = useCoverLetters((s) => s.letters)
  const { add, update, remove } = useCoverLetters.getState()
  const selected = letters.find((l) => l.id === params.get('id'))

  // Arriving from a resume (?resume=) starts with that resume and its tailoring job; from the nav bar the user chooses.
  const initial = resumes.find((r) => r.id === params.get('resume'))
  const [resumeId, setResumeId] = useState(initial?.id ?? '')
  const resume = resumes.find((r) => r.id === resumeId)
  const [jobTitle, setJobTitle] = useState(initial?.target.title ?? '')
  const [company, setCompany] = useState(initial?.target.company ?? '')
  const [jd, setJd] = useState(initial?.target.description ?? '')
  const [source, setSource] = useState<JobSource>(initial?.target.description.trim() ? 'tailored' : 'manual')
  const bank = useBank((s) => s.items)
  const yourName = useAuth((s) => s.user?.name ?? '')
  // Without a resume the letter is written from the experience bank alone.
  const background = bankToText(bank)
  const canWrite = jd.trim() !== '' && (!!resume || background.trim() !== '')
  const [tone, setTone] = useState<CoverTone>('formal')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const abort = useRef<AbortController | null>(null)

  const pickResume = (id: string) => {
    setResumeId(id)
    const r = resumes.find((x) => x.id === id)
    if (r) pickSource(r.target.description.trim() ? 'tailored' : 'manual', r)
    else if (source === 'tailored') pickSource('manual')
  }

  const pickSource = (next: JobSource, r = resume) => {
    setSource(next)
    if (next === 'tailored' && r) {
      setJobTitle(r.target.title)
      setCompany(r.target.company)
      setJd(r.target.description)
    } else if (next !== 'tailored') {
      setJobTitle('')
      setCompany('')
      setJd('')
    }
  }

  const generate = async () => {
    if (!canWrite) return
    setError(null)
    setBusy(true)
    const letter = add({
      title: `${company || jobTitle || 'Cover letter'} (${tone})`,
      resumeId: resume?.id,
      jobId: resume?.jobId,
      tone,
      jobTitle,
      company,
      jobDescription: jd,
      body: '',
    })
    setParams({ id: letter.id })
    abort.current = new AbortController()
    let body = ''
    try {
      await streamCoverLetter({ resume, background, candidateName: yourName, jobTitle, company, jobDescription: jd, tone }, (tok) => {
        body += tok
        update(letter.id, { body })
      }, abort.current.signal)
    } catch (err) {
      setError(err)
      if (!body.trim()) {
        remove(letter.id)
        setParams({})
      }
    } finally {
      setBusy(false)
    }
  }

  const linkToJob = (jobId: string) => {
    if (!selected) return
    if (selected.jobId && selected.jobId !== jobId) useJobs.getState().update(selected.jobId, { coverLetterId: undefined })
    update(selected.id, { jobId: jobId || undefined })
    if (jobId) useJobs.getState().update(jobId, { coverLetterId: selected.id })
  }

  const onDocx = async () => {
    if (!selected) return
    try {
      downloadBlob(await letterToDocxBlob(selected.body, selected.title), safeFilename(selected.title, 'docx'))
    } catch (err) {
      setError(err)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Cover letters</h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Generate a letter from a resume and a job description, edit it, then export.</p>
      </div>
      <SignInNotice feature="cover letters" />
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-4 no-print">
          <section className="card space-y-3" aria-label="Generate a cover letter">
            <h2 className="text-base font-semibold">New letter</h2>
            <div>
              <label htmlFor="cl-resume" className="label">Resume (optional)</label>
              <select id="cl-resume" className="input" value={resumeId} onChange={(e) => pickResume(e.target.value)}>
                <option value="">No resume (use my experience bank)</option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            {!resume && bank.length > 0 && <p className="text-xs text-ink-500">Written from your experience bank ({bank.length} {bank.length === 1 ? 'entry' : 'entries'}).</p>}
            <fieldset>
              <legend className="label">Job</legend>
              <div className="flex flex-col gap-1.5 text-sm">
                {resume?.target.description.trim() && (
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="cl-source" checked={source === 'tailored'} onChange={() => pickSource('tailored')} /> Job this resume is tailored for
                  </label>
                )}
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="cl-source" checked={source === 'link'} onChange={() => pickSource('link')} /> Import from a job link
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="cl-source" checked={source === 'manual'} onChange={() => pickSource('manual')} /> Enter it manually
                </label>
              </div>
            </fieldset>
            {source === 'link' && (
              <JobUrlImport
                existingDescription={jd}
                onImport={(job) => {
                  setJobTitle(job.title)
                  setCompany(job.company)
                  setJd(job.description)
                }}
              />
            )}
            <TextField label="Job title" value={jobTitle} onChange={setJobTitle} />
            <TextField label="Company" value={company} onChange={setCompany} />
            <AreaField label="Job description" rows={6} value={jd} onChange={setJd} />
            <fieldset>
              <legend className="label">Tone</legend>
              <div className="flex gap-3 text-sm">
                {TONES.map((t) => (
                  <label key={t.id} className="flex items-center gap-1.5">
                    <input type="radio" name="tone" checked={tone === t.id} onChange={() => setTone(t.id)} /> {t.label}
                  </label>
                ))}
              </div>
            </fieldset>
            {busy ? (
              <button type="button" className="btn-secondary w-full" onClick={() => abort.current?.abort()}>
                <Spinner label="Generating" /> Stop
              </button>
            ) : (
              <button type="button" className="btn-primary w-full" disabled={!canWrite || !aiAllowed} onClick={() => void generate()}>
                Generate letter
              </button>
            )}
            {!canWrite && <p className="text-xs text-ink-500">{jd.trim() ? <>Choose a resume, or <Link className="underline" to="/bank">add experience to your bank</Link>, to enable generation.</> : 'Add a job description to enable generation.'}</p>}
          </section>

          <section className="card" aria-label="Saved letters">
            <h2 className="mb-2 text-base font-semibold">Saved letters</h2>
            {letters.length === 0 ? (
              <p className="text-sm text-ink-500 dark:text-ink-400">None yet.</p>
            ) : (
              <ul className="space-y-1">
                {letters.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2">
                    <button type="button" className={`truncate rounded px-2 py-1 text-left text-sm hover:bg-ink-100 dark:hover:bg-ink-800 ${l.id === selected?.id ? 'font-semibold' : ''}`} aria-current={l.id === selected?.id ? 'true' : undefined} onClick={() => setParams({ id: l.id })}>
                      {l.title}
                    </button>
                    <button type="button" className="btn-ghost btn-sm" aria-label={`Delete ${l.title}`} disabled={busy} onClick={() => { remove(l.id); if (l.id === selected?.id) setParams({}) }}>
                      <IconX className="h-4 w-4" stroke={2} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="min-w-0">
          {!selected ? (
            <EmptyState title="No letter selected">Generate a new letter or pick a saved one.</EmptyState>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              <section className="no-print space-y-3" aria-label="Edit letter">
                <TextField label="Title" value={selected.title} onChange={(v) => update(selected.id, { title: v })} />
                <div>
                  <label htmlFor="cl-body" className="label">Letter (editable)</label>
                  <textarea id="cl-body" className="input min-h-96 leading-relaxed" value={selected.body} onChange={(e) => update(selected.id, { body: e.target.value })} aria-busy={busy} />
                </div>
                <div>
                  <label htmlFor="cl-job" className="label">Linked job</label>
                  <select id="cl-job" className="input" value={selected.jobId ?? ''} onChange={(e) => linkToJob(e.target.value)}>
                    <option value="">None</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>{j.title} - {j.company}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-primary" disabled={!selected.body.trim()} onClick={printToPdf}>Export PDF</button>
                  <button type="button" className="btn-secondary" disabled={!selected.body.trim()} onClick={() => void onDocx()}>Export DOCX</button>
                </div>
              </section>
              <div className="overflow-x-auto">
                <div className="resume-paper print-area whitespace-pre-wrap" style={{ fontFamily: 'Calibri, Arial, sans-serif', fontSize: '11pt', lineHeight: 1.5 }} data-testid="letter-preview">
                  {selected.body}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
