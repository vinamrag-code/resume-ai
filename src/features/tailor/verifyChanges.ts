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
    const items = changes.map((c, index) => ({ index, before: c.before, after: c.after }))
    const { results } = await generateJson(getLlm(), verifyPrompt(resumeText, items), VerifySchema, { signal, temperature: 0 })
    return changes.map((c, index) => {
      const claims = (results.find((r) => r.index === index)?.unsupported ?? []).filter((s) => s.trim())
      if (!claims.length) return c
      return { ...c, warnings: [...c.warnings, `AI fact-check: not supported by your resume: ${claims.map((x) => `"${x}"`).join(', ')}`] }
    })
  } catch {
    return changes
  }
}
