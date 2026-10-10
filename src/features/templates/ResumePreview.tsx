import type { CSSProperties, ReactNode } from 'react'
import { displayUrl, normalizeUrl } from '@/lib/links'
import type { Resume } from '@/types/resume'
import { getTemplate } from './templates'
import type { TemplateDef } from './templates'

function Heading({ t, children, space }: { t: TemplateDef; children: ReactNode; space: number }) {
  const style: CSSProperties = {
    fontSize: '1.05em',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginTop: `${1.1 * space}em`,
    marginBottom: `${0.45 * space}em`,
    color: t.headingStyle === 'accent' ? t.accent : '#111',
    borderBottom: t.headingStyle === 'rule' ? '1px solid #111' : t.headingStyle === 'accent' ? `2px solid ${t.accent}` : 'none',
    paddingBottom: t.headingStyle === 'plain' ? 0 : '0.15em',
  }
  return <h2 style={style}>{children}</h2>
}

function Row({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1em', alignItems: 'baseline' }}>
      <div>{left}</div>
      {right ? <div style={{ whiteSpace: 'nowrap' }}>{right}</div> : null}
    </div>
  )
}

/** Real hyperlink so it stays clickable in the exported PDF. Falls back to plain text if not a valid URL. */
function Link({ href, children }: { href: string; children?: ReactNode }) {
  const url = normalizeUrl(href)
  const text = children ?? displayUrl(href)
  if (!url) return <>{text}</>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
      {text}
    </a>
  )
}

const dates = (start: string, end: string) => [start, end].filter(Boolean).join(' - ')

function Bullets({ items, space, indent }: { items: string[]; space: number; indent: number }) {
  const list = items.filter((b) => b.trim())
  if (!list.length) return null
  return (
    <ul style={{ marginTop: `${0.2 * space}em`, paddingLeft: `${indent}em` }}>
      {list.map((b, i) => (
        <li key={i} style={{ marginBottom: `${0.15 * space}em` }}>
          {b}
        </li>
      ))}
    </ul>
  )
}

/** Single-column, text-only resume. Section order and markup are identical across templates. */
export function ResumePreview({ resume }: { resume: Resume }) {
  const t = getTemplate(resume.templateId)
  const { content: c, style } = resume
  const sp = style.spacing
  const indent = style.bulletIndent ?? 1.1
  const headerAlign = !style.headerAlign || style.headerAlign === 'auto' ? t.headerAlign : style.headerAlign
  const entryGap = { marginTop: `${0.6 * sp}em` }
  const contactLine = [c.contact.email, c.contact.phone, c.contact.location].filter(Boolean)
  const links = c.contact.links.filter((l) => l.url)
  return (
    <div
      className="resume-paper print-area"
      data-testid="resume-preview"
      style={{ fontFamily: t.fontFamily, fontSize: `${style.fontSize * t.scale}pt`, lineHeight: 1.3 + (sp - 1) * 0.15 }}
    >
      <header style={{ textAlign: headerAlign }}>
        <h1 style={{ fontSize: `${t.nameSize}em`, fontWeight: 700, lineHeight: 1.15, color: t.accent }}>{c.contact.name || 'Your Name'}</h1>
        {contactLine.length > 0 && (
          <p style={{ marginTop: '0.25em' }}>
            {contactLine.map((part, i) => (
              <span key={i}>
                {i > 0 && ' | '}
                {part === c.contact.email ? <Link href={part} /> : part}
              </span>
            ))}
          </p>
        )}
        {links.length > 0 && (
          <p>
            {links.map((l, i) => (
              <span key={l.id}>
                {i > 0 && ' | '}
                {l.label ? `${l.label}: ` : ''}
                <Link href={l.url} />
              </span>
            ))}
          </p>
        )}
      </header>

      {c.summary.trim() && (
        <section>
          <Heading t={t} space={sp}>
            Summary
          </Heading>
          <p>{c.summary}</p>
        </section>
      )}

      {c.experience.length > 0 && (
        <section>
          <Heading t={t} space={sp}>
            Experience
          </Heading>
          {c.experience.map((e) => (
            <div key={e.id} style={entryGap}>
              <Row left={<strong>{[e.title, e.company].filter(Boolean).join(', ')}</strong>} right={dates(e.start, e.end)} />
              {e.location && <div style={{ fontStyle: 'italic' }}>{e.location}</div>}
              <Bullets items={e.bullets} space={sp} indent={indent} />
            </div>
          ))}
        </section>
      )}

      {c.projects.length > 0 && (
        <section>
          <Heading t={t} space={sp}>
            Projects
          </Heading>
          {c.projects.map((p) => (
            <div key={p.id} style={entryGap}>
              <Row left={<strong>{p.name}</strong>} right={p.link ? <Link href={p.link} /> : undefined} />
              <Bullets items={p.bullets} space={sp} indent={indent} />
            </div>
          ))}
        </section>
      )}

      {c.education.length > 0 && (
        <section>
          <Heading t={t} space={sp}>
            Education
          </Heading>
          {c.education.map((e) => (
            <div key={e.id} style={entryGap}>
              <Row left={<strong>{[e.degree, e.field].filter(Boolean).join(', ')}</strong>} right={dates(e.start, e.end)} />
              <div>{e.school}</div>
              <Bullets items={e.details} space={sp} indent={indent} />
            </div>
          ))}
        </section>
      )}

      {c.skills.length > 0 && (
        <section>
          <Heading t={t} space={sp}>
            Skills
          </Heading>
          <p>{c.skills.join(', ')}</p>
        </section>
      )}

      {c.certifications.length > 0 && (
        <section>
          <Heading t={t} space={sp}>
            Certifications
          </Heading>
          {c.certifications.map((x) => (
            <Row key={x.id} left={[x.name, x.issuer].filter(Boolean).join(', ')} right={x.date} />
          ))}
        </section>
      )}
    </div>
  )
}
