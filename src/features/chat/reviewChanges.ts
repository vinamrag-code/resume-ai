import { z } from 'zod'
import type { Change } from '@/lib/changes'
import { generateJson, getLlm } from '@/lib/llm'
import type { ChatMessage } from '@/lib/llm'
import { reviewPrompt } from '@/lib/prompts'
import type { Resume } from '@/types/resume'
import { parseEdits, visibleText } from './chatLogic'

const ReviewSchema = z.object({
  missing: z.array(z.string()),
  unrequested: z.array(z.number().int()),
})

export const UNREQUESTED_WARNING = 'You did not ask for this change. Apply it only if you want it.'

/** Same part of the resume (a second skills or format edit for the same thing is a duplicate, not new work). */
const sameTarget = (a: Change, b: Change) => JSON.stringify(a.target) === JSON.stringify(b.target)

export interface Reviewed {
  changes: Change[]
  /** Extra sentence(s) for the reply when a missed part of the request was added. */
  note: string
}

/**
 * Intent check on the finished reply: (1) when the model did only part of a multi-part request (e.g. removed the
 * section but did not add the skills), ask it once for just the missing edits and add them; (2) flag edits
 * the user did not ask for. The user still reviews every change, and if the check itself fails nothing is changed.
 */
export async function reviewChanges(opts: {
  request: string
  full: string
  changes: Change[]
  /** The messages the reply was generated from (system prompt + conversation). */
  messages: ChatMessage[]
  resume: Resume
  phase: 'clarify' | 'edit'
  userText: string
  signal?: AbortSignal
}): Promise<Reviewed> {
  const { request, full, changes, messages, resume, phase, userText, signal } = opts
  if (changes.length === 0) return { changes, note: '' }
  try {
    const items = changes.map((c, index) => ({ index, label: c.label, before: c.before.slice(0, 300), after: c.after.slice(0, 300) }))
    const { missing: asked, unrequested } = await generateJson(getLlm('checker'), reviewPrompt(request, visibleText(full), items), ReviewSchema, { signal, temperature: 0 })
    const missing = asked.map((m) => m.trim()).filter(Boolean)
    let out = changes.map((c, i) => (unrequested.includes(i) && !c.warnings.includes(UNREQUESTED_WARNING) ? { ...c, warnings: [...c.warnings, UNREQUESTED_WARNING] } : c))
    let note = ''
    if (missing.length) {
      const repair: ChatMessage[] = [
        ...messages,
        { role: 'assistant', content: full },
        {
          role: 'user',
          content: `You left out part of my request: ${missing.join('; ')}. Reply with one short sentence and an <edits> block that contains ONLY the edits for those missing parts. Do not repeat the edits you already gave and do not change anything else.`,
        },
      ]
      const reply = await getLlm().chat(repair, { signal, temperature: 0.2 })
      const extra = parseEdits(reply, resume, phase, userText).filter((c) => !out.some((o) => sameTarget(o, c)))
      if (extra.length) {
        out = [...out, ...extra]
        note = visibleText(reply)
      }
    }
    return { changes: out, note }
  } catch {
    return { changes, note: '' }
  }
}
