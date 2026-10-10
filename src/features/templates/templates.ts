import type { TemplateId } from '@/types/resume'

export interface TemplateDef {
  id: TemplateId
  name: string
  description: string
  fontFamily: string
  /** Multiplier applied to the user's base font size. */
  scale: number
  headerAlign: 'center' | 'left'
  headingStyle: 'rule' | 'accent' | 'plain'
  accent: string
  nameSize: number
}

/** All templates are single-column, text-only and use standard fonts so ATS parsers read them cleanly. */
export const TEMPLATES: TemplateDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Serif type, centred header, ruled section headings.',
    fontFamily: 'Georgia, "Times New Roman", Times, serif',
    scale: 1,
    headerAlign: 'center',
    headingStyle: 'rule',
    accent: '#111111',
    nameSize: 2.1,
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'Clean sans-serif, left-aligned header, teal section headings.',
    fontFamily: 'Arial, Helvetica, sans-serif',
    scale: 1,
    headerAlign: 'left',
    headingStyle: 'accent',
    accent: '#1a6556',
    nameSize: 2.2,
  },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Dense sans-serif layout that fits more on one page.',
    fontFamily: 'Calibri, Arial, Helvetica, sans-serif',
    scale: 0.94,
    headerAlign: 'left',
    headingStyle: 'plain',
    accent: '#111111',
    nameSize: 1.8,
  },
]

export function getTemplate(id: TemplateId): TemplateDef {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]!
}
