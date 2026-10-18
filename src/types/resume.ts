import { z } from 'zod'

const str = z.string()

export const LinkSchema = z.object({ id: str, label: str, url: str })
export const ExperienceSchema = z.object({
  id: str,
  company: str,
  title: str,
  location: str,
  start: str,
  end: str,
  bullets: z.array(str),
  /** The experience-bank item this entry came from (keeps the two linked). */
  bankId: str.optional(),
})
export const EducationSchema = z.object({
  id: str,
  school: str,
  degree: str,
  field: str,
  start: str,
  end: str,
  details: z.array(str),
})
export const ProjectSchema = z.object({
  id: str,
  name: str,
  link: str,
  bullets: z.array(str),
  bankId: str.optional(),
})
/** A sub-heading under Skills, e.g. "Languages" with Python and Go. Only decides where skills are shown; `skills` is the full list. */
export const SkillGroupSchema = z.object({ id: str, heading: str, skills: z.array(str) })
export const CertificationSchema = z.object({ id: str, name: str, issuer: str, date: str })

export const ResumeContentSchema = z.object({
  contact: z.object({
    name: str,
    email: str,
    phone: str,
    location: str,
    links: z.array(LinkSchema),
  }),
  summary: str,
  experience: z.array(ExperienceSchema),
  education: z.array(EducationSchema),
  projects: z.array(ProjectSchema),
  skills: z.array(str),
  /** Optional sub-headings for the skills. Empty means one plain list. Older saved resumes do not have it. */
  skillGroups: z.array(SkillGroupSchema).default([]),
  certifications: z.array(CertificationSchema),
})

export type ResumeContent = z.infer<typeof ResumeContentSchema>
export type Experience = z.infer<typeof ExperienceSchema>
export type Education = z.infer<typeof EducationSchema>
export type Project = z.infer<typeof ProjectSchema>
export type SkillGroup = z.infer<typeof SkillGroupSchema>
export type Certification = z.infer<typeof CertificationSchema>
export type ContactLink = z.infer<typeof LinkSchema>

export const TEMPLATE_IDS = ['classic', 'modern', 'compact'] as const
export type TemplateId = (typeof TEMPLATE_IDS)[number]

export const HEADER_ALIGNS = ['auto', 'left', 'center', 'right'] as const
export type HeaderAlign = (typeof HEADER_ALIGNS)[number]

export const ResumeStyleSchema = z.object({
  fontSize: z.number().min(8).max(14),
  spacing: z.number().min(0.6).max(1.6),
  /** Alignment of the name/contact header. "auto" follows the template. */
  headerAlign: z.enum(HEADER_ALIGNS).default('auto'),
  /** Bullet indentation in em. */
  bulletIndent: z.number().min(0.5).max(3).default(1.1),
})
export type ResumeStyle = z.infer<typeof ResumeStyleSchema>

export const WORK_TYPES = ['unspecified', 'remote', 'hybrid', 'onsite'] as const
export type WorkType = (typeof WORK_TYPES)[number]
export const WORK_TYPE_LABELS: Record<WorkType, string> = { unspecified: 'Not mentioned', remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' }

export const TargetJobSchema = z.object({
  title: str,
  company: str,
  description: str,
  /** Where the job is (optional). Older saved resumes do not have these two fields. */
  location: str.default(''),
  workType: z.enum(WORK_TYPES).catch('unspecified').default('unspecified'),
})
export type TargetJob = z.infer<typeof TargetJobSchema>

export const ResumeSchema = z.object({
  id: str,
  name: str,
  templateId: z.enum(TEMPLATE_IDS),
  style: ResumeStyleSchema,
  target: TargetJobSchema,
  /** Set when this resume is a tailored copy. */
  baseResumeId: z.string().optional(),
  jobId: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  content: ResumeContentSchema,
})
export type Resume = z.infer<typeof ResumeSchema>

export const SECTION_KEYS = [
  'contact',
  'summary',
  'experience',
  'education',
  'projects',
  'skills',
  'certifications',
] as const
export type SectionKey = (typeof SECTION_KEYS)[number]

/** Lenient shape the LLM is asked to produce when parsing resume text. Ids are added afterwards. */
const lenient = z
  .string()
  .nullish()
  .transform((v) => v ?? '')
const lenientList = <T extends z.ZodType>(item: T) =>
  z
    .array(item)
    .nullish()
    .transform((v) => v ?? [])

export const ParsedResumeSchema = z.object({
  contact: z
    .object({
      name: lenient,
      email: lenient,
      phone: lenient,
      location: lenient,
      links: lenientList(z.object({ label: lenient, url: lenient })),
    })
    .nullish()
    .transform((v) => v ?? { name: '', email: '', phone: '', location: '', links: [] }),
  summary: lenient,
  experience: lenientList(
    z.object({
      company: lenient,
      title: lenient,
      location: lenient,
      start: lenient,
      end: lenient,
      bullets: lenientList(z.string()),
    }),
  ),
  education: lenientList(
    z.object({
      school: lenient,
      degree: lenient,
      field: lenient,
      start: lenient,
      end: lenient,
      details: lenientList(z.string()),
    }),
  ),
  projects: lenientList(z.object({ name: lenient, link: lenient, bullets: lenientList(z.string()) })),
  skills: lenientList(z.string()),
  certifications: lenientList(z.object({ name: lenient, issuer: lenient, date: lenient })),
})
export type ParsedResume = z.infer<typeof ParsedResumeSchema>
