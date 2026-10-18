import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { makeId } from '@/lib/id'
import { cloneContent, newResume, withSkillGroups } from '@/lib/resume'
import type { Resume, ResumeContent, ResumeStyle, TargetJob, TemplateId } from '@/types/resume'

export interface ResumeState {
  resumes: Resume[]
  create: (name: string, content?: ResumeContent) => Resume
  rename: (id: string, name: string) => void
  duplicate: (id: string) => Resume | undefined
  remove: (id: string) => void
  updateContent: (id: string, fn: (draft: ResumeContent) => ResumeContent) => void
  setContent: (id: string, content: ResumeContent) => void
  setTemplate: (id: string, templateId: TemplateId) => void
  setStyle: (id: string, style: Partial<ResumeStyle>) => void
  setTarget: (id: string, target: Partial<TargetJob>) => void
  /** Saves a tailored copy; the base resume is never modified. */
  createTailoredCopy: (baseId: string, content: ResumeContent, name: string, jobId?: string) => Resume | undefined
  setJobLink: (id: string, jobId: string | undefined) => void
}

export const useResumes = create<ResumeState>()(
  persist(
    (set, get) => {
      const patch = (id: string, fn: (r: Resume) => Resume) =>
        set((s) => ({ resumes: s.resumes.map((r) => (r.id === id ? { ...fn(r), updatedAt: Date.now() } : r)) }))
      return {
        resumes: [],
        create: (name, content) => {
          const r = newResume(name, content)
          set((s) => ({ resumes: [r, ...s.resumes] }))
          return r
        },
        rename: (id, name) => patch(id, (r) => ({ ...r, name })),
        duplicate: (id) => {
          const src = get().resumes.find((r) => r.id === id)
          if (!src) return undefined
          const now = Date.now()
          const copy: Resume = {
            ...structuredClone(src),
            id: makeId(),
            name: `${src.name} (copy)`,
            createdAt: now,
            updatedAt: now,
          }
          set((s) => ({ resumes: [copy, ...s.resumes] }))
          return copy
        },
        remove: (id) => set((s) => ({ resumes: s.resumes.filter((r) => r.id !== id) })),
        updateContent: (id, fn) => patch(id, (r) => ({ ...r, content: fn(cloneContent(r.content)) })),
        setContent: (id, content) => patch(id, (r) => ({ ...r, content })),
        setTemplate: (id, templateId) => patch(id, (r) => ({ ...r, templateId })),
        setStyle: (id, style) => patch(id, (r) => ({ ...r, style: { ...r.style, ...style } })),
        setTarget: (id, target) => patch(id, (r) => ({ ...r, target: { ...r.target, ...target } })),
        createTailoredCopy: (baseId, content, name, jobId) => {
          const base = get().resumes.find((r) => r.id === baseId)
          if (!base) return undefined
          const now = Date.now()
          const copy: Resume = {
            ...structuredClone(base),
            id: makeId(),
            name,
            content,
            baseResumeId: base.id,
            jobId,
            createdAt: now,
            updatedAt: now,
          }
          set((s) => ({ resumes: [copy, ...s.resumes] }))
          return copy
        },
        setJobLink: (id, jobId) => patch(id, (r) => ({ ...r, jobId })),
      }
    },
    {
      name: 'resume-ai:resumes',
      partialize: (s) => ({ resumes: s.resumes }),
      merge: (saved, current) => ({ ...current, resumes: withSkillGroups((saved as Pick<ResumeState, 'resumes'> | undefined)?.resumes ?? current.resumes) }),
    },
  ),
)
