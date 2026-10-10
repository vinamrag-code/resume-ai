import { diffWords } from '@/lib/diff'

/** Before/after view: removed words struck through on the left, added words highlighted on the right. */
export function DiffView({ before, after }: { before: string; after: string }) {
  const segs = diffWords(before, after)
  return (
    <div className="grid gap-2 text-sm sm:grid-cols-2">
      <div>
        <p className="label">Before</p>
        <p className="rounded-lg bg-ink-50 p-2 dark:bg-ink-800" data-testid="diff-before">
          {segs
            .filter((s) => s.type !== 'add')
            .map((s, i) =>
              s.type === 'del' ? (
                <del key={i} className="bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200">
                  {s.text}
                </del>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
        </p>
      </div>
      <div>
        <p className="label">After</p>
        <p className="rounded-lg bg-ink-50 p-2 dark:bg-ink-800" data-testid="diff-after">
          {segs
            .filter((s) => s.type !== 'del')
            .map((s, i) =>
              s.type === 'add' ? (
                <ins key={i} className="bg-brand-100 text-brand-900 no-underline dark:bg-brand-900/60 dark:text-brand-50">
                  {s.text}
                </ins>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
        </p>
      </div>
    </div>
  )
}
