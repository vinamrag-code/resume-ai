import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SignInNotice } from '@/components/SignInNotice'
import { ErrorBanner, Spinner } from '@/components/ui'
import { useAiAccess } from '@/lib/auth/useAiAccess'
import { extractText } from '@/lib/extract'
import { forgetImportedFile, indexImportedFile } from '@/lib/rag/indexer'
import { getEmbeddings } from '@/lib/rag/retrieve'
import { useResumes } from '@/store/resumes'
import { parseResumeText } from './parseResume'

type Phase = 'idle' | 'extracting' | 'parsing'

export function ImportPage() {
  const navigate = useNavigate()
  const create = useResumes((s) => s.create)
  const aiAllowed = useAiAccess()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<unknown>(null)
  const abort = useRef<AbortController | null>(null)
  const indexedFile = useRef('')
  const busy = phase !== 'idle'

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setPhase('extracting')
    try {
      const extracted = await extractText(file)
      setText(extracted)
      setFileName(file.name.replace(/\.[^.]+$/, ''))
      // Remember the file so later answers can draw on it. Best effort: never blocks or fails the import.
      indexedFile.current = file.name
      void indexImportedFile(file.name, extracted, getEmbeddings()).catch(() => undefined)
    } catch (err) {
      setError(err)
    } finally {
      setPhase('idle')
    }
  }

  const onParse = async () => {
    setError(null)
    setPhase('parsing')
    abort.current = new AbortController()
    try {
      const content = await parseResumeText(text, abort.current.signal)
      const r = create(fileName || content.contact.name || 'Imported resume', content)
      // The new resume holds this file's content in structured form, so the raw copy would only duplicate it.
      if (indexedFile.current) void forgetImportedFile(indexedFile.current).catch(() => undefined)
      navigate(`/resume/${r.id}`)
    } catch (err) {
      setError(err)
      setPhase('idle')
    }
  }

  const onScratch = () => {
    const r = create('Untitled resume')
    navigate(`/resume/${r.id}`)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Import a resume</h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          Upload a PDF or DOCX, or paste text. Text is extracted in your browser, then your local AI turns it into editable sections.
        </p>
      </div>
      <SignInNotice feature="AI resume parsing" />
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <div className="card space-y-4">
        <div>
          <label htmlFor="resume-file" className="label">
            Upload PDF or DOCX
          </label>
          <input
            id="resume-file"
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={busy}
            onChange={(e) => void onFile(e.target.files?.[0])}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
          />
          {phase === 'extracting' && (
            <p className="mt-2 flex items-center gap-2 text-sm">
              <Spinner label="Extracting text" /> Extracting text...
            </p>
          )}
        </div>
        <div>
          <label htmlFor="resume-text" className="label">
            Or paste resume text (you can also edit extracted text before parsing)
          </label>
          <textarea
            id="resume-text"
            className="input min-h-64 font-mono text-xs"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the full text of your resume here"
            disabled={busy}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" disabled={busy || !aiAllowed || text.trim().length < 30} onClick={() => void onParse()}>
            {phase === 'parsing' ? (
              <>
                <Spinner label="Parsing" /> Parsing with AI...
              </>
            ) : (
              'Parse with AI'
            )}
          </button>
          {phase === 'parsing' && (
            <button type="button" className="btn-ghost" onClick={() => abort.current?.abort()}>
              Cancel
            </button>
          )}
          <span className="text-sm text-ink-500">or</span>
          <button type="button" className="btn-secondary" disabled={busy} onClick={onScratch}>
            Start from scratch
          </button>
        </div>
      </div>
    </div>
  )
}

