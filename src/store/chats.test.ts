import { beforeEach, describe, expect, it } from 'vitest'
import { applyChanges, buildChanges, currentFormat, ProposedEditsSchema } from '@/lib/changes'
import { newResume, resumeToText } from '@/lib/resume'
import { sampleContent } from '@/test/fixtures'
import { ChatSchema, chatIdFor } from '@/types/chat'
import type { ChatTurn } from '@/types/chat'
import { createBackup, restoreBackup } from './backup'
import { MAX_TURN_CHARS, MAX_TURNS, selectTurns, useChats } from './chats'
import { useResumes } from './resumes'

const turn = (id: string, role: 'user' | 'assistant' = 'user', content = id): ChatTurn => ({ id, role, content, changes: [] })

beforeEach(() => {
  useChats.setState({ chats: [] })
  useResumes.setState({ resumes: [] })
})

describe('saved Agent conversations', () => {
  it('creates a conversation per resume on first use and updates it afterwards', () => {
    useChats.getState().setTurns('r1', () => [turn('a')])
    useChats.getState().setTurns('r1', (t) => [...t, turn('b', 'assistant')])
    useChats.getState().setTurns('r2', () => [turn('x')])
    const { chats } = useChats.getState()
    expect(chats).toHaveLength(2)
    expect(selectTurns(chats, 'r1')?.map((t) => t.id)).toEqual(['a', 'b'])
    expect(chats.find((c) => c.resumeId === 'r1')?.id).toBe(chatIdFor('r1'))
    expect(selectTurns(chats, 'nope')).toBeUndefined()
  })

  it('persists to browser storage', () => {
    useChats.getState().setTurns('r1', () => [turn('hello', 'user', 'Improve my summary')])
    expect(localStorage.getItem('resume-ai:chats')).toContain('Improve my summary')
  })

  it('keeps only the newest turns and caps very long messages', () => {
    useChats.getState().setTurns('r1', () => Array.from({ length: MAX_TURNS + 10 }, (_, i) => turn(`t${i}`)))
    const turns = selectTurns(useChats.getState().chats, 'r1')!
    expect(turns).toHaveLength(MAX_TURNS)
    expect(turns[0]!.id).toBe('t10')
    useChats.getState().setTurns('r2', () => [turn('big', 'assistant', 'x'.repeat(MAX_TURN_CHARS + 500))])
    expect(selectTurns(useChats.getState().chats, 'r2')![0]!.content).toHaveLength(MAX_TURN_CHARS)
  })

  it('clear removes only that conversation', () => {
    useChats.getState().setTurns('r1', () => [turn('a')])
    useChats.getState().setTurns('r2', () => [turn('b')])
    useChats.getState().clear('r1')
    expect(useChats.getState().chats.map((c) => c.resumeId)).toEqual(['r2'])
  })
})

describe('saved suggestions survive being stored', () => {
  it('real suggestions pass validation after a JSON round trip and can still be applied', () => {
    const content = sampleContent()
    const resume = newResume('x', content)
    const edits = ProposedEditsSchema.parse({
      summary: 'A tighter summary of the same experience.',
      bullets: [{ section: 'experience', entry: 0, bullet: 1, text: 'Maintained internal APIs for analysts' }],
      addBullets: [{ section: 'experience', entry: 0, bullet: 0, text: 'Mentored two junior developers' }],
      removeBullets: [{ section: 'projects', entry: 0, bullet: 0 }],
      fields: [{ section: 'contact', field: 'phone', value: '555-0199' }],
      skills: ['React', 'TypeScript'],
      format: { headerAlign: 'center', bulletIndent: 1.6 },
    })
    const changes = buildChanges(content, edits, resumeToText(content), currentFormat(resume))
    expect(new Set(changes.map((c) => c.target.kind))).toEqual(new Set(['summary', 'bullet', 'bullet-add', 'bullet-remove', 'field', 'skills', 'format']))
    const chat = { id: 'c-r', resumeId: 'r', createdAt: 1, updatedAt: 2, turns: [{ id: 't', role: 'assistant' as const, content: 'ok', changes }] }
    const restored = ChatSchema.parse(JSON.parse(JSON.stringify(chat)))
    const applied = applyChanges(content, restored.turns[0]!.changes.map((c) => ({ ...c, status: 'accepted' as const })))
    expect(applied.applied).toHaveLength(changes.filter((c) => c.target.kind !== 'format').length)
    expect(applied.content.contact.phone).toBe('555-0199')
  })

  it('rejects malformed stored conversations', () => {
    expect(ChatSchema.safeParse({ id: 'x', resumeId: 'r', createdAt: 1, updatedAt: 1, turns: [{ id: 't', role: 'system', content: '', changes: [] }] }).success).toBe(false)
    expect(ChatSchema.safeParse({ id: 'x', resumeId: 'r', createdAt: 1, updatedAt: 1, turns: [{ id: 't', role: 'user', content: '', changes: [{ id: 'c' }] }] }).success).toBe(false)
  })
})

describe('backups include conversations', () => {
  it('round-trips chats, and still accepts older backups that have none', () => {
    useChats.getState().setTurns('r1', () => [turn('a', 'user', 'Hello agent')])
    const json = JSON.stringify(createBackup())
    useChats.setState({ chats: [] })
    expect(restoreBackup(json)).toMatchObject({ ok: true })
    expect(selectTurns(useChats.getState().chats, 'r1')?.[0]?.content).toBe('Hello agent')

    const old = JSON.parse(json) as Record<string, unknown>
    delete old.chats
    expect(restoreBackup(JSON.stringify(old))).toMatchObject({ ok: true })
    expect(useChats.getState().chats).toEqual([])
  })
})
