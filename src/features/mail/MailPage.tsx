import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SignInNotice } from '@/components/SignInNotice'
import { EmptyState, ErrorBanner, Spinner } from '@/components/ui'
import { useAiAccess } from '@/lib/auth/useAiAccess'
import { AreaField, TextField } from '@/features/editor/controls'
import { letterToDocxBlob } from '@/lib/export/coverLetterDocx'
import { downloadBlob, safeFilename } from '@/lib/export/download'
import { resumeToDocxBlob } from '@/lib/export/docx'
import { gmailUrl, mailtoUrl, splitEmail } from '@/lib/mail'
import { EMAIL_KINDS } from '@/lib/prompts'
import type { EmailKind } from '@/lib/prompts'
import { useCoverLetters } from '@/store/coverLetters'
import { useResumes } from '@/store/resumes'
import type { CoverTone } from '@/types/job'
import { streamEmail } from './generateEmail'

const KIND_LABELS: Record<EmailKind, string> = { application: 'Application', 'follow-up': 'Follow-up', 'thank-you': 'Thank-you' }
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

  const initial = resumes.find((r) => r.id === params.get('resume')) ?? resumes[0]
  const [resumeId, setResumeId] = useState(initial?.id ?? '')
  const resume = resumes.find((r) => r.id === resumeId)
  const [jobTitle, setJobTitle] = useState(initial?.target.title ?? '')
  const [company, setCompany] = useState(initial?.target.company ?? '')
  const [jd, setJd] = useState(initial?.target.description ?? '')
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
  const matching = letters.filter((l) => l.resumeId === resumeId || (resume?.jobId && l.jobId === resume.jobId))
  const letter = letters.find((l) => l.id === letterId)
  const attachments = [...(withResume ? ['resume'] : []), ...(letter ? ['cover letter'] : [])]

  const pickResume = (id: string) => {
    setResumeId(id)
    const r = resumes.find((x) => x.id === id)
    if (r) {
      setJobTitle(r.target.title)
      setCompany(r.target.company)
      setJd(r.target.description)
    }
    setLetterId('')
  }

  const generate = async () => {
    if (!resume) return
    setError(null)
    setBusy(true)
    setSubject('')
    setBody('')
    abort.current = new AbortController()
    let raw = ''
    try {
      await streamEmail({ resume, jobTitle, company, jobDescription: jd, kind, tone, recipientName, attachments }, (tok) => {
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

      {resumes.length === 0 ? (
        <EmptyState title="You need a resume first" action={<Link to="/import" className="btn-primary">Import a resume</Link>}>
          Emails are written from the experience in one of your resumes.
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <section className="card space-y-3 no-print" aria-label="Write an email">
            <h2 className="text-base font-semibold">New email</h2>
            <div>
              <label htmlFor="ml-resume" className="label">Resume</label>
              <select id="ml-resume" className="input" value={resumeId} onChange={(e) => pickResume(e.target.value)}>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
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
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={withResume} onChange={(e) => setWithResume(e.target.checked)} /> Resume{resume ? ` (${resume.name})` : ''}
              </label>
              <label htmlFor="ml-letter" className="label mt-2">Cover letter</label>
              <select id="ml-letter" className="input" value={letterId} onChange={(e) => setLetterId(e.target.value)}>
                <option value="">None</option>
                {matching.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
              {matching.length === 0 && (
                <p className="mt-1 text-xs text-ink-500">No cover letter for this resume yet. <Link className="underline" to={`/cover?resume=${resumeId}`}>Write one</Link>.</p>
              )}
            </fieldset>
            {busy ? (
              <button type="button" className="btn-secondary w-full" onClick={() => abort.current?.abort()}>
                <Spinner label="Writing" /> Stop
              </button>
            ) : (
              <button type="button" className="btn-primary w-full" disabled={!jd.trim() || !resume || !aiAllowed} onClick={() => void generate()}>
                Write email
              </button>
            )}
            {!jd.trim() && <p className="text-xs text-ink-500">Paste a job description to enable writing.</p>}
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
      )}
    </div>
  )
}
