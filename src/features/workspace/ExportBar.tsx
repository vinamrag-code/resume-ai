import { useState } from 'react'
import { ErrorBanner } from '@/components/ui'
import { downloadBlob, printToPdf, safeFilename } from '@/lib/export/download'
import { resumeToDocxBlob } from '@/lib/export/docx'
import type { Resume } from '@/types/resume'

export function ExportBar({ resume }: { resume: Resume }) {
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
