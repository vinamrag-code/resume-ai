import { z } from 'zod'
import { FIELD_SECTIONS, FORMAT_KEYS } from '@/lib/changes'
import type { Change } from '@/lib/changes'
import { SkillGroupSchema } from '@/types/resume'

const bulletTarget = (kind: 'bullet' | 'bullet-add' | 'bullet-remove') =>
  z.object({ kind: z.literal(kind), section: z.enum(['experience', 'projects']), entry: z.number().int().min(0), bullet: z.number().int().min(0) })

/** A saved edit suggestion (so it can still be applied after the page is reloaded). */
export const ChangeSchema = z.object({
  id: z.string(),
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('summary') }),
    bulletTarget('bullet'),
    bulletTarget('bullet-add'),
    bulletTarget('bullet-remove'),
    z.object({ kind: z.literal('field'), section: z.enum(FIELD_SECTIONS), entry: z.number().int().min(0), field: z.string() }),
    z.object({ kind: z.literal('skills') }),
    z.object({ kind: z.literal('format'), key: z.enum(FORMAT_KEYS) }),
  ]),
  label: z.string(),
  before: z.string(),
  after: z.string(),
  afterSkills: z.array(z.string()).optional(),
  beforeSkills: z.array(z.string()).optional(),
  afterGroups: z.array(SkillGroupSchema).optional(),
  beforeGroups: z.array(SkillGroupSchema).optional(),
  reason: z.string(),
  status: z.enum(['pending', 'accepted', 'rejected']),
  warnings: z.array(z.string()),
}) satisfies z.ZodType<Change>

export const ChatTurnSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  /** Raw model text, including any edits block. */
  content: z.string(),
  changes: z.array(ChangeSchema),
})
export type ChatTurn = z.infer<typeof ChatTurnSchema>

/** The saved conversation with the Agent about one resume. */
export const ChatSchema = z.object({
  id: z.string(),
  resumeId: z.string(),
  turns: z.array(ChatTurnSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type Chat = z.infer<typeof ChatSchema>

export const chatIdFor = (resumeId: string): string => `c-${resumeId}`
