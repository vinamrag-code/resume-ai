const ORIGINS = 'http://localhost:5173'

function Code({ children }: { children: string }) {
  return <code className="block overflow-x-auto rounded bg-ink-100 px-2 py-1 font-mono text-xs dark:bg-ink-800">{children}</code>
}

export function OnboardingSteps() {
  return (
    <ol className="list-decimal space-y-3 pl-5 text-sm">
      <li>
        <strong>Install Ollama</strong> from{' '}
        <a className="underline" href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">
          ollama.com/download
        </a>
        . It runs the AI on your own computer, for free.
      </li>
      <li>
        <strong>Pull a model.</strong> A good starting point:
        <Code>ollama pull llama3.1:8b</Code>
      </li>
      <li>
        <strong>Allow this page to talk to Ollama.</strong> Set <code>OLLAMA_ORIGINS</code> to this app&apos;s address, then restart Ollama.
        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">Windows PowerShell:</p>
        <Code>{`setx OLLAMA_ORIGINS "${ORIGINS}"`}</Code>
        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">macOS / Linux:</p>
        <Code>{`OLLAMA_ORIGINS=${ORIGINS} ollama serve`}</Code>
      </li>
      <li>
        <strong>Test the connection</strong> in Settings. If it fails, make sure Ollama is running and the model name matches an installed model.
      </li>
    </ol>
  )
}
