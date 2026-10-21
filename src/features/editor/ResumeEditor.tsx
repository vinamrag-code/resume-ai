import { IconX } from '@tabler/icons-react'
import { useState } from 'react'
import { BankLinkBar } from '@/features/bank/BankLinkBar'
import { BankPicker } from '@/features/bank/BankPicker'
import { makeId } from '@/lib/id'
import { useBank } from '@/store/bank'
import { moveItem } from '@/lib/arrays'
import { groupedSkills, OTHER_HEADING } from '@/lib/skills'
import type { Experience, Project, ResumeContent, SkillGroup } from '@/types/resume'
import { AreaField, BulletsEditor, EntryList, RowControls, Section, TextField } from './controls'

interface Props {
  content: ResumeContent
  onChange: (fn: (draft: ResumeContent) => ResumeContent) => void
}

export function ResumeEditor({ content: c, onChange }: Props) {
  const set = <K extends keyof ResumeContent>(key: K, value: ResumeContent[K]) => onChange((d) => ({ ...d, [key]: value }))
  const [picker, setPicker] = useState<'experience' | 'projects' | null>(null)
  const hasBank = useBank((s) => s.items.length > 0)
  const fromBank = (section: 'experience' | 'projects') =>
    hasBank && (
      <button type="button" className="btn-secondary btn-sm" onClick={() => setPicker(section)}>
        Add from experience bank
      </button>
    )
  const setContact = (patch: Partial<ResumeContent['contact']>) => onChange((d) => ({ ...d, contact: { ...d.contact, ...patch } }))

  return (
    <div className="space-y-4">
      <Section title="Contact">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Full name" value={c.contact.name} onChange={(v) => setContact({ name: v })} />
          <TextField label="Email" type="email" value={c.contact.email} onChange={(v) => setContact({ email: v })} />
          <TextField label="Phone" value={c.contact.phone} onChange={(v) => setContact({ phone: v })} />
          <TextField label="Location" value={c.contact.location} onChange={(v) => setContact({ location: v })} />
        </div>
        <EntryList
          title="Links"
          noun="link"
          items={c.contact.links}
          onChange={(links) => setContact({ links })}
          makeEmpty={() => ({ id: makeId(), label: '', url: '' })}
          renderTitle={(l) => l.label || l.url}
          render={(l, up) => (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Label" value={l.label} onChange={(v) => up({ ...l, label: v })} placeholder="LinkedIn" />
              <TextField label="URL" value={l.url} onChange={(v) => up({ ...l, url: v })} />
            </div>
          )}
        />
      </Section>

      <Section title="Summary">
        <AreaField label="Professional summary" value={c.summary} rows={4} onChange={(v) => set('summary', v)} />
      </Section>

      <EntryList
        title="Experience"
        extraActions={fromBank('experience')}
        noun="role"
        items={c.experience}
        onChange={(v) => set('experience', v)}
        makeEmpty={() => ({ id: makeId(), company: '', title: '', location: '', start: '', end: '', bullets: [''] })}
        renderTitle={(e) => [e.title, e.company].filter(Boolean).join(' at ')}
        render={(e, up) => (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Job title" value={e.title} onChange={(v) => up({ ...e, title: v })} />
              <TextField label="Company" value={e.company} onChange={(v) => up({ ...e, company: v })} />
              <TextField label="Location" value={e.location} onChange={(v) => up({ ...e, location: v })} />
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Start" value={e.start} placeholder="Jun 2022" onChange={(v) => up({ ...e, start: v })} />
                <TextField label="End" value={e.end} placeholder="Present" onChange={(v) => up({ ...e, end: v })} />
              </div>
            </div>
            <BulletsEditor label="Bullet" bullets={e.bullets} onChange={(bullets) => up({ ...e, bullets })} />
            <BankLinkBar entry={e} onChange={up} />
          </>
        )}
      />

      <EntryList
        title="Projects"
        extraActions={fromBank('projects')}
        noun="project"
        items={c.projects}
        onChange={(v) => set('projects', v)}
        makeEmpty={() => ({ id: makeId(), name: '', link: '', bullets: [''] })}
        renderTitle={(p) => p.name}
        render={(p, up) => (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Project name" value={p.name} onChange={(v) => up({ ...p, name: v })} />
              <TextField label="Link" value={p.link} onChange={(v) => up({ ...p, link: v })} />
            </div>
            <BulletsEditor label="Bullet" bullets={p.bullets} onChange={(bullets) => up({ ...p, bullets })} />
            <BankLinkBar entry={p} onChange={up} />
          </>
        )}
      />

      <EntryList
        title="Education"
        noun="school"
        items={c.education}
        onChange={(v) => set('education', v)}
        makeEmpty={() => ({ id: makeId(), school: '', degree: '', field: '', start: '', end: '', details: [] })}
        renderTitle={(e) => [e.degree, e.school].filter(Boolean).join(', ')}
        render={(e, up) => (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="School" value={e.school} onChange={(v) => up({ ...e, school: v })} />
              <TextField label="Degree" value={e.degree} onChange={(v) => up({ ...e, degree: v })} />
              <TextField label="Field of study" value={e.field} onChange={(v) => up({ ...e, field: v })} />
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Start" value={e.start} onChange={(v) => up({ ...e, start: v })} />
                <TextField label="End" value={e.end} onChange={(v) => up({ ...e, end: v })} />
              </div>
            </div>
            <BulletsEditor label="Detail" bullets={e.details} onChange={(details) => up({ ...e, details })} />
          </>
        )}
      />

      <Section title="Skills">
        <SkillsEditor content={c} onChange={(skills, skillGroups) => onChange((d) => ({ ...d, skills, skillGroups }))} />
      </Section>

      <EntryList
        title="Certifications"
        noun="certification"
        items={c.certifications}
        onChange={(v) => set('certifications', v)}
        makeEmpty={() => ({ id: makeId(), name: '', issuer: '', date: '' })}
        renderTitle={(x) => x.name}
        render={(x, up) => (
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField label="Name" value={x.name} onChange={(v) => up({ ...x, name: v })} />
            <TextField label="Issuer" value={x.issuer} onChange={(v) => up({ ...x, issuer: v })} />
            <TextField label="Date" value={x.date} onChange={(v) => up({ ...x, date: v })} />
          </div>
        )}
      />
      {picker && (
        <BankPicker
          section={picker}
          usedIds={[...c.experience, ...c.projects].flatMap((e) => (e.bankId ? [e.bankId] : []))}
          onClose={() => setPicker(null)}
          onAdd={(entry) => onChange((d) => (picker === 'experience' ? { ...d, experience: [...d.experience, entry as Experience] } : { ...d, projects: [...d.projects, entry as Project] }))}
        />
      )}
    </div>
  )
}

const splitSkills = (text: string) => text.split(',').map((s) => s.trim()).filter(Boolean)
const keyOf = (s: string) => s.toLowerCase()

/** Skills as one list, or (after "Add a sub-heading") as groups such as Languages and Tools. */
function SkillsEditor({ content: c, onChange }: { content: Pick<ResumeContent, 'skills' | 'skillGroups'>; onChange: (skills: string[], groups: SkillGroup[]) => void }) {
  const groups = c.skillGroups
  if (groups.length === 0) {
    return (
      <>
        <SkillsText label="Skills (comma separated)" initial={c.skills.join(', ')} onChange={(skills) => onChange(skills, [])} />
        <p className="text-xs text-ink-500 dark:text-ink-400">Order matters: put the most relevant skills first.</p>
        <button type="button" className="btn-secondary btn-sm" onClick={() => onChange(c.skills, [{ id: makeId(), heading: '', skills: c.skills }])}>
          Group under sub-headings
        </button>
      </>
    )
  }
  const inGroups = new Set(groups.flatMap((g) => g.skills.map(keyOf)))
  const ungrouped = c.skills.filter((s) => !inGroups.has(keyOf(s)))
  // A group edit never leaves the full list out of step: skills dropped from the group go (unless another group has them), new ones are added.
  const editGroup = (i: number, patch: Partial<SkillGroup>) => {
    const next = groups.map((g, j) => (j === i ? { ...g, ...patch } : g))
    if (!patch.skills) return onChange(c.skills, next)
    const still = new Set(next.flatMap((g) => g.skills.map(keyOf)))
    const dropped = new Set((groups[i]?.skills ?? []).map(keyOf).filter((k) => !still.has(k)))
    const known = new Set(c.skills.map(keyOf))
    onChange([...c.skills.filter((s) => !dropped.has(keyOf(s))), ...patch.skills.filter((s) => !known.has(keyOf(s)))], next)
  }
  const removeUngrouped = (s: string) => onChange(c.skills.filter((x) => x !== s), groups)
  return (
    <div className="space-y-3">
      {groups.map((g, i) => (
        <div key={g.id} className="rounded border border-ink-200 p-3 dark:border-ink-700">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <TextField label={`Sub-heading ${i + 1}`} value={g.heading} placeholder="Languages" onChange={(v) => editGroup(i, { heading: v })} />
            </div>
            <RowControls index={i} count={groups.length} label={`sub-heading ${i + 1}`} onMove={(to) => onChange(c.skills, moveItem(groups, i, to))} onRemove={() => onChange(c.skills, groups.filter((_, j) => j !== i))} />
          </div>
          <SkillsText label={`Skills under ${g.heading || `sub-heading ${i + 1}`} (comma separated)`} initial={g.skills.join(', ')} onChange={(skills) => editGroup(i, { skills })} />
        </div>
      ))}
      {ungrouped.length > 0 && (
        <div className="text-sm">
          <p className="label">Not under a sub-heading (shown as "{OTHER_HEADING}")</p>
          <ul className="flex flex-wrap gap-1.5">
            {ungrouped.map((s) => (
              <li key={s} className="flex items-center gap-1 rounded bg-ink-100 px-2 py-0.5 dark:bg-ink-800">
                {s}
                <button type="button" className="text-ink-500 hover:text-ink-900 dark:hover:text-ink-100" onClick={() => removeUngrouped(s)} aria-label={`Remove ${s}`}>
                  <IconX className="h-3.5 w-3.5" stroke={2} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={() => onChange(c.skills, [...groups, { id: makeId(), heading: '', skills: [] }])}>
          Add a sub-heading
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => onChange(groupedSkills({ skills: c.skills, skillGroups: groups }).flatMap((l) => l.skills), [])}>
          Remove sub-headings
        </button>
      </div>
    </div>
  )
}

/** A comma-separated skills box that keeps what is typed (so a trailing comma is not eaten). */
function SkillsText({ label, initial, onChange }: { label: string; initial: string; onChange: (skills: string[]) => void }) {
  const [text, setText] = useState(initial)
  return (
    <AreaField
      label={label}
      value={text}
      rows={2}
      onChange={(v) => {
        setText(v)
        onChange(splitSkills(v))
      }}
    />
  )
}
