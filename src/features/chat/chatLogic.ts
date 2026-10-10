import { buildChanges, ProposedEditsSchema } from '@/lib/changes'
import type { Change } from '@/lib/changes'
import { extractJson } from '@/lib/llm'
import { EDITS_CLOSE, EDITS_OPEN } from '@/lib/prompts'
import { resumeToText } from '@/lib/resume'
import type { ResumeContent } from '@/types/resume'

/** Text to show the user: everything before the edits block (which may still be streaming in). */
export function visibleText(raw: string): string {
  const i = raw.indexOf(EDITS_OPEN)
  return (i === -1 ? raw : raw.slice(0, i)).trim()
}

/** Extract machine-readable edit suggestions from a finished assistant reply. */
export function parseEdits(raw: string, content: ResumeContent): Change[] {
  const start = raw.indexOf(EDITS_OPEN)
  if (start === -1) return []
  const end = raw.indexOf(EDITS_CLOSE, start)
  const body = raw.slice(start + EDITS_OPEN.length, end === -1 ? undefined : end)
  try {
    const parsed = ProposedEditsSchema.safeParse(JSON.parse(extractJson(body)))
    return parsed.success ? buildChanges(content, parsed.data, resumeToText(content)) : []
  } catch {
    return []
  }
}
