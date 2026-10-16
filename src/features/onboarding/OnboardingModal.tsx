import { useNavigate } from 'react-router-dom'
import { Modal } from '@/components/ui'
import { useSettings } from '@/store/settings'

export function OnboardingModal() {
  const onboarded = useSettings((s) => s.onboarded)
  const update = useSettings((s) => s.update)
  const navigate = useNavigate()
  if (onboarded) return null
  const done = () => update({ onboarded: true })
  return (
    <Modal title="Welcome to Resume AI" onClose={done}>
      <p className="mb-3 text-sm text-ink-600 dark:text-ink-300">
        Resume AI is free: your resumes stay in this browser, and AI answers come from Groq, OpenRouter and Inception through this site&apos;s server. There is nothing to install. Open Settings to test the connection.
      </p>
      <p className="mt-3 rounded-lg bg-brand-50 p-2.5 text-xs text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">
        The AI only rewords and reprioritises facts you provide. It is told never to invent employers, titles, dates, degrees, metrics or skills.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={done}>
          Skip for now
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            done()
            navigate('/settings')
          }}
        >
          Open Settings
        </button>
      </div>
    </Modal>
  )
}
