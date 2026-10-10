import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { setLlmClient } from '@/lib/llm'
import type { ChatMessage, LlmClient } from '@/lib/llm'

export interface MockLlm extends LlmClient {
  calls: ChatMessage[][]
}

/** Scripted LLM: each call (chat or stream) returns the next reply, repeating the last one. */
export function mockLlm(replies: (string | Error)[]): MockLlm {
  const calls: ChatMessage[][] = []
  const next = (messages: ChatMessage[]): string => {
    calls.push(messages)
    const r = replies[Math.min(calls.length - 1, replies.length - 1)]
    if (r instanceof Error) throw r
    return r ?? ''
  }
  const llm: MockLlm = {
    calls,
    chat: async (m) => next(m),
    stream: async (m, onToken) => {
      const full = next(m)
      for (const word of full.match(/\S+\s*/g) ?? []) onToken(word)
      return full
    },
    testConnection: async () => ({ ok: true, models: ['mock'], message: 'ok' }),
  }
  setLlmClient(llm)
  return llm
}

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname + loc.search}</div>
}

/** Renders `ui` at `path` with a routes table that also exposes the current location. */
export function renderAt(ui: ReactElement, { path = '/', route = '/' }: { path?: string; route?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={ui} />
        <Route path="*" element={<div>other page</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}
