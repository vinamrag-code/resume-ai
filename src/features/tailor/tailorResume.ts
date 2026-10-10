import { buildChanges, ProposedEditsSchema } from '@/lib/changes'
import type { Change } from '@/lib/changes'
import { analyzeBullet } from '@/lib/ats/bullets'
import { extractKeywords, matchKeywords } from '@/lib/ats/keywords'
import { generateJson, getLlm } from '@/lib/llm'
import { tailorPrompt } from '@/lib/prompts'
import { resumeForPrompt, resumeToText } from '@/lib/resume'
import type { Resume } from '@/types/resume'
import { verifyChanges } from './verifyChanges'

/**
 * Quality gate: drop bullet rewrites that make the bullet measurably worse (lower bullet-quality
 * score) unless they add job keywords that were missing. Summary and skills changes are kept.
 */
export function qualityFilter(changes: Change[], jobDescription: string, resumeText: string): Change[] {
  const keywords = extractKeywords(jobDescription)
  const covered = (text: string) => matchKeywords(keywords, text).matched.length
  return changes.filter((c) => {
    if (c.target.kind !== 'bullet') return true
    if (analyzeBullet(c.after).score >= analyzeBullet(c.before).score) return true
    return covered(`${resumeText}\n${c.after}`) > covered(resumeText)
  })
}

/** Ask the model for tailoring edits, fact-check and quality-filter them (nothing is applied). */
export async function proposeTailoring(resume: Resume, signal?: AbortSignal): Promise<Change[]> {
  const { title, company, description } = resume.target
  const text = resumeToText(resume.content)
  const proposed = await generateJson(
    getLlm(),
    tailorPrompt({ resumeJson: resumeForPrompt(resume.content), jobTitle: title, company, jobDescription: description }),
    ProposedEditsSchema,
    { signal, temperature: 0.2 },
  )
  const changes = qualityFilter(buildChanges(resume.content, proposed, text), description, text)
  return verifyChanges(changes, text, signal)
}
