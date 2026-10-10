import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { loadServerProviders } from '@/lib/llm'
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
  useEffect(() => {
    void loadServerProviders()
  }, [])
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
