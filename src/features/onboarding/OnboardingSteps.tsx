function Code({ children }: { children: string }) {
  return <code className="block overflow-x-auto rounded bg-ink-100 px-2 py-1 font-mono text-xs dark:bg-ink-800">{children}</code>
}

/** Steps for the optional local Ollama mode. Cloud models need no setup from users: keys live on the server. */
export function OnboardingSteps() {
  return (
    <ol className="list-decimal space-y-3 pl-5 text-sm">
      <li>
        <strong>Install Ollama</strong> from{' '}
        <a className="underline" href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">
          ollama.com/download
        </a>
        .
      </li>
      <li>
        <strong>Pull a model:</strong>
        <Code>ollama pull llama3.1:8b</Code>
      </li>
      <li>
        <strong>Allow this page to talk to Ollama</strong> by setting <code>OLLAMA_ORIGINS</code> to this app&apos;s address, then restart Ollama.
        <Code>{'setx OLLAMA_ORIGINS "http://localhost:5173"'}</Code>
      </li>
      <li>
        Choose <strong>Ollama (local, advanced)</strong> above and press <strong>Test connection</strong>.
      </li>
    </ol>
  )
}
