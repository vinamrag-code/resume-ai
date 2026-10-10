import { useResumes } from '@/store/resumes'
import type { HeaderAlign, Resume } from '@/types/resume'
import { TEMPLATES } from './templates'

export function DesignPanel({ resume }: { resume: Resume }) {
  const setTemplate = useResumes((s) => s.setTemplate)
  const setStyle = useResumes((s) => s.setStyle)
  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="label">Template</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {TEMPLATES.map((t) => (
            <label
              key={t.id}
              className={`cursor-pointer rounded-xl border p-3 text-sm ${resume.templateId === t.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-ink-200 dark:border-ink-700'}`}
            >
              <input type="radio" name="template" className="sr-only" checked={resume.templateId === t.id} onChange={() => setTemplate(resume.id, t.id)} />
              <span className="block font-semibold" style={{ fontFamily: t.fontFamily }}>
                {t.name}
              </span>
              <span className="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">{t.description}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">All templates are single column with no tables, images or icons, so applicant tracking systems can read them.</p>
      </fieldset>
      <div>
        <label htmlFor="font-size" className="label">
          Font size: {resume.style.fontSize}pt
        </label>
        <input id="font-size" type="range" min={8} max={14} step={0.5} value={resume.style.fontSize} onChange={(e) => setStyle(resume.id, { fontSize: Number(e.target.value) })} className="w-full accent-brand-600" />
      </div>
      <div>
        <label htmlFor="spacing" className="label">
          Spacing: {resume.style.spacing.toFixed(1)}x
        </label>
        <input id="spacing" type="range" min={0.6} max={1.6} step={0.1} value={resume.style.spacing} onChange={(e) => setStyle(resume.id, { spacing: Number(e.target.value) })} className="w-full accent-brand-600" />
      </div>
      <div>
        <label htmlFor="header-align" className="label">
          Header alignment (name and contact)
        </label>
        <select id="header-align" className="input max-w-xs" value={resume.style.headerAlign ?? 'auto'} onChange={(e) => setStyle(resume.id, { headerAlign: e.target.value as HeaderAlign })}>
          <option value="auto">Follow template</option>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>
      <div>
        <label htmlFor="bullet-indent" className="label">
          Bullet indent: {(resume.style.bulletIndent ?? 1.1).toFixed(1)}em
        </label>
        <input id="bullet-indent" type="range" min={0.5} max={3} step={0.1} value={resume.style.bulletIndent ?? 1.1} onChange={(e) => setStyle(resume.id, { bulletIndent: Number(e.target.value) })} className="w-full accent-brand-600" />
      </div>
    </div>
  )
}
