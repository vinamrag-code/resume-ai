import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SignInNotice } from '@/components/SignInNotice'
import { EmptyState, ErrorBanner, Spinner } from '@/components/ui'
import { useAiAccess } from '@/lib/auth/useAiAccess'
import { JobUrlImport } from '@/features/workspace/JobUrlImport'
import { AreaField, TextField } from '@/features/editor/controls'
import { letterToDocxBlob } from '@/lib/export/coverLetterDocx'
import { downloadBlob, safeFilename } from '@/lib/export/download'
import { resumeToDocxBlob } from '@/lib/export/docx'
import { bankToText } from '@/lib/bank/text'
import { useAuth } from '@/lib/auth/store'
import { gmailUrl, mailtoUrl, splitEmail } from '@/lib/mail'
import { EMAIL_KINDS } from '@/lib/prompts'
import type { EmailKind } from '@/lib/prompts'
import { useBank } from '@/store/bank'
import { useCoverLetters } from '@/store/coverLetters'
import { useResumes } from '@/store/resumes'
import type { CoverTone } from '@/types/job'
import { streamEmail } from './generateEmail'

const KIND_LABELS: Record<EmailKind, string> = { application: 'Application', 'follow-up': 'Follow-up', 'thank-you': 'Thank-you' }
type JobSource = 'tailored' | 'link' | 'manual'
const TONES: { id: CoverTone; label: string }[] = [
  { id: 'formal', label: 'Formal' },
  { id: 'friendly', label: 'Friendly' },
  { id: 'concise', label: 'Concise' },
]

export function MailPage() {
  const aiAllowed = useAiAccess()
  const [params] = useSearchParams()
  const resumes = useResumes((s) => s.resumes)
  const letters = useCoverLetters((s) => s.letters)
  const bank = useBank((s) => s.items)
  const yourName = useAuth((s) => s.user?.name ?? '')
  // Without a resume the email is written from the experience bank alone.
  const background = bankToText(bank)

  // Arriving from a resume (?resume=) starts with that resume and its tailoring job; from the nav bar the user chooses.
  const initial = resumes.find((r) => r.id === params.get('resume'))
  const [resumeId, setResumeId] = useState(initial?.id ?? '')
  const resume = resumes.find((r) => r.id === resumeId)
  const [jobTitle, setJobTitle] = useState(initial?.target.title ?? '')
  const [company, setCompany] = useState(initial?.target.company ?? '')
  const [jd, setJd] = useState(initial?.target.description ?? '')
  const [source, setSource] = useState<JobSource>(initial?.target.description.trim() ? 'tailored' : 'manual')
  const [kind, setKind] = useState<EmailKind>('application')
  const [tone, setTone] = useState<CoverTone>('formal')
  const [recipientName, setRecipientName] = useState('')
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [withResume, setWithResume] = useState(true)
  const [letterId, setLetterId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [downloaded, setDownloaded] = useState(false)
  const abort = useRef<AbortController | null>(null)

  // Cover letters written for this resume or its job; the newest is offered first.
  const matching = resume ? letters.filter((l) => l.resumeId === resumeId || (resume.jobId && l.jobId === resume.jobId)) : letters
  const letter = letters.find((l) => l.id === letterId)
  const attachments = [...(withResume && resume ? ['resume'] : []), ...(letter ? ['cover letter'] : [])]

  const pickResume = (id: string) => {
    setResumeId(id)
    setLetterId('')
    const r = resumes.find((x) => x.id === id)
    // Keep a job the user already typed or imported when they switch to "no resume".
    if (r) pickSource(r.target.description.trim() ? 'tailored' : 'manual', r)
    else if (source === 'tailored') pickSource('manual')
  }

  const pickSource = (next: JobSource, r = resume) => {
    setSource(next)
    if (next === 'tailored' && r) {
      setJobTitle(r.target.title)
      setCompany(r.target.company)
      setJd(r.target.description)
    } else if (next === 'manual' || next === 'link') {
      setJobTitle('')
      setCompany('')
      setJd('')
    }
  }

  const generate = async () => {
    if (!canWrite) return
    setError(null)
    setBusy(true)
    setSubject('')
    setBody('')
    abort.current = new AbortController()
    let raw = ''
    try {
      await streamEmail({ resume, background, candidateName: yourName, jobTitle, company, jobDescription: jd, kind, tone, recipientName, attachments }, (tok) => {
        raw += tok
        const parts = splitEmail(raw)
        setSubject(parts.subject)
        setBody(parts.body)
      }, abort.current.signal)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const downloadAttachments = async () => {
    try {
      if (withResume && resume) downloadBlob(await resumeToDocxBlob(resume.content, resume.style, resume.templateId), safeFilename(resume.name, 'docx'))
      if (letter) downloadBlob(await letterToDocxBlob(letter.body, letter.title), safeFilename(letter.title, 'docx'))
      setDownloaded(true)
    } catch (err) {
      setError(err)
    }
  }

  const canWrite = jd.trim() !== '' && (!!resume || background.trim() !== '')
  const draft = { to: to.trim(), subject, body }
  const ready = body.trim() !== ''

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Emails</h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Write an email for a job, attach your resume and cover letter, then open it in your email app.</p>
      </div>
      <SignInNotice feature="emails" />
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <section className="card space-y-3 no-print" aria-label="Write an email">
          <h2 className="text-base font-semibold">New email</h2>
          <div>
            <label htmlFor="ml-resume" className="label">Resume (optional)</label>
            <select id="ml-resume" className="input" value={resumeId} onChange={(e) => pickResume(e.target.value)}>
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
                  <input type="radio" name="mail-source" checked={source === 'tailored'} onChange={() => pickSource('tailored')} /> Job this resume is tailored for
                </label>
              )}
              <label className="flex items-center gap-1.5">
                <input type="radio" name="mail-source" checked={source === 'link'} onChange={() => pickSource('link')} /> Import from a job link
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="mail-source" checked={source === 'manual'} onChange={() => pickSource('manual')} /> Enter it manually
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
          <AreaField label="Job description" rows={5} value={jd} onChange={setJd} />
          <div>
            <label htmlFor="ml-kind" className="label">Email type</label>
            <select id="ml-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as EmailKind)}>
              {EMAIL_KINDS.map((k) => (
                <option key={k} value={k}>{KIND_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <TextField label="Recipient name (optional)" value={recipientName} onChange={setRecipientName} />
          <fieldset>
            <legend className="label">Tone</legend>
            <div className="flex gap-3 text-sm">
              {TONES.map((t) => (
                <label key={t.id} className="flex items-center gap-1.5">
                  <input type="radio" name="mail-tone" checked={tone === t.id} onChange={() => setTone(t.id)} /> {t.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="label">Attach</legend>
            {resume && (
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={withResume} onChange={(e) => setWithResume(e.target.checked)} /> Resume ({resume.name})
              </label>
            )}
            <label htmlFor="ml-letter" className="label mt-2">Cover letter</label>
            <select id="ml-letter" className="input" value={letterId} onChange={(e) => setLetterId(e.target.value)}>
              <option value="">None</option>
              {matching.map((l) => (
                <option key={l.id} value={l.id}>{l.title}</option>
              ))}
            </select>
            {matching.length === 0 && (
              <p className="mt-1 text-xs text-ink-500">No cover letter yet. <Link className="underline" to={resumeId ? `/cover?resume=${resumeId}` : '/cover'}>Write one</Link>.</p>
            )}
          </fieldset>
          {busy ? (
            <button type="button" className="btn-secondary w-full" onClick={() => abort.current?.abort()}>
              <Spinner label="Writing" /> Stop
            </button>
          ) : (
            <button type="button" className="btn-primary w-full" disabled={!canWrite || !aiAllowed} onClick={() => void generate()}>
              Write email
            </button>
          )}
          {!canWrite && (
            <p className="text-xs text-ink-500">
              {jd.trim() ? <>Choose a resume, or <Link className="underline" to="/bank">add experience to your bank</Link>, to enable writing.</> : 'Add a job description to enable writing.'}
            </p>
          )}
        </section>

        <section className="min-w-0 space-y-3 no-print" aria-label="Email draft">
          {!ready && !busy ? (
            <EmptyState title="No email yet">Write one from the form, or type your own here after generating.</EmptyState>
          ) : (
            <>
              <TextField label="To" value={to} onChange={setTo} />
              <TextField label="Subject" value={subject} onChange={setSubject} />
              <div>
                <label htmlFor="ml-body" className="label">Message (editable)</label>
                <textarea id="ml-body" className="input min-h-80 leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} aria-busy={busy} />
              </div>
              {attachments.length > 0 && (
                <div className="card space-y-2 text-sm">
                  <p>
                    Attachments: <strong>{attachments.join(' and ')}</strong>. Email links cannot attach files, so download them
                    first, then add them to the email that opens.
                  </p>
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => void downloadAttachments()}>
                    Download attachments (DOCX)
                  </button>
                  {downloaded && <p className="text-xs text-ink-500">Downloaded. Drag the files into the email, or use its attach button.</p>}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <a className={`btn-primary ${ready && !busy ? '' : 'pointer-events-none opacity-50'}`} href={mailtoUrl(draft)} aria-disabled={!ready || busy}>
                  Open in email app
                </a>
                <a className={`btn-secondary ${ready && !busy ? '' : 'pointer-events-none opacity-50'}`} href={gmailUrl(draft)} target="_blank" rel="noreferrer" aria-disabled={!ready || busy}>
                  Open in Gmail
                </a>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
