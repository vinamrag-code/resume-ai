import { IconChevronDown } from '@tabler/icons-react'
import { useEffect, useId, useRef, useState } from 'react'
import { ErrorBanner } from '@/components/ui'
import { downloadBlob, printToPdf, safeFilename } from '@/lib/export/download'
import { resumeToDocxBlob } from '@/lib/export/docx'
import type { Resume } from '@/types/resume'

/** One Export button; its dropdown offers PDF (the browser's print dialog) or DOCX. */
export function ExportBar({ resume }: { resume: Resume }) {
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        root.current?.querySelector('button')?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onPdf = () => {
    setOpen(false)
    printToPdf()
  }
  const onDocx = async () => {
    setOpen(false)
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
  const item = 'flex w-full items-center rounded-lg px-3 py-2 text-left text-sm hover:bg-ink-100 dark:hover:bg-ink-800'
  return (
    <div ref={root} className="no-print relative">
      <button
        type="button"
        className="btn-primary btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
      >
        {busy ? 'Building DOCX...' : 'Export'}
        <IconChevronDown className="h-4 w-4" stroke={2} aria-hidden="true" />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label="Export menu" className="absolute right-0 top-full z-40 mt-1 w-64 rounded-xl border border-ink-200 bg-white p-1.5 shadow-lg dark:border-ink-700 dark:bg-ink-900">
          <button type="button" role="menuitem" className={item} onClick={onPdf}>
            Export to PDF
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => void onDocx()}>
            Export to DOCX
          </button>
          <p className="px-3 py-1.5 text-xs text-ink-500 dark:text-ink-400">PDF opens your browser&apos;s print dialog: choose &ldquo;Save as PDF&rdquo; and turn off headers and footers.</p>
        </div>
      )}
      {error != null && (
        <div className="absolute right-0 top-full z-30 mt-1 w-80">
          <ErrorBanner error={error} onDismiss={() => setError(null)} />
        </div>
      )}
    </div>
  )
}
