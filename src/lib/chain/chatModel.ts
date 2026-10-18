import { AIMessage, AIMessageChunk } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { BaseChatModelCallOptions, BaseChatModelParams } from '@langchain/core/language_models/chat_models'
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { ChatGenerationChunk } from '@langchain/core/outputs'
import type { ChatResult } from '@langchain/core/outputs'
import type { Runnable } from '@langchain/core/runnables'
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base'
import { LlmError } from '@/lib/llm/types'
import type { ChatMessage, LlmClient } from '@/lib/llm/types'

export interface LlmChatModelOptions extends BaseChatModelCallOptions {
  temperature?: number
  json?: boolean
}

const ROLES: Record<string, ChatMessage['role']> = { system: 'system', human: 'user', ai: 'assistant' }

function toChat(messages: BaseMessage[]): ChatMessage[] {
  return messages.map((m) => ({ role: ROLES[m.getType()] ?? 'user', content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }))
}

/**
 * A LangChain chat model over any `LlmClient`. The client already talks to the server proxy (keys stay on the server),
 * maps provider errors and handles fallback between providers, so LangChain gets all of that for free.
 */
export class LlmChatModel extends BaseChatModel<LlmChatModelOptions> {
  constructor(private readonly client: LlmClient, private readonly label: string, params: BaseChatModelParams = {}) {
    super(params)
  }

  _llmType(): string {
    return `resume-ai-${this.label}`
  }

  async _generate(messages: BaseMessage[], options: this['ParsedCallOptions']): Promise<ChatResult> {
    const text = await this.client.chat(toChat(messages), { signal: options.signal, temperature: options.temperature, json: options.json })
    return { generations: [{ text, message: new AIMessage(text) }] }
  }

  async *_streamResponseChunks(messages: BaseMessage[], options: this['ParsedCallOptions'], runManager?: CallbackManagerForLLMRun): AsyncGenerator<ChatGenerationChunk> {
    // The client pushes tokens through a callback; turn that into an async iterator.
    const queue: string[] = []
    let wake: (() => void) | null = null
    let done = false
    let failure: unknown = null
    const run = this.client
      .stream(toChat(messages), (t) => {
        queue.push(t)
        wake?.()
      }, { signal: options.signal, temperature: options.temperature, json: options.json })
      .catch((err: unknown) => {
        failure = err
      })
      .finally(() => {
        done = true
        wake?.()
      })
    for (;;) {
      const token = queue.shift()
      if (token !== undefined) {
        const chunk = new ChatGenerationChunk({ text: token, message: new AIMessageChunk(token) })
        yield chunk
        await runManager?.handleLLMNewToken(token)
        continue
      }
      if (done) break
      await new Promise<void>((resolve) => {
        wake = resolve
      })
      wake = null
    }
    await run
    if (failure) throw failure
  }
}

const NO_PROVIDER = new LlmError('auth', 'No AI provider is available. The server needs a Groq, Inception or OpenRouter API key (GROQ_API_KEY / INCEPTION_API_KEY / OPENROUTER_API_KEY).')

/** Stands in when a step has no provider at all, so the failure reads as a clear message instead of a crash. */
const unavailable: LlmClient = {
  chat: () => Promise.reject(NO_PROVIDER),
  stream: () => Promise.reject(NO_PROVIDER),
  testConnection: async () => ({ ok: false, models: [], message: NO_PROVIDER.message }),
}

export type ChatRunnable = Runnable<BaseLanguageModelInput, AIMessageChunk>

/**
 * One chat model per provider, in order, chained with LangChain's `withFallbacks`: if the first fails (before any
 * text has streamed) the next one answers. Cancellation is never retried. If every provider fails, the first error
 * is thrown, which is the preferred provider's problem and the one worth fixing.
 */
export function fallbackModel(label: string, clients: LlmClient[], callOptions: Partial<LlmChatModelOptions> = {}): ChatRunnable {
  const [first, ...rest] = (clients.length ? clients : [unavailable]).map((c) => new LlmChatModel(c, label).withConfig(callOptions) as ChatRunnable)
  return rest.length ? first!.withFallbacks({ fallbacks: rest }) : first!
}

/** A cancelled request always surfaces as the app's own `aborted` error, whichever layer noticed it first. */
export function normalizeAbort(err: unknown, signal?: AbortSignal): unknown {
  return signal?.aborted && !(err instanceof LlmError && err.kind === 'aborted') ? new LlmError('aborted', 'Request cancelled.') : err
}
