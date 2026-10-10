import { useState } from 'react'
import { makeId } from '@/lib/id'
import type { ResumeContent } from '@/types/resume'
import { AreaField, BulletsEditor, EntryList, Section, TextField } from './controls'

interface Props {
  content: ResumeContent
  onChange: (fn: (draft: ResumeContent) => ResumeContent) => void
}

export function ResumeEditor({ content: c, onChange }: Props) {
  const set = <K extends keyof ResumeContent>(key: K, value: ResumeContent[K]) => onChange((d) => ({ ...d, [key]: value }))
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
          </>
        )}
      />

      <EntryList
        title="Projects"
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
        <SkillsField skills={c.skills} onChange={(v) => set('skills', v)} />
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
    </div>
  )
}

function SkillsField({ skills, onChange }: { skills: string[]; onChange: (s: string[]) => void }) {
  const [text, setText] = useState(skills.join(', '))
  return (
    <>
      <AreaField
        label="Skills (comma separated)"
        value={text}
        rows={3}
        onChange={(v) => {
          setText(v)
          onChange(v.split(',').map((s) => s.trim()).filter(Boolean))
        }}
      />
      <p className="text-xs text-ink-500 dark:text-ink-400">Order matters: put the most relevant skills first.</p>
    </>
  )
}
