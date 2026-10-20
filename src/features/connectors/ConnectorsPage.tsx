import { EmptyState } from '@/components/ui'

/** Placeholder for the next phase: connecting outside services (mail, job boards) to bring in jobs and application updates. */
export function ConnectorsPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Connectors</h1>
      <EmptyState title="Coming soon">Connect your other tools to bring in jobs and application updates. Nothing is connected yet.</EmptyState>
    </div>
  )
}
