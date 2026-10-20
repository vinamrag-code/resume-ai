import { useState } from 'react'
import { Logo } from '@/components/ui'
import { AuthModal } from './AuthModal'
import type { AuthMode } from './AuthModal'

const FEATURES = [
  { title: 'Score it honestly', text: 'A transparent ATS score from keywords, semantic match, structure and bullet quality, never a black box.' },
  { title: 'Tailor in one click', text: 'See every suggested change as a before and after, and accept only what is true for you.' },
  { title: 'Talk to an editor', text: 'An agent that asks the right questions, then edits your content and layout.' },
  { title: 'Track every application', text: 'A Kanban board linking each job to its resume and cover letter.' },
]

/** Public front door: nothing else in the app is reachable until the visitor signs in. */
export function LandingPage() {
  const [modal, setModal] = useState<AuthMode | null>(null)
  return (
    <div className="min-h-screen overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white dark:from-ink-900 dark:via-ink-950 dark:to-ink-950">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo />
          <span>Resume AI</span>
        </div>
        <nav aria-label="Account" className="flex items-center gap-2">
          <button type="button" className="btn-ghost" onClick={() => setModal('login')}>
            Log in
          </button>
          <button type="button" className="btn-primary" onClick={() => setModal('signup')}>
            Sign up free
          </button>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 md:grid-cols-2 md:pt-20">
          <div className="animate-fade-up">
            <p className="mb-3 inline-block rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800 dark:bg-brand-900/50 dark:text-brand-100">Free and truthful</p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">A resume that gets read, built without inventing a thing.</h1>
            <p className="mt-4 max-w-lg text-lg text-ink-600 dark:text-ink-300">Import your resume, see how it scores against a job, and let AI reword what you already have. It never makes up employers, dates or skills.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" className="btn-primary px-5 py-2.5 text-base" onClick={() => setModal('signup')}>
                Create your account
              </button>
              <button type="button" className="btn-secondary px-5 py-2.5 text-base" onClick={() => setModal('login')}>
                I already have one
              </button>
            </div>
            <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">Your resumes stay in your browser and sync to your private account.</p>
          </div>

          <div className="relative mx-auto w-full max-w-sm animate-fade-up [animation-delay:150ms]" aria-hidden="true">
            <div className="animate-float rounded-2xl border border-ink-200 bg-white p-5 shadow-xl dark:border-ink-700 dark:bg-ink-900">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="h-3 w-28 rounded bg-ink-800 dark:bg-ink-100" />
                  <div className="mt-1.5 h-2 w-40 rounded bg-ink-300 dark:bg-ink-600" />
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-brand-500 text-lg font-bold text-brand-700 dark:text-brand-300">92</div>
              </div>
              {[90, 74, 82, 60].map((w, i) => (
                <div key={i} className="mt-2.5">
                  <div className="h-2 rounded bg-ink-200 dark:bg-ink-700" style={{ width: `${w}%` }} />
                </div>
              ))}
              <div className="mt-4 rounded-lg bg-brand-50 p-2.5 text-xs text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">✓ Built a React dashboard used by 40 analysts every day</div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20" aria-label="Features">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <li key={f.title} className="card animate-fade-up" style={{ animationDelay: `${250 + i * 90}ms` }}>
                <h2 className="text-base font-semibold">{f.title}</h2>
                <p className="mt-1.5 text-sm text-ink-600 dark:text-ink-300">{f.text}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-ink-200 px-4 py-4 text-center text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400">Sign in to use Resume AI.</footer>
      {modal && <AuthModal initialMode={modal} onClose={() => setModal(null)} />}
    </div>
  )
}
