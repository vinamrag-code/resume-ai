import { describe, expect, it } from 'vitest'
import { buildHistory, appliedSummary, HISTORY_CHAR_BUDGET, turnToMessage } from './history'
import type { Change } from '@/lib/changes'
import type { ChatTurn } from '@/types/chat'

const change = (label: string, status: Change['status']): Change => ({ id: label, target: { kind: 'summary' }, label, before: 'a', after: 'b', reason: '', status, warnings: [] })
const user = (content: string): ChatTurn => ({ id: content, role: 'user', content, changes: [] })
const bot = (content: string, changes: Change[] = []): ChatTurn => ({ id: `a-${content.slice(0, 8)}`, role: 'assistant', content, changes })

describe('turnToMessage', () => {
  it('replaces the raw edits block with a note of what was suggested and what happened to it', () => {
    const m = turnToMessage(bot('Tighter bullet.<edits>{"bullets":[{"section":"experience","entry":0,"bullet":1,"text":"x"}]}</edits>', [change('Summary', 'accepted'), change('Skills order', 'pending')]))
    expect(m.role).toBe('assistant')
    expect(m.content).toContain('Tighter bullet.')
    expect(m.content).not.toContain('<edits>')
    expect(m.content).not.toContain('"bullets"')
    expect(m.content).toContain('Summary (APPLIED by the user)')
    expect(m.content).toContain('Skills order (not applied yet)')
  })
  it('keeps user messages exactly and never returns an empty assistant message', () => {
    expect(turnToMessage(user('make it shorter')).content).toBe('make it shorter')
    expect(turnToMessage(bot('')).content).toBe('(no text)')
  })
})

describe('buildHistory', () => {
  it('keeps every earlier prompt and reply, in order, when they fit', () => {
    const turns = [user('first prompt'), bot('first reply'), user('second prompt'), bot('second reply'), user('third prompt')]
    const h = buildHistory(turns)
    expect(h.messages.map((m) => m.content)).toEqual(['first prompt', 'first reply', 'second prompt', 'second reply', 'third prompt'])
    expect(h.truncated).toBe(false)
  })

  it('drops the oldest turns first when too long, keeps the latest, and starts with a user message', () => {
    const big = 'x'.repeat(1000)
    const turns = [user('OLDEST ' + big), bot('reply 1 ' + big), user('middle ' + big), bot('reply 2 ' + big), user('LATEST question')]
    const h = buildHistory(turns, 2300)
    expect(h.truncated).toBe(true)
    expect(h.messages.at(-1)?.content).toBe('LATEST question')
    expect(h.messages[0]!.role).toBe('user')
    expect(h.messages.some((m) => m.content.startsWith('OLDEST'))).toBe(false)
    expect(h.messages.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(2300 + 'LATEST question'.length)
  })

  it('always keeps the latest message, even if it alone exceeds the budget', () => {
    const h = buildHistory([user('a'), bot('b'), user('y'.repeat(500))], 50)
    expect(h.messages).toHaveLength(1)
    expect(h.messages[0]!.content).toHaveLength(500)
  })

  it('skips an assistant turn that was cut off before any text arrived', () => {
    const h = buildHistory([user('hi'), bot(''), user('hello again')])
    expect(h.messages.map((m) => m.content)).toEqual(['hi', 'hello again'])
  })

  it('has a sensible default budget', () => {
    expect(HISTORY_CHAR_BUDGET).toBeGreaterThan(10_000)
    expect(buildHistory([]).messages).toEqual([])
  })
})

describe('appliedSummary', () => {
  it('lists each applied edit once and ignores the rest', () => {
    const turns = [bot('a', [change('Summary', 'accepted'), change('Skills order', 'pending')]), bot('b', [change('Summary', 'accepted'), change('Layout: font size', 'accepted'), change('X', 'rejected')])]
    expect(appliedSummary(turns)).toBe('Summary; Layout: font size')
    expect(appliedSummary([])).toBe('')
  })
})
