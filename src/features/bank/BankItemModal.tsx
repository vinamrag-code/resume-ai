import { useState } from 'react'
import { Modal } from '@/components/ui'
import { AreaField, TextField } from '@/features/editor/controls'
import { parseSkills } from '@/lib/bank/assemble'
import { useBank } from '@/store/bank'
import { BANK_KINDS, BANK_KIND_LABELS } from '@/types/bank'
import type { BankItem, BankKind } from '@/types/bank'

const TITLE_LABEL: Record<BankKind, string> = { work: 'Job title', project: 'Project name', achievement: 'Achievement' }
const ORG_LABEL: Record<BankKind, string> = { work: 'Company', project: 'Made for / at (optional)', achievement: 'Belongs to (optional)' }

/** Add (item undefined) or edit one entry of the experience bank. Everything typed here is used word for word. */
export function BankItemModal({ item, onClose }: { item?: BankItem; onClose: () => void }) {
  const [d, setD] = useState({
    kind: (item?.kind ?? 'project') as BankKind,
    title: item?.title ?? '',
    org: item?.org ?? '',
    location: item?.location ?? '',
    start: item?.start ?? '',
    end: item?.end ?? '',
    link: item?.link ?? '',
    bullets: (item?.bullets ?? []).join('\n'),
    skills: (item?.skills ?? []).join(', '),
  })
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))
  const valid = d.title.trim() && (d.kind !== 'work' || d.org.trim()) && d.bullets.trim()

  const save = () => {
    const draft = {
      kind: d.kind,
      title: d.title.trim(),
      org: d.org.trim(),
      location: d.kind === 'work' ? d.location.trim() : '',
      start: d.kind === 'work' ? d.start.trim() : '',
      end: d.kind === 'work' ? d.end.trim() : '',
      link: d.kind === 'work' ? '' : d.link.trim(),
      bullets: d.bullets.split('\n').map((b) => b.trim().replace(/^[-•*]\s*/, '')).filter(Boolean),
      skills: parseSkills(d.skills),
    }
    if (item) useBank.getState().update(item.id, draft)
    else useBank.getState().add(draft)
    onClose()
  }

  return (
    <Modal title={item ? 'Edit experience' : 'Add to your experience bank'} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) save()
        }}
      >
        <div>
          <label htmlFor="bank-kind" className="label">
            Type
          </label>
          <select id="bank-kind" className="input" value={d.kind} onChange={(e) => set('kind', e.target.value as BankKind)}>
            {BANK_KINDS.map((k) => (
              <option key={k} value={k}>
                {BANK_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={TITLE_LABEL[d.kind]} value={d.title} onChange={(v) => set('title', v)} />
          <TextField label={ORG_LABEL[d.kind]} value={d.org} onChange={(v) => set('org', v)} />
          {d.kind === 'work' && (
            <>
              <TextField label="Start" value={d.start} onChange={(v) => set('start', v)} placeholder="Jan 2023" />
              <TextField label="End" value={d.end} onChange={(v) => set('end', v)} placeholder="Present" />
              <TextField label="Location (optional)" value={d.location} onChange={(v) => set('location', v)} />
            </>
          )}
          {d.kind !== 'work' && <TextField label="Link (optional)" type="url" value={d.link} onChange={(v) => set('link', v)} placeholder="https://" />}
        </div>
        <AreaField label="What you did: one bullet per line, with numbers where you have them" rows={6} value={d.bullets} onChange={(v) => set('bullets', v)} />
        <TextField label="Skills and tools used (optional, comma separated)" value={d.skills} onChange={(v) => set('skills', v)} placeholder="React, TypeScript, PostgreSQL" />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!valid}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}
