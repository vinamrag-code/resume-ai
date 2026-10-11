import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorBanner, ProgressBar, TruthfulnessNote } from '@/components/ui'
import { AreaField, TextField } from '@/features/editor/controls'
import { JobUrlImport } from '@/features/workspace/JobUrlImport'
import { createTransformersEmbedder } from '@/lib/ats/embeddings'
import type { Embedder, EmbedProgress } from '@/lib/ats/embeddings'
import { assembleContent } from '@/lib/bank/assemble'
import { pickBullets, rankItems } from '@/lib/bank/retrieve'
import type { RankedItem } from '@/lib/bank/retrieve'
import { useBank } from '@/store/bank'
import { useResumes } from '@/store/resumes'
import { BANK_KIND_LABELS } from '@/types/bank'
import type { TargetJob } from '@/types/resume'

type Factory = (onProgress: (p: EmbedProgress) => void) => Embedder

/**
 * Build a resume for one job from the bank: embeddings rank every stored item against the job description,
 * the user adjusts the selection, and the resume is assembled from the chosen items' own text. No AI call is made.
 */
export function BuildPanel({ embedderFactory = createTransformersEmbedder, initialResumeId }: { embedderFactory?: Factory; initialResumeId?: string }) {
  const items = useBank((s) => s.items)
  const resumes = useResumes((s) => s.resumes)
  const navigate = useNavigate()
  const from = resumes.find((r) => r.id === initialResumeId)
  const [baseId, setBaseId] = useState(from?.id ?? resumes[0]?.id ?? '')
  const [job, setJob] = useState<TargetJob>(from?.target ?? { title: '', company: '', description: '', location: '', workType: 'unspecified' })
  const [count, setCount] = useState(6)
  const [perItem, setPerItem] = useState(4)
  const [ranked, setRanked] = useState<RankedItem[] | null>(null)
  const [keywordOnly, setKeywordOnly] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<{ label: string; progress: number } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const files = useRef(new Map<string, number>())
  const embedder = useRef<Embedder | undefined>(undefined)

  const base = resumes.find((r) => r.id === baseId)
  const patchJob = (p: Partial<TargetJob>) => {
    setJob((j) => ({ ...j, ...p }))
    setRanked(null)
  }

  const find = async () => {
    setError(null)
    files.current.clear()
    setBusy({ label: 'Loading the embedding model', progress: 0 })
    try {
      embedder.current ??= embedderFactory((p) => {
        if (p.status === 'progress' && p.file && typeof p.progress === 'number') {
          files.current.set(p.file, p.progress)
          const v = [...files.current.values()]
          setBusy({ label: 'Downloading the embedding model (one time)', progress: v.reduce((s, x) => s + x, 0) / v.length })
        }
      })
      const res = await rankItems(items, `${job.title}\n${job.description}`, embedder.current)
      setRanked(res.ranked)
      setKeywordOnly(res.keywordOnly)
      // Pre-select the best matches that are really relevant: at least one keyword or a clear semantic match.
      setPicked(new Set(res.ranked.filter((r) => r.score > 0.05).slice(0, count).map((r) => r.item.id)))
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  const chosen = useMemo(() => (ranked ?? []).filter((r) => picked.has(r.item.id)), [ranked, picked])

  const create = async () => {
    setError(null)
    try {
      const picks = await Promise.all(chosen.map(async (r) => ({ item: r.item, bullets: await pickBullets(r.item, job.description, perItem, keywordOnly ? undefined : embedder.current) })))
      const content = assembleContent(base?.content, picks, `${job.title}\n${job.description}`)
      const name = [job.title, job.company].filter((x) => x.trim()).join(' at ') || 'Resume from my bank'
      const r = useResumes.getState().create(name, content)
      useResumes.getState().setTarget(r.id, job)
      navigate(`/resume/${r.id}`)
    } catch (e) {
      setError(e)
    }
  }

  if (!items.length) return <p className="text-sm text-ink-500">Add some experience first (the “My experience” tab), then come back to build a resume from it.</p>

  const canFind = job.description.trim().length > 20 && !busy
  return (
    <div className="space-y-4">
      <TruthfulnessNote />
      <section className="card space-y-3" aria-label="Job">
        <JobUrlImport
          existingDescription={job.description}
          onImport={(j) => patchJob({ description: j.description, title: j.title || job.title, company: j.company || job.company, location: j.location || job.location, workType: j.workType && j.workType !== 'unspecified' ? j.workType : job.workType })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Job title" value={job.title} onChange={(v) => patchJob({ title: v })} />
          <TextField label="Company" value={job.company} onChange={(v) => patchJob({ company: v })} />
        </div>
        <AreaField label="Job description" rows={6} value={job.description} onChange={(v) => patchJob({ description: v })} />
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="build-base" className="label">
              Contact details and education from
            </label>
            <select id="build-base" className="input" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
              <option value="">(start blank)</option>
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="build-count" className="label">
              Items to include: {count}
            </label>
            <input id="build-count" type="range" min={1} max={12} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full" />
          </div>
          <div>
            <label htmlFor="build-bullets" className="label">
              Bullets per item: {perItem}
            </label>
            <input id="build-bullets" type="range" min={1} max={8} value={perItem} onChange={(e) => setPerItem(Number(e.target.value))} className="w-full" />
          </div>
        </div>
        <button type="button" className="btn-primary" onClick={() => void find()} disabled={!canFind}>
          Find the best matches
        </button>
        {busy && <ProgressBar value={busy.progress} label={busy.label} />}
      </section>
      {error != null && <ErrorBanner error={error} onDismiss={() => setError(null)} />}
      {ranked && (
        <section className="space-y-3" aria-label="Matches">
          {keywordOnly && <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">The embedding model could not be loaded (it needs a one-time download), so these matches use keywords only.</p>}
          <ul className="space-y-2">
            {ranked.map((r) => {
              const on = picked.has(r.item.id)
              const pct = Math.round(r.score * 100)
              return (
                <li key={r.item.id} className="card flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    id={`pick-${r.item.id}`}
                    checked={on}
                    onChange={() => setPicked((s) => { const n = new Set(s); if (on) n.delete(r.item.id); else n.add(r.item.id); return n })}
                  />
                  <label htmlFor={`pick-${r.item.id}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold">
                        {r.item.title}
                        {r.item.org && <span className="font-normal text-ink-500"> · {r.item.org}</span>}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-ink-500" aria-label={`Match ${pct} percent`}>{pct}%</span>
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800" aria-hidden="true">
                      <span className="block h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="mt-1 block text-xs text-ink-500">
                      {BANK_KIND_LABELS[r.item.kind]}
                      {r.matched.length > 0 && <> · matches: {r.matched.slice(0, 6).join(', ')}</>}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <div className="flex items-center gap-3">
            <button type="button" className="btn-primary" disabled={!chosen.length} onClick={() => void create()}>
              Create resume from {chosen.length} item{chosen.length === 1 ? '' : 's'}
            </button>
            <span className="text-xs text-ink-500">Opens as a new resume. Use Tailor or the Agent afterwards to polish the wording.</span>
          </div>
        </section>
      )}
    </div>
  )
}
