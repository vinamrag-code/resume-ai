import { describe, expect, it } from 'vitest'
import { ChainLlmClient, withPrompt } from './index'
import { LlmError } from '@/lib/llm/types'
import type { ChatMessage, ChatOptions, LlmClient } from '@/lib/llm/types'

/** Records every call and answers from a script (a string, or an error to throw). */
function scripted(replies: (string | Error)[]): LlmClient & { calls: { messages: ChatMessage[]; options?: ChatOptions }[] } {
  const calls: { messages: ChatMessage[]; options?: ChatOptions }[] = []
  const next = (m: ChatMessage[], o?: ChatOptions) => {
    calls.push({ messages: m, options: o })
    const r = replies[calls.length - 1] ?? replies.at(-1) ?? ''
    if (r instanceof Error) throw r
    return r
  }
  return {
    calls,
    chat: async (m, o) => next(m, o),
    stream: async (m, onToken, o) => {
      const text = next(m, o)
      for (const part of text.match(/.{1,4}/gs) ?? []) onToken(part)
      return text
    },
    testConnection: async () => ({ ok: true, models: [], message: '' }),
  }
}

const history: ChatMessage[] = [
  { role: 'system', content: 'You are a resume counselor. Reply in <edits> format when you edit.' },
  { role: 'user', content: 'Improve my summary' },
]
const retrieve = async () => 'Past CV: led a team of 5 engineers.'

describe('ChainLlmClient', () => {
  it('runs editor -> writer -> editor, with the brief and retrieved context reaching the writer', async () => {
    const editor = scripted(['Rewrite the summary; mention team leadership.', 'FINAL ANSWER'])
    const writer = scripted(['DRAFT ANSWER'])
    const tokens: string[] = []
    const out = await new ChainLlmClient({ editor: [editor], writer: [writer], retrieve }).stream(history, (t) => tokens.push(t))

    expect(out).toBe('FINAL ANSWER')
    expect(tokens.join('')).toBe('FINAL ANSWER')
    // Step 1: the editor saw the question and the retrieved passages.
    const rewriteInput = editor.calls[0]!.messages.map((m) => m.content).join('\n')
    expect(rewriteInput).toContain('Improve my summary')
    expect(rewriteInput).toContain('led a team of 5 engineers')
    // Step 2: the writer got the original message plus the brief, and the original system prompt.
    const w = writer.calls[0]!.messages
    expect(w[0]).toEqual(history[0])
    expect(w[1]!.content).toContain('Improve my summary')
    expect(w[1]!.content).toContain('mention team leadership')
    // Step 3: the editor polished the writer's draft.
    expect(editor.calls[1]!.messages.map((m) => m.content).join('\n')).toContain('DRAFT ANSWER')
  })

  it('degrades gracefully: no brief if the editor is down, draft if it cannot polish', async () => {
    const down = new LlmError('unreachable', 'down')
    const editor = scripted([down])
    const writer = scripted(['DRAFT ANSWER'])
    expect(await new ChainLlmClient({ editor: [editor], writer: [writer], retrieve }).chat(history)).toBe('DRAFT ANSWER')
    expect(writer.calls[0]!.messages[1]!.content).toBe('Improve my summary')
  })

  it('JSON requests skip the editing steps and ask the writer for JSON', async () => {
    const editor = scripted(['should not be called'])
    const writer = scripted(['{"a":1}'])
    expect(await new ChainLlmClient({ editor: [editor], writer: [writer], retrieve }).chat(history, { json: true, temperature: 0 })).toBe('{"a":1}')
    expect(editor.calls).toHaveLength(0)
    expect(writer.calls[0]!.options).toMatchObject({ json: true, temperature: 0 })
  })

  it('surfaces writer errors (so the app can show them) and never retries a cancellation', async () => {
    const editor = scripted(['brief'])
    await expect(new ChainLlmClient({ editor: [editor], writer: [scripted([new LlmError('signin', 'Sign in')])], retrieve }).chat(history)).rejects.toMatchObject({ kind: 'signin' })
    const aborted = new AbortController()
    aborted.abort()
    await expect(new ChainLlmClient({ editor: [scripted([new LlmError('aborted', 'x')])], writer: [scripted(['d'])], retrieve }).chat(history, { signal: aborted.signal })).rejects.toBeDefined()
  })

  it('OpenRouter stands behind each step: the writer and the editor fall back independently', async () => {
    const down = new LlmError('rate-limit', 'slow down')
    const groq = scripted([down])
    const openrouterEditor = scripted(['BRIEF', 'POLISHED'])
    const inception = scripted([new LlmError('unreachable', 'down')])
    const openrouterWriter = scripted(['DRAFT'])
    const out = await new ChainLlmClient({ editor: [groq, openrouterEditor], writer: [inception, openrouterWriter], retrieve }).chat(history)
    expect(out).toBe('POLISHED')
    expect(openrouterWriter.calls[0]!.messages[1]!.content).toContain('BRIEF')
    expect(openrouterEditor.calls[1]!.messages.map((m) => m.content).join('\n')).toContain('DRAFT')
  })

  it('reports a cancelled request as the app\'s own aborted error', async () => {
    const ctl = new AbortController()
    ctl.abort()
    await expect(new ChainLlmClient({ editor: [scripted(['b'])], writer: [scripted(['d'])], retrieve }).chat(history, { signal: ctl.signal })).rejects.toMatchObject({ kind: 'aborted' })
  })

  it('withPrompt replaces only the latest user message', () => {
    const msgs: ChatMessage[] = [...history, { role: 'assistant', content: 'a' }, { role: 'user', content: 'again' }]
    const out = withPrompt(msgs, 'NEW')
    expect(out.map((m) => m.content)).toEqual([history[0]!.content, 'Improve my summary', 'a', 'NEW'])
  })
})
