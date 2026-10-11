import { z } from 'zod'
import type { Embedder } from '@/lib/ats/embeddings'
import { findNewTerms } from '@/lib/ats/guards'
import { generateJson, getLlm } from '@/lib/llm'
import { bankBuildPrompt } from '@/lib/prompts'
import type { LlmClient } from '@/lib/llm'
import type { BankItem } from '@/types/bank'
import type { ResumeContent } from '@/types/resume'
import { assembleContent } from './assemble'
import type { Pick } from './assemble'
import { pickBullets } from './retrieve'

const ResultSchema = z.object({
  summary: z.string().nullable().optional(),
  items: z.array(z.object({ id: z.string(), bullets: z.array(z.object({ from: z.number().int().min(0), text: z.string() })) })).default([]),
  skills: z.array(z.string()).nullable().optional(),
})

export interface AiBuildReport {
  /** Bullets the AI reworded and that passed the checks. */
  reworded: number
  /** Bullets where the original text was kept instead (the rewrite added something not in the bank). */
  keptOriginal: number
  summary: 'ai' | 'kept'
  notes: string[]
}

const numbers = (s: string) => s.match(/\d[\d,.]*%?/g)?.map((n) => n.replace(/[,.]$/, '')) ?? []

/** Terms or numbers in `after` that the source text does not contain (empty means the rewrite stays within the source). */
export function unsupported(after: string, source: string): string[] {
  const have = new Set(numbers(source))
  return [...findNewTerms(after, source), ...numbers(after).filter((n) => !have.has(n))]
}

/**
 * Ask the model to write a resume from the chosen bank items. Every rewritten bullet is checked against the bullet it
 * came from (plus the item's title and skills): anything that adds a name, tool or number falls back to the original
 * text, so the AI can reword and prioritise but cannot invent. Items the AI omits get the no-AI treatment.
 */
export async function buildWithAi(opts: {
  base: ResumeContent | undefined
  items: BankItem[]
  jobTitle: string
  company: string
  jobDescription: string
  perItem: number
  embedder?: Embedder
  llm?: LlmClient
  signal?: AbortSignal
}): Promise<{ content: ResumeContent; report: AiBuildReport }> {
  const { base, items, perItem, jobDescription } = opts
  const cap = (xs: string[]) => xs.slice(0, 24)
  const result = await generateJson(
    opts.llm ?? getLlm(),
    bankBuildPrompt({
      jobTitle: opts.jobTitle,
      company: opts.company,
      jobDescription,
      perItem,
      currentSummary: base?.summary ?? '',
      items: items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, org: i.org, bullets: cap(i.bullets), skills: i.skills })),
    }),
    ResultSchema,
    { signal: opts.signal, temperature: 0.2 },
  )

  const report: AiBuildReport = { reworded: 0, keptOriginal: 0, summary: 'kept', notes: [] }
  const picks: Pick[] = []
  for (const item of items) {
    const answer = result.items.find((x) => x.id === item.id)
    const context = `${item.title} ${item.org} ${item.skills.join(' ')}`
    const out: string[] = []
    for (const b of answer?.bullets ?? []) {
      const source = item.bullets[b.from]
      if (!source || !b.text.trim() || out.length >= perItem) continue
      const extra = unsupported(b.text, `${source} ${context}`)
      if (extra.length) {
        report.keptOriginal++
        report.notes.push(`Kept the original wording of a bullet in "${item.title}": the rewrite added ${extra.slice(0, 3).join(', ')}.`)
        if (!out.includes(source)) out.push(source)
      } else {
        report.reworded++
        out.push(b.text.trim())
      }
    }
    if (!out.length) {
      out.push(...(await pickBullets(item, jobDescription, perItem, opts.embedder)))
      if (!answer) report.notes.push(`The AI skipped "${item.title}", so its best bullets were picked without AI.`)
    }
    picks.push({ item, bullets: out })
  }

  const content = assembleContent(base, picks, `${opts.jobTitle}\n${jobDescription}`)

  // Summary: accepted only if it stays within the bank text and the current summary.
  const allText = `${base?.summary ?? ''} ${items.map((i) => `${i.title} ${i.org} ${i.skills.join(' ')} ${i.bullets.join(' ')}`).join(' ')}`
  const summary = result.summary?.trim()
  if (summary) {
    const extra = unsupported(summary, allText)
    if (extra.length) report.notes.push(`Kept your current summary: the new one mentioned ${extra.slice(0, 3).join(', ')}.`)
    else {
      content.summary = summary
      report.summary = 'ai'
    }
  }

  // Skills: only ones that are already listed; the AI only decides the order.
  const known = new Map(content.skills.map((s) => [s.trim().toLowerCase(), s]))
  const ordered = (result.skills ?? []).map((s) => known.get(s.trim().toLowerCase())).filter((s): s is string => !!s)
  if (ordered.length) content.skills = [...new Set([...ordered, ...content.skills])]
  return { content, report }
}
