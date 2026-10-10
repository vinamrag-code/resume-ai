import { useEffect, useRef, useState } from 'react'
import { ErrorBanner, Spinner, TruthfulnessNote } from '@/components/ui'
import { applyChanges, isStale } from '@/lib/changes'
import type { Change } from '@/lib/changes'
import { getLlm } from '@/lib/llm'
import type { ChatMessage } from '@/lib/llm'
import { chatSystemPrompt } from '@/lib/prompts'
import { makeId } from '@/lib/id'
import { resumeForPrompt } from '@/lib/resume'
import { useResumes } from '@/store/resumes'
import type { Resume } from '@/types/resume'
import { DiffView } from '@/features/tailor/DiffView'
import { parseEdits, visibleText } from './chatLogic'
import { useChats } from './chatStore'
import type { ChatTurn } from './chatStore'

const NO_TURNS: ChatTurn[] = []
const STARTERS = ['Help me improve my experience section', 'Review my summary', 'Make my skills fit the target job', 'Strengthen my project bullets']

function Suggestion({ change, resume, onApplied }: { change: Change; resume: Resume; onApplied: () => void }) {
  const stale = change.status !== 'accepted' && isStale(resume.content, change)
  const apply = () => {
    useResumes.getState().updateContent(resume.id, (c) => applyChanges(c, [{ ...change, status: 'accepted' }]).content)
    onApplied()
  }
  return (
    <li className="card space-y-2 bg-ink-50 dark:bg-ink-800">
      <h4 className="text-sm font-semibold">{change.label}</h4>
      <DiffView before={change.before} after={change.after} />
      {change.reason && <p className="text-xs text-ink-500 dark:text-ink-400">Why: {change.reason}</p>}
      {change.warnings.map((w) => (
        <p key={w} role="note" className="rounded bg-spark-400/20 p-1.5 text-xs">
          ⚠ {w}
        </p>
      ))}
      {change.status === 'accepted' ? (
        <p className="text-sm font-medium text-brand-700 dark:text-brand-300">Applied ✓</p>
      ) : stale ? (
        <p className="text-xs text-ink-500">This part of your resume changed since the suggestion, so it can no longer be applied.</p>
      ) : (
        <button type="button" className="btn-primary btn-sm" onClick={apply}>
          Apply to resume
        </button>
      )}
    </li>
  )
}

export function ChatPanel({ resume }: { resume: Resume }) {
  const turns = useChats((s) => s.byResume[resume.id]) ?? NO_TURNS
  const setTurns = useChats((s) => s.set)
  const clear = useChats((s) => s.clear)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const abort = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [turns])

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || busy) return
    setInput('')
    setError(null)
    setBusy(true)
    const assistantId = makeId()
    const history: ChatTurn[] = [...turns, { id: makeId(), role: 'user', content, changes: [] }]
    const phase = turns.some((t) => t.role === 'assistant') ? 'edit' : 'clarify'
    setTurns(resume.id, () => [...history, { id: assistantId, role: 'assistant', content: '', changes: [] }])
    const messages: ChatMessage[] = [
      chatSystemPrompt(
        { resumeJson: resumeForPrompt(resume.content), jobTitle: resume.target.title, company: resume.target.company, jobDescription: resume.target.description },
        phase,
      ),
      ...history.map((t) => ({ role: t.role, content: t.content })),
    ]
    abort.current = new AbortController()
    let full = ''
    try {
      full = await getLlm().stream(
        messages,
        (token) => {
          full += token
          setTurns(resume.id, (ts) => ts.map((t) => (t.id === assistantId ? { ...t, content: t.content + token } : t)))
        },
        { signal: abort.current.signal, temperature: 0.4 },
      )
      // Clarifying turns never carry edits, even if the model ignored the instruction.
      const changes = phase === 'edit' ? parseEdits(full, resume.content) : []
      setTurns(resume.id, (ts) => ts.map((t) => (t.id === assistantId ? { ...t, content: full, changes } : t)))
    } catch (err) {
      setError(err)
      setTurns(resume.id, (ts) => ts.filter((t) => t.id !== assistantId || t.content.trim() !== ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <TruthfulnessNote />
      <section className="card flex max-h-[70vh] min-h-80 flex-col gap-3" aria-label="Resume agent chat">
        <div className="flex-1 space-y-3 overflow-y-auto" role="log" aria-live="polite">
          {turns.length === 0 && (
            <div className="space-y-2 text-sm">
              <p>
                I&apos;m your resume counselor. Tell me which section to work on and I&apos;ll ask a couple of questions first, then suggest edits you can apply with one click.
                {resume.target.description.trim() ? ' I can see your target job.' : ' Add a target job above for sharper advice.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <button key={s} type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t) => (
            <div key={t.id} className={t.role === 'user' ? 'text-right' : ''}>
              <div className={`inline-block max-w-full whitespace-pre-wrap rounded-2xl px-3 py-2 text-left text-sm ${t.role === 'user' ? 'bg-brand-600 text-white dark:bg-brand-500 dark:text-ink-950' : 'bg-ink-100 dark:bg-ink-800'}`}>
                <span className="sr-only">{t.role === 'user' ? 'You: ' : 'Counselor: '}</span>
                {t.role === 'assistant' ? visibleText(t.content) || (busy ? '…' : '') : t.content}
              </div>
              {t.changes.length > 0 && (
                <ul className="mt-2 space-y-2 text-left" aria-label="Suggested edits">
                  {t.changes.map((c) => (
                    <Suggestion
                      key={c.id}
                      change={c}
                      resume={resume}
                      onApplied={() => setTurns(resume.id, (ts) => ts.map((x) => (x.id === t.id ? { ...x, changes: x.changes.map((y) => (y.id === c.id ? { ...y, status: 'accepted' } : y)) } : x)))}
                    />
                  ))}
                </ul>
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void send(input)
          }}
        >
          <label htmlFor="chat-input" className="sr-only">
            Message the resume counselor
          </label>
          <input id="chat-input" className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about a section or answer the questions…" disabled={busy} />
          {busy ? (
            <button type="button" className="btn-secondary" onClick={() => abort.current?.abort()}>
              <Spinner label="Generating" /> Stop
            </button>
          ) : (
            <button type="submit" className="btn-primary" disabled={!input.trim()}>
              Send
            </button>
          )}
        </form>
        {turns.length > 0 && !busy && (
          <button type="button" className="btn-ghost btn-sm self-start" onClick={() => clear(resume.id)}>
            New conversation
          </button>
        )}
      </section>
    </div>
  )
}
