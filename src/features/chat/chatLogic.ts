import { buildChanges, currentFormat, ProposedEditsSchema } from '@/lib/changes'
import type { Change } from '@/lib/changes'
import { extractJson } from '@/lib/llm'
import { EDITS_CLOSE, EDITS_OPEN } from '@/lib/prompts'
import { resumeToText } from '@/lib/resume'
import type { Resume } from '@/types/resume'

export interface ParsedReply {
  /** Plain text for the user: never contains JSON. */
  text: string
  /** The raw edits JSON if the reply carried one (inside tags, a code fence, or as the whole reply). */
  editsJson: string | null
}

const FENCE = /```(?:json)?\s*([\s\S]*?)```/i

function looksLikeJson(s: string): boolean {
  const t = s.trim()
  return (t.startsWith('{') || t.startsWith('[')) && t.length > 1
}

/**
 * Split a reply into friendly text and an edits payload. Handles the tagged format and also the
 * common failures: JSON in a code fence, or a reply that is nothing but JSON. Raw JSON is never shown.
 */
export function splitReply(raw: string): ParsedReply {
  const open = raw.indexOf(EDITS_OPEN)
  if (open !== -1) {
    const close = raw.indexOf(EDITS_CLOSE, open)
    const json = raw.slice(open + EDITS_OPEN.length, close === -1 ? undefined : close)
    const after = close === -1 ? '' : raw.slice(close + EDITS_CLOSE.length)
    return { text: `${raw.slice(0, open)}${after}`.trim(), editsJson: json.trim() }
  }
  const fence = raw.match(FENCE)
  if (fence && looksLikeJson(fence[1] ?? '')) {
    return { text: raw.replace(FENCE, '').trim(), editsJson: (fence[1] ?? '').trim() }
  }
  if (looksLikeJson(raw)) return { text: '', editsJson: raw.trim() }
  // A still-streaming, unterminated fence or JSON tail: hide it from the user.
  const openFence = raw.indexOf('```')
  if (openFence !== -1) return { text: raw.slice(0, openFence).trim(), editsJson: null }
  return { text: raw.trim(), editsJson: null }
}

/** Text to show while/after streaming. Never JSON. */
export function visibleText(raw: string): string {
  return splitReply(raw).text
}

/** True while the reply is (or ends in) machine-readable content the user should not see. */
export function isPreparingEdits(raw: string): boolean {
  const { text, editsJson } = splitReply(raw)
  return editsJson !== null || (raw.trim() !== '' && text === '' && (raw.includes('{') || raw.includes('```')))
}

/**
 * Change kinds allowed on the first turn, when the app expects clarifying questions: layout changes,
 * explicit field fixes and removals. Content rewrites need the user's answers first.
 */
function allowedOnFirstTurn(c: Change): boolean {
  return c.target.kind === 'format' || c.target.kind === 'field' || c.target.kind === 'bullet-remove'
}

/** Turn a finished reply into reviewable changes. */
export function parseEdits(raw: string, resume: Resume, phase: 'clarify' | 'edit' = 'edit'): Change[] {
  const { editsJson } = splitReply(raw)
  if (!editsJson) return []
  try {
    const parsed = ProposedEditsSchema.safeParse(JSON.parse(extractJson(editsJson)))
    if (!parsed.success) return []
    const all = buildChanges(resume.content, parsed.data, resumeToText(resume.content), currentFormat(resume))
    return phase === 'clarify' ? all.filter(allowedOnFirstTurn) : all
  } catch {
    return []
  }
}

/** What to say when a reply contained nothing the user can read. */
export function fallbackText(hadChanges: boolean): string {
  return hadChanges
    ? 'Here are my suggested changes. Review each one and apply the ones you like.'
    : "I couldn't turn that into a change I can apply. Could you say it a different way, for example \"center my name and contact info\" or \"make the bullet indent smaller\"?"
}
