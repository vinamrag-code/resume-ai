import { useState } from 'react'
import { ErrorBanner } from '@/components/ui'
import { downloadBlob, printToPdf, safeFilename } from '@/lib/export/download'
import { resumeToDocxBlob } from '@/lib/export/docx'
import type { Resume } from '@/types/resume'

export function ExportBar({ resume, assistantOpen = false, onEditWithAi }: { resume: Resume; assistantOpen?: boolean; onEditWithAi: () => void }) {
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const onDocx = async () => {
    setBusy(true)
    setError(null)
    try {
      downloadBlob(await resumeToDocxBlob(resume.content, resume.style, resume.templateId), safeFilename(resume.name, 'docx'))
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="no-print space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn bg-spark-500 text-ink-950 shadow-sm hover:bg-spark-400" aria-expanded={assistantOpen} onClick={onEditWithAi}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z" />
          </svg>
          Edit with AI
        </button>
        <button type="button" className="btn-primary" onClick={printToPdf}>
          Export PDF
        </button>
        <button type="button" className="btn-secondary" onClick={() => void onDocx()} disabled={busy}>
          {busy ? 'Building DOCX...' : 'Export DOCX'}
        </button>
        <span className="text-xs text-ink-500 dark:text-ink-400">PDF opens your browser&apos;s print dialog: choose &ldquo;Save as PDF&rdquo; and turn off headers and footers.</span>
      </div>
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
    </div>
  )
}
