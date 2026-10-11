import { z } from 'zod'

export const BANK_KINDS = ['work', 'project', 'achievement'] as const
export type BankKind = (typeof BANK_KINDS)[number]
export const BANK_KIND_LABELS: Record<BankKind, string> = { work: 'Work experience', project: 'Project', achievement: 'Achievement' }

/**
 * One thing the user did, written down once. Everything here is the user's own text: the app never adds facts to it.
 *  - work: title = job title, org = company
 *  - project: title = project name, org = what it was for (optional)
 *  - achievement: title = headline ("Won Smart India Hackathon"), org = where/when it applies (optional)
 */
export const BankItemSchema = z.object({
  id: z.string(),
  kind: z.enum(BANK_KINDS),
  title: z.string(),
  org: z.string(),
  location: z.string().default(''),
  start: z.string().default(''),
  end: z.string().default(''),
  link: z.string().default(''),
  bullets: z.array(z.string()),
  skills: z.array(z.string()).default([]),
  createdAt: z.number(),
  updatedAt: z.number().optional(),
})
export type BankItem = z.infer<typeof BankItemSchema>
