import { generateJson, getLlm } from '@/lib/llm'
import type { Change } from '@/lib/changes'
import { verifyPrompt } from '@/lib/prompts'
import { z } from 'zod'

const VerifySchema = z.object({
  results: z.array(z.object({ index: z.number().int(), unsupported: z.array(z.string()).nullish() })),
})

/**
 * Second AI pass that fact-checks rewrites against the original resume. Unsupported claims become
 * warnings on the change. If the check itself fails, changes are returned untouched (never blocks).
 */
export async function verifyChanges(changes: Change[], resumeText: string, signal?: AbortSignal): Promise<Change[]> {
  if (changes.length === 0) return changes
  try {
    // Skills are either a reorder or something the user named, so there is nothing for the checker to find.
    const items = changes.flatMap((c, index) => (c.target.kind === 'skills' ? [] : [{ index, before: c.before, after: c.after }]))
    if (items.length === 0) return changes
    const { results } = await generateJson(getLlm('checker'), verifyPrompt(resumeText, items), VerifySchema, { signal, temperature: 0 })
    return changes.map((c, index) => {
      const claims = (results.find((r) => r.index === index)?.unsupported ?? []).filter((s) => s.trim())
      if (!claims.length) return c
      return { ...c, warnings: [...c.warnings, `AI fact-check: not supported by your resume: ${claims.map((x) => `"${x}"`).join(', ')}`] }
    })
  } catch {
    return changes
  }
}
