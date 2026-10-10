import { generateJson, getLlm } from '@/lib/llm'
import { parseResumePrompt } from '@/lib/prompts'
import { hydrateParsed } from '@/lib/resume'
import { ParsedResumeSchema } from '@/types/resume'
import type { ResumeContent } from '@/types/resume'

/** LLM-assisted conversion of raw resume text into validated, structured content. */
export async function parseResumeText(text: string, signal?: AbortSignal): Promise<ResumeContent> {
  const parsed = await generateJson(getLlm(), parseResumePrompt(text), ParsedResumeSchema, { signal, temperature: 0 })
  return hydrateParsed(parsed)
}
