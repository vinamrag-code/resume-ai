import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ResumePreview } from '@/features/templates/ResumePreview'
import type { Resume } from '@/types/resume'

/** A4 at 96 dpi, in CSS pixels. */
const PAGE_W = (210 / 25.4) * 96
const PAGE_H = (297 / 25.4) * 96
const MIN_ZOOM = 0.25
const MAX_ZOOM = 2
const STEP = 0.1

const clamp = (n: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, n))

function useSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

/** The resume preview with zoom controls. It opens fitted so one whole page is visible; zooming in scrolls inside the pane. */
export function PreviewPane({ resume }: { resume: Resume }) {
  const viewport = useRef<HTMLDivElement>(null)
  const paper = useRef<HTMLDivElement>(null)
  const { w, h } = useSize(viewport)
  const [zoom, setZoom] = useState<number | null>(null)
  const [paperH, setPaperH] = useState(PAGE_H)

  useEffect(() => {
    const el = paper.current
    if (!el) return
    const read = () => setPaperH(el.offsetHeight || PAGE_H)
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pad = 32
  const fit = w > 0 && h > 0 ? clamp(Math.min((w - pad) / PAGE_W, (h - pad) / PAGE_H, 1)) : 1
  const scale = zoom ?? fit
  const set = (n: number) => setZoom(Math.round(clamp(n) * 100) / 100)
  const btn = 'btn-secondary btn-sm'
  return (
    <div className="flex min-h-[32rem] flex-col gap-2 lg:h-full lg:min-h-0">
      <div className="no-print flex shrink-0 items-center justify-end gap-1.5" role="group" aria-label="Preview zoom">
        <button type="button" className={btn} aria-label="Zoom out" disabled={scale <= MIN_ZOOM} onClick={() => set(scale - STEP)}>
          −
        </button>
        <span className="min-w-12 text-center text-xs tabular-nums text-ink-600 dark:text-ink-300" role="status" aria-label="Zoom level">
          {Math.round(scale * 100)}%
        </span>
        <button type="button" className={btn} aria-label="Zoom in" disabled={scale >= MAX_ZOOM} onClick={() => set(scale + STEP)}>
          +
        </button>
        <button type="button" className={btn} onClick={() => setZoom(null)} aria-pressed={zoom === null}>
          Fit page
        </button>
      </div>
      <div ref={viewport} className="no-scrollbar min-h-0 flex-1 overflow-auto rounded-xl bg-ink-100 p-4 dark:bg-ink-800 print:overflow-visible print:bg-transparent print:p-0">
        <div className="preview-zoom mx-auto" style={{ width: PAGE_W * scale, height: paperH * scale }}>
          <div ref={paper} className="preview-zoom" style={{ width: PAGE_W, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <ResumePreview resume={resume} />
          </div>
        </div>
      </div>
    </div>
  )
}
