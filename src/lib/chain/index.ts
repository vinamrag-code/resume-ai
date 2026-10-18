import { StringOutputParser } from '@langchain/core/output_parsers'
import type { ChatMessage, ChatOptions, ConnectionStatus, LlmClient } from '@/lib/llm/types'
import { fallbackModel, normalizeAbort } from './chatModel'
import { retrieveContext } from '@/lib/rag/retrieve'
import { buildChain, buildJsonChain, toLc } from './pipeline'
import type { ChainDeps } from './pipeline'

export { fallbackModel } from './chatModel'
export { buildChain, buildJsonChain, withPrompt } from './pipeline'
export type { ChainDeps } from './pipeline'

/** Default retrieval: the user's resumes, job descriptions and imported files, from the IndexedDB vector store. */
const defaultRetrieve: ChainDeps['retrieve'] = (query, alreadyIn) => retrieveContext(query, { alreadyIn })

/**
 * The app's LLM as a LangChain pipeline behind the usual `LlmClient` interface, so every feature gets it without changes.
 * Free-form requests go retrieve -> improve prompt -> write -> polish; JSON requests go straight to the writer.
 */
export class ChainLlmClient implements LlmClient {
  constructor(private readonly deps: Omit<ChainDeps, 'retrieve'> & Partial<Pick<ChainDeps, 'retrieve'>>) {}

  private get full(): ChainDeps {
    return { retrieve: defaultRetrieve, ...this.deps }
  }

  async stream(messages: ChatMessage[], onToken: (token: string) => void, options?: ChatOptions): Promise<string> {
    const chain = options?.json ? buildJsonChain(this.full, options) : buildChain(this.full, options)
    return collect(() => chain.stream({ messages }, { signal: options?.signal }), onToken, options?.signal)
  }

  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    return this.stream(messages, () => undefined, options)
  }

  async testConnection(): Promise<ConnectionStatus> {
    return testAll([...this.deps.writer, ...this.deps.editor])
  }
}

async function testAll(clients: LlmClient[]): Promise<ConnectionStatus> {
  if (clients.length === 0) return { ok: false, models: [], message: 'No AI provider is available.' }
  const results = await Promise.all(clients.map((c) => c.testConnection()))
  return { ok: results.some((r) => r.ok), models: results.flatMap((r) => r.models), message: results.map((r) => r.message).join(' ') }
}

/** Run a LangChain stream, pass tokens on as they arrive, and return the whole text. */
async function collect(start: () => Promise<AsyncIterable<string>>, onToken: (t: string) => void, signal?: AbortSignal): Promise<string> {
  let full = ''
  try {
    for await (const token of await start()) {
      full += token
      onToken(token)
    }
  } catch (err) {
    throw normalizeAbort(err, signal)
  }
  return full
}

/**
 * Providers tried in order with LangChain's `withFallbacks`, behind the usual `LlmClient` interface. Used for the
 * fact-checker and whenever Inception is not set up, where the app talks to Groq/OpenRouter directly.
 */
export class LangChainClient implements LlmClient {
  constructor(private readonly clients: LlmClient[]) {}

  stream(messages: ChatMessage[], onToken: (token: string) => void, options?: ChatOptions): Promise<string> {
    const chain = fallbackModel('llm', this.clients, { temperature: options?.temperature, json: options?.json }).pipe(new StringOutputParser())
    return collect(() => chain.stream(messages.map(toLc), { signal: options?.signal }), onToken, options?.signal)
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    const chain = fallbackModel('llm', this.clients, { temperature: options?.temperature, json: options?.json }).pipe(new StringOutputParser())
    try {
      return await chain.invoke(messages.map(toLc), { signal: options?.signal })
    } catch (err) {
      throw normalizeAbort(err, options?.signal)
    }
  }

  testConnection(): Promise<ConnectionStatus> {
    return testAll(this.clients)
  }
}
