import { StringOutputParser } from '@langchain/core/output_parsers'
import { RunnableLambda, RunnablePassthrough, RunnableSequence } from '@langchain/core/runnables'
import type { Runnable, RunnableConfig } from '@langchain/core/runnables'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { LlmError } from '@/lib/llm/types'
import type { ChatMessage, ChatOptions, LlmClient } from '@/lib/llm/types'
import { fallbackModel } from './chatModel'
import { refinePrompt, rewritePrompt } from './prompts'

export interface ChainDeps {
  /** Providers that rewrite the prompt and polish the answer, preferred first (Groq, then OpenRouter). */
  editor: LlmClient[]
  /** Providers that write the answer, preferred first (Inception, then OpenRouter). */
  writer: LlmClient[]
  /** Passages from the user's saved documents that relate to the query ('' if none). */
  retrieve: (query: string, alreadyIn: string, signal?: AbortSignal) => Promise<string>
}

interface State {
  messages: ChatMessage[]
  context: string
  /** The improved user message sent to the writer. */
  prompt: string
  draft: string
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n…[truncated]` : s)
const isAbort = (err: unknown) => err instanceof LlmError && err.kind === 'aborted'
const NONE = '(none)'

const systemText = (m: ChatMessage[]) => m.filter((x) => x.role === 'system').map((x) => x.content).join('\n\n')
const lastUserIndex = (m: ChatMessage[]) => m.map((x) => x.role).lastIndexOf('user')

export function toLc(m: ChatMessage): BaseMessage {
  return m.role === 'system' ? new SystemMessage(m.content) : m.role === 'assistant' ? new AIMessage(m.content) : new HumanMessage(m.content)
}

/** The conversation as the writer sees it: the same messages, with the improved prompt in place of the latest user message. */
export function withPrompt(messages: ChatMessage[], prompt: string): ChatMessage[] {
  const i = lastUserIndex(messages)
  return messages.map((m, idx) => (idx === i ? { ...m, content: prompt } : m))
}

/**
 * The pipeline for one request:
 *   retrieve (IndexedDB vector store) -> Groq improves the prompt -> Inception writes the answer -> Groq polishes it.
 * Each step degrades instead of failing: with no context the prompt goes on as written, if Groq cannot improve the
 * prompt the original is used, and if it cannot polish the answer the draft is returned.
 */
export function buildChain(deps: ChainDeps, options: ChatOptions = {}): Runnable<{ messages: ChatMessage[] }, string> {
  const temperature = options.temperature ?? 0.3
  const editor = (t: number) => fallbackModel('editor', deps.editor, { temperature: t })
  const writer = fallbackModel('writer', deps.writer, { temperature })
  const parse = new StringOutputParser()

  const retrieve = RunnableLambda.from(async ({ messages }: { messages: ChatMessage[] }, config) => {
    const last = messages[lastUserIndex(messages)]
    if (!last) return ''
    return deps.retrieve(last.content, messages.map((m) => m.content).join('\n'), config?.signal)
  })

  // Step 1: the editor's brief is appended to the user's message; the message itself is never rewritten.
  const improve = RunnableLambda.from(async (s: { messages: ChatMessage[]; context: string }, config): Promise<string> => {
    const i = lastUserIndex(s.messages)
    const message = s.messages[i]?.content ?? ''
    try {
      const brief = (
        await rewritePrompt
          .pipe(editor(0.2))
          .pipe(parse)
          .invoke(
            {
              system: clip(systemText(s.messages), 3000) || NONE,
              history: s.messages.slice(0, i).filter((m) => m.role !== 'system').slice(-6).map((m) => `${m.role.toUpperCase()}: ${clip(m.content, 1200)}`).join('\n') || NONE,
              message: clip(message, 6000),
              context: s.context || NONE,
            },
            config,
          )
      ).trim()
      return brief ? `${message}\n\n---\nNotes to help you answer well:\n${brief}` : message
    } catch (err) {
      if (isAbort(err) || config?.signal?.aborted) throw err
      return message
    }
  })

  // Step 2: the writer answers from the improved prompt. The draft is never shown to the user.
  const write = RunnableLambda.from(async (s: { messages: ChatMessage[]; prompt: string }, config): Promise<string> =>
    parse.invoke(await writer.invoke(withPrompt(s.messages, s.prompt).map(toLc), config)),
  )

  // Step 3: the editor polishes the draft and streams it; if it fails before any text, the draft is used.
  // LangChain streams a lambda that is an async generator; its typings only describe promise-returning ones.
  const refineStep = async function* (s: State, config?: RunnableConfig): AsyncGenerator<string> {
    let started = false
    try {
      const chain = refinePrompt.pipe(editor(Math.min(temperature, 0.3))).pipe(parse)
      const input = { system: clip(systemText(s.messages), 12_000), request: clip(s.messages[lastUserIndex(s.messages)]?.content ?? '', 8000), draft: s.draft }
      for await (const chunk of await chain.stream(input, config)) {
        started = true
        yield chunk
      }
    } catch (err) {
      if (started || isAbort(err) || config?.signal?.aborted) throw err
      yield s.draft
    }
  }
  const refine = RunnableLambda.from(refineStep as unknown as (s: State, config?: RunnableConfig) => Promise<string>)

  return RunnableSequence.from([
    RunnablePassthrough.assign({ context: retrieve }),
    RunnablePassthrough.assign({ prompt: improve }),
    RunnablePassthrough.assign({ draft: write }),
    refine,
  ])
}

/**
 * JSON tasks (import, tailoring, building from the bank) need exact structure, so they skip the editing steps and go
 * straight to the writer, which has the same fallback behind it.
 */
export function buildJsonChain(deps: ChainDeps, options: ChatOptions = {}): Runnable<{ messages: ChatMessage[] }, string> {
  const writer = fallbackModel('writer', deps.writer, { temperature: options.temperature ?? 0.3, json: true })
  return RunnableLambda.from(async ({ messages }: { messages: ChatMessage[] }, config) =>
    new StringOutputParser().invoke(await writer.invoke(messages.map(toLc), config)),
  )
}
