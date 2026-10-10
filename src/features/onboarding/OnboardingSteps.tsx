function Code({ children }: { children: string }) {
  return <code className="block overflow-x-auto rounded bg-ink-100 px-2 py-1 font-mono text-xs dark:bg-ink-800">{children}</code>
}

export function OnboardingSteps() {
  return (
    <ol className="list-decimal space-y-3 pl-5 text-sm">
      <li>
        <strong>Get a free API key</strong> from{' '}
        <a className="underline" href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">
          Groq
        </a>{' '}
        (fast, used first) and, ideally, from{' '}
        <a className="underline" href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">
          OpenRouter
        </a>{' '}
        (fallback and fact-checker). One key is enough to start.
      </li>
      <li>
        <strong>Add the keys to the app.</strong> In the project folder copy <code>.env.example</code> to <code>.env</code> and fill in:
        <Code>{'VITE_GROQ_API_KEY=your-key\nVITE_OPENROUTER_API_KEY=your-key'}</Code>
        Then restart <code>npm run dev</code>.
      </li>
      <li>
        <strong>Test the connection</strong> in Settings. Models are chosen automatically (Auto mode).
      </li>
      <li className="text-ink-600 dark:text-ink-300">
        <strong>Optional, advanced:</strong> prefer fully local AI? Install{' '}
        <a className="underline" href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">
          Ollama
        </a>
        , run <code>ollama pull llama3.1:8b</code>, set <code>OLLAMA_ORIGINS</code> to this app&apos;s address, and choose &ldquo;Ollama&rdquo; in Settings.
      </li>
    </ol>
  )
}
