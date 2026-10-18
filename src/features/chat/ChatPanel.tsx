import { useEffect, useRef, useState } from 'react'
import { SignInNotice } from '@/components/SignInNotice'
import { ErrorBanner, Spinner, TruthfulnessNote } from '@/components/ui'
import { useAiAccess } from '@/lib/auth/useAiAccess'
import { applyChanges, currentFormat, formatPatch, isStaleFor } from '@/lib/changes'
import type { Change } from '@/lib/changes'
import { getLlm } from '@/lib/llm'
import type { ChatMessage } from '@/lib/llm'
import { chatSystemPrompt } from '@/lib/prompts'
import { makeId } from '@/lib/id'
import { resumeForPrompt, resumeToText } from '@/lib/resume'
import { useResumes } from '@/store/resumes'
import type { Resume } from '@/types/resume'
import { DiffView } from '@/features/tailor/DiffView'
import { verifyChanges } from '@/features/tailor/verifyChanges'
import { fallbackText, isPreparingEdits, parseEdits, visibleText } from './chatLogic'
import { appliedSummary, buildHistory } from './history'
import { selectTurns, useChats } from '@/store/chats'
import type { ChatTurn } from '@/types/chat'

const NO_TURNS: ChatTurn[] = []
const STARTERS = ['Help me improve my experience section', 'Review my summary', 'Make my skills fit the target job', 'Strengthen my project bullets']

function Suggestion({ change, resume, onApplied }: { change: Change; resume: Resume; onApplied: () => void }) {
  const [text, setText] = useState(change.after)
  const stale = change.status !== 'accepted' && isStaleFor(resume, change)
  const edited = text !== change.after
  const apply = () => {
    const finalChange: Change = {
      ...change,
      after: text.trim(),
      afterSkills: change.target.kind === 'skills' ? text.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      status: 'accepted',
    }
    const patch = formatPatch(finalChange)
    if (patch) {
      if (patch.templateId) useResumes.getState().setTemplate(resume.id, patch.templateId)
      if (patch.style) useResumes.getState().setStyle(resume.id, patch.style)
    } else {
      useResumes.getState().updateContent(resume.id, (c) => applyChanges(c, [finalChange]).content)
    }
    onApplied()
  }
  const id = `suggestion-${change.id}`
  return (
    <li className="card space-y-2 bg-ink-50 dark:bg-ink-800">
      <h4 className="text-sm font-semibold">{change.label}</h4>
      <DiffView before={change.before || '(empty)'} after={change.target.kind === 'bullet-remove' ? '(removed)' : text} />
      {change.status !== 'accepted' && !stale && change.target.kind !== 'format' && change.target.kind !== 'bullet-remove' && (
        <div>
          <label htmlFor={id} className="label">
            Edit before applying
          </label>
          <textarea id={id} rows={2} className="input" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      )}
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
        <button type="button" className="btn-primary btn-sm" disabled={!text.trim()} onClick={apply}>
          {edited ? 'Apply my edited version' : 'Apply to resume'}
        </button>
      )}
    </li>
  )
}

export function ChatPanel({ resume }: { resume: Resume }) {
  const turns = useChats((s) => selectTurns(s.chats, resume.id)) ?? NO_TURNS
  const setTurns = useChats((s) => s.setTurns)
  const clear = useChats((s) => s.clear)
  const aiAllowed = useAiAccess()
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
    // The model gets a clean, plain-text copy of the conversation (not provider-specific), so any model can
    // continue it, including after a fallback or after the admin switches the default model.
    const memory = buildHistory(history)
    const applied = appliedSummary(turns)
    const system = chatSystemPrompt(
      { resumeJson: resumeForPrompt(resume.content), formatJson: JSON.stringify(currentFormat(resume)), jobTitle: resume.target.title, company: resume.target.company, jobDescription: resume.target.description },
      phase,
    )
    const notes = [
      memory.truncated ? 'Earlier messages in this conversation were left out to save space; the resume above is always current.' : '',
      applied ? `Edits the user has already applied in this conversation (do not suggest them again): ${applied}.` : '',
    ].filter(Boolean)
    const messages: ChatMessage[] = [notes.length ? { ...system, content: `${system.content}\n\nCONVERSATION MEMORY:\n${notes.join('\n')}` } : system, ...memory.messages]
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
      // On the first turn only layout changes and explicit fixes are accepted; content rewrites wait for answers.
      const parsed = parseEdits(full, resume, phase, history.filter((t) => t.role === 'user').map((t) => t.content).join('\n'))
      const changes = await verifyChanges(parsed, resumeToText(resume.content), abort.current.signal)
      // Never leave the user with an empty or JSON-only reply.
      const shown = visibleText(full) ? full : `${fallbackText(changes.length > 0)}`
      setTurns(resume.id, (ts) => ts.map((t) => (t.id === assistantId ? { ...t, content: shown, changes } : t)))
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
      <SignInNotice feature="the Agent" />
      <section className="card flex max-h-[70vh] min-h-80 flex-col gap-3" aria-label="Resume agent chat">
        <div className="flex-1 space-y-3 overflow-y-auto" role="log" aria-live="polite">
          {turns.length === 0 && (
            <div className="space-y-2 text-sm">
              <p>
                I&apos;m your resume counselor. Tell me which section to work on and I&apos;ll ask a couple of questions first, then suggest edits you can apply with one click.
                {resume.target.description.trim() ? ' I can see your target job.' : ' Add a target job in the Target job tab for sharper advice.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <button key={s} type="button" className="btn-secondary btn-sm" disabled={busy || !aiAllowed} onClick={() => void send(s)} title={aiAllowed ? undefined : 'Sign in to use the Agent'}>
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
                {t.role === 'assistant' ? visibleText(t.content) || (busy || isPreparingEdits(t.content) ? 'Preparing suggestions…' : '') : t.content}
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
          <input id="chat-input" className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder={aiAllowed ? 'Ask about a section or answer the questions…' : 'Sign in to chat with the Agent'} disabled={busy || !aiAllowed} />
          {busy ? (
            <button type="button" className="btn-secondary" onClick={() => abort.current?.abort()}>
              <Spinner label="Generating" /> Stop
            </button>
          ) : (
            <button type="submit" className="btn-primary" disabled={!input.trim() || !aiAllowed}>
              Send
            </button>
          )}
        </form>
        {turns.length > 0 && !busy && (
          <button type="button" className="btn-ghost btn-sm self-start" onClick={() => clear(resume.id)}>
            Clear conversation
          </button>
        )}
      </section>
    </div>
  )
}
