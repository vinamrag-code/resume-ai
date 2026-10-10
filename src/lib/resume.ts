import { makeId } from '@/lib/id'
import type { ParsedResume, Resume, ResumeContent } from '@/types/resume'

export const DEFAULT_STYLE = { fontSize: 10.5, spacing: 1 } as const

export function emptyContent(): ResumeContent {
  return {
    contact: { name: '', email: '', phone: '', location: '', links: [] },
    summary: '',
    experience: [],
    education: [],
    projects: [],
    skills: [],
    certifications: [],
  }
}

export function newResume(name: string, content: ResumeContent = emptyContent()): Resume {
  const now = Date.now()
  return {
    id: makeId(),
    name,
    templateId: 'classic',
    style: { ...DEFAULT_STYLE },
    target: { title: '', company: '', description: '' },
    createdAt: now,
    updatedAt: now,
    content,
  }
}

/** Turn the lenient LLM output into stored content with ids. Drops empty entries. */
export function hydrateParsed(p: ParsedResume): ResumeContent {
  const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean)
  return {
    contact: {
      ...p.contact,
      links: p.contact.links.filter((l) => l.url || l.label).map((l) => ({ id: makeId(), ...l })),
    },
    summary: p.summary.trim(),
    experience: p.experience
      .filter((e) => e.company || e.title)
      .map((e) => ({ id: makeId(), ...e, bullets: clean(e.bullets) })),
    education: p.education
      .filter((e) => e.school || e.degree)
      .map((e) => ({ id: makeId(), ...e, details: clean(e.details) })),
    projects: p.projects.filter((x) => x.name).map((x) => ({ id: makeId(), ...x, bullets: clean(x.bullets) })),
    skills: [...new Set(clean(p.skills))],
    certifications: p.certifications.filter((c) => c.name).map((c) => ({ id: makeId(), ...c })),
  }
}

export function cloneContent(c: ResumeContent): ResumeContent {
  return structuredClone(c)
}

/** Plain-text rendering of a resume, used for ATS matching and LLM context. */
export function resumeToText(c: ResumeContent): string {
  const lines: string[] = []
  const { contact } = c
  lines.push(contact.name, [contact.email, contact.phone, contact.location].filter(Boolean).join(' | '))
  if (c.summary) lines.push('', 'SUMMARY', c.summary)
  if (c.experience.length) {
    lines.push('', 'EXPERIENCE')
    for (const e of c.experience) {
      lines.push(`${e.title} - ${e.company} ${e.location} (${e.start} - ${e.end})`)
      for (const b of e.bullets) lines.push(`- ${b}`)
    }
  }
  if (c.projects.length) {
    lines.push('', 'PROJECTS')
    for (const p of c.projects) {
      lines.push(p.name)
      for (const b of p.bullets) lines.push(`- ${b}`)
    }
  }
  if (c.education.length) {
    lines.push('', 'EDUCATION')
    for (const e of c.education) {
      lines.push(`${e.degree} ${e.field} - ${e.school} (${e.start} - ${e.end})`)
      for (const d of e.details) lines.push(`- ${d}`)
    }
  }
  if (c.skills.length) lines.push('', 'SKILLS', c.skills.join(', '))
  if (c.certifications.length) {
    lines.push('', 'CERTIFICATIONS')
    for (const x of c.certifications) lines.push(`${x.name} ${x.issuer} ${x.date}`)
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Compact JSON for LLM prompts: indexes instead of ids so models can reference entries reliably. */
export function resumeForPrompt(c: ResumeContent): string {
  return JSON.stringify(
    {
      contact: { name: c.contact.name, location: c.contact.location },
      summary: c.summary,
      experience: c.experience.map((e, entry) => ({
        entry,
        title: e.title,
        company: e.company,
        start: e.start,
        end: e.end,
        bullets: e.bullets.map((text, bullet) => ({ bullet, text })),
      })),
      projects: c.projects.map((p, entry) => ({
        entry,
        name: p.name,
        bullets: p.bullets.map((text, bullet) => ({ bullet, text })),
      })),
      education: c.education.map((e) => ({ school: e.school, degree: e.degree, field: e.field })),
      skills: c.skills,
      certifications: c.certifications.map((x) => x.name),
    },
    null,
    1,
  )
}
