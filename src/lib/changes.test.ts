import { describe, expect, it } from 'vitest'
import { sampleContent } from '@/test/fixtures'
import { applyChanges, buildChanges, invertChange, findNewNumbers, isStale, ProposedEditsSchema, sanitizeSkills, setAllStatus, setStatus } from './changes'
import { diffWords } from './diff'
import { resumeToText } from './resume'

const proposed = (over: Record<string, unknown> = {}) =>
  ProposedEditsSchema.parse({
    summary: 'Frontend-focused engineer who builds reliable web applications and mentors junior developers.',
    bullets: [{ section: 'experience', entry: 0, bullet: 1, text: 'Maintained internal APIs consumed by the analytics team', reason: 'clearer' }],
    skills: ['React', 'TypeScript', 'Docker', 'Rust'],
    ...over,
  })

describe('diffWords', () => {
  it('marks additions and deletions', () => {
    const d = diffWords('built a fast app', 'built a reliable app')
    expect(d.filter((s) => s.type === 'del').map((s) => s.text)).toEqual(['fast'])
    expect(d.filter((s) => s.type === 'add').map((s) => s.text)).toEqual(['reliable'])
  })
  it('round-trips both sides', () => {
    const a = 'one two three four'
    const b = 'one 2 three four five'
    const d = diffWords(a, b)
    expect(d.filter((s) => s.type !== 'add').map((s) => s.text).join('')).toBe(a)
    expect(d.filter((s) => s.type !== 'del').map((s) => s.text).join('')).toBe(b)
  })
  it('returns a single same segment for equal text', () => {
    expect(diffWords('same', 'same')).toEqual([{ type: 'same', text: 'same' }])
  })
})

describe('buildChanges', () => {
  const content = sampleContent()
  const src = resumeToText(content)

  it('resolves before-text from the real resume and drops invalid/no-op edits', () => {
    const changes = buildChanges(
      content,
      proposed({
        bullets: [
          { section: 'experience', entry: 0, bullet: 1, text: 'Maintained internal APIs consumed by the analytics team' },
          { section: 'experience', entry: 9, bullet: 0, text: 'ghost' },
          { section: 'experience', entry: 0, bullet: 0, text: content.experience[0]!.bullets[0]! },
        ],
      }),
      src,
    )
    const bullets = changes.filter((c) => c.target.kind === 'bullet')
    expect(bullets).toHaveLength(1)
    expect(bullets[0]!.before).toBe('worked on APIs')
    expect(bullets.every((c) => c.status === 'pending')).toBe(true)
  })

  it('warns about numbers that are not in the resume', () => {
    const changes = buildChanges(content, proposed({ bullets: [{ section: 'experience', entry: 0, bullet: 1, text: 'Maintained 12 APIs serving 40 analysts' }] }), src)
    const c = changes.find((x) => x.target.kind === 'bullet')!
    expect(c.warnings).toHaveLength(1)
    expect(c.warnings[0]).toContain('12')
    expect(findNewNumbers('Cut cost by 35%', src)).toEqual([])
  })

  it('never introduces new skills when reordering', () => {
    expect(sanitizeSkills(['A', 'B', 'C'], ['c', 'Z', 'a'])).toEqual(['C', 'A', 'B'])
    const sk = buildChanges(content, proposed(), src).find((c) => c.target.kind === 'skills')!
    expect(sk.afterSkills).toEqual(['React', 'TypeScript', 'Docker', 'Node.js', 'SQL'].slice(0, 3).concat(['Node.js', 'SQL']))
    expect(sk.afterSkills).not.toContain('Rust')
  })
})

describe('accept / reject / apply', () => {
  const content = sampleContent()
  const changes = buildChanges(content, proposed(), resumeToText(content))

  it('applies only accepted changes and never mutates the input', () => {
    const snapshot = structuredClone(content)
    const bulletChange = changes.find((c) => c.target.kind === 'bullet')!
    const accepted = setStatus(changes, bulletChange.id, 'accepted')
    const res = applyChanges(content, accepted)
    expect(res.applied).toEqual([bulletChange.id])
    expect(res.content.experience[0]!.bullets[1]).toBe(bulletChange.after)
    expect(res.content.summary).toBe(content.summary)
    expect(content).toEqual(snapshot)
  })

  it('accept all then reject one', () => {
    const all = setAllStatus(changes, 'accepted')
    expect(all.every((c) => c.status === 'accepted')).toBe(true)
    const one = setStatus(all, all[0]!.id, 'rejected')
    const res = applyChanges(content, one)
    expect(res.applied).toHaveLength(changes.length - 1)
    expect(res.content.skills.slice(0, 2)).toEqual(['React', 'TypeScript'])
  })

  it('skips stale changes when the resume was edited meanwhile', () => {
    const edited = structuredClone(content)
    edited.experience[0]!.bullets[1] = 'Something the user rewrote'
    const bulletChange = changes.find((c) => c.target.kind === 'bullet')!
    expect(isStale(edited, bulletChange)).toBe(true)
    const res = applyChanges(edited, setAllStatus(changes, 'accepted'))
    expect(res.skipped).toContain(bulletChange.id)
    expect(res.content.experience[0]!.bullets[1]).toBe('Something the user rewrote')
  })
})

describe('invertChange', () => {
  it('reverts an applied bullet and skills change exactly', () => {
    const content = sampleContent()
    const all = setAllStatus(buildChanges(content, proposed(), resumeToText(content)), 'accepted')
    const applied = applyChanges(content, all).content
    expect(applied).not.toEqual(content)
    const reverted = applyChanges(applied, all.map(invertChange)).content
    expect(reverted).toEqual(content)
  })
})
