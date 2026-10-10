import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { useAuth } from '@/lib/auth/store'
import { loadServerProviders } from '@/lib/llm'
import { startFirestoreSync } from '@/lib/sync/engine'
import { Layout } from '@/components/Layout'
import { CoverLetterPage } from '@/features/cover/CoverLetterPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { ImportPage } from '@/features/import/ImportPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { TrackerPage } from '@/features/tracker/TrackerPage'
import { WorkspacePage } from '@/features/workspace/WorkspacePage'
import { EmptyState } from '@/components/ui'
import { Link } from 'react-router-dom'

export function App() {
  const uid = useAuth((s) => s.user?.uid ?? null)
  const email = useAuth((s) => s.user?.email ?? '')
  useEffect(() => {
    void loadServerProviders()
    void useAuth.getState().load()
  }, [])
  // While signed in, keep this device and the cloud copy in sync.
  useEffect(() => {
    if (!uid) return
    let stop: (() => void) | undefined
    let cancelled = false
    void startFirestoreSync(uid, email)
      .then((s) => (cancelled ? s() : (stop = s)))
      .catch(() => undefined)
    return () => {
      cancelled = true
      stop?.()
    }
  }, [uid, email])
  return (
    <>
      {/* <OnboardingModal /> is intentionally not mounted: hosted users share the owner's API key. */}
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="resume/:id" element={<WorkspacePage />} />
          <Route path="cover" element={<CoverLetterPage />} />
          <Route path="tracker" element={<TrackerPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route
            path="*"
            element={
              <EmptyState title="Page not found" action={<Link to="/" className="btn-primary">Go home</Link>}>
                That page does not exist.
              </EmptyState>
            }
          />
        </Route>
      </Routes>
    </>
  )
}
