import { buildChanges, ProposedEditsSchema } from '@/lib/changes'
import type { Change } from '@/lib/changes'
import { generateJson, getLlm } from '@/lib/llm'
import { tailorPrompt } from '@/lib/prompts'
import { resumeForPrompt, resumeToText } from '@/lib/resume'
import type { Resume } from '@/types/resume'

/** Ask the model for tailoring edits and turn them into reviewable changes (nothing is applied). */
export async function proposeTailoring(resume: Resume, signal?: AbortSignal): Promise<Change[]> {
  const { title, company, description } = resume.target
  const proposed = await generateJson(
    getLlm(),
    tailorPrompt({ resumeJson: resumeForPrompt(resume.content), jobTitle: title, company, jobDescription: description }),
    ProposedEditsSchema,
    { signal, temperature: 0.2 },
  )
  return buildChanges(resume.content, proposed, resumeToText(resume.content))
}
