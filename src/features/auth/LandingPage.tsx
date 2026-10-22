import { IconActivity, IconArrowRight, IconCheck, IconDownload, IconLayoutKanban, IconMessageCircle, IconMoon, IconNotes, IconSun, IconWand } from '@tabler/icons-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useApplyTheme } from '@/components/Layout'
import { Logo } from '@/components/ui'
import { useAuth } from '@/lib/auth/store'
import { useSettings } from '@/store/settings'
import { AuthModal } from './AuthModal'
import type { AuthMode } from './AuthModal'

const FEATURES = [
  { title: 'Score it honestly', text: 'A transparent ATS score from keywords, semantic match, structure and bullet quality, never a black box.', icon: IconActivity },
  { title: 'Tailor in one click', text: 'See every suggested change as a before and after, and accept only what is true for you.', icon: IconWand },
  { title: 'Talk to an editor', text: 'Sage asks the right questions, then edits your content and layout while you watch.', icon: IconMessageCircle },
  { title: 'Track every application', text: 'A Kanban board linking each job to the exact resume and cover letter you sent.', icon: IconLayoutKanban },
  { title: 'Cover letters that fit', text: 'Draft a letter from your real experience and the job description, then edit it freely.', icon: IconNotes },
  { title: 'Export anywhere', text: 'Clean, ATS-safe PDF and DOCX with templates you can restyle in a click.', icon: IconDownload },
]

const STEPS = [
  { n: '01', title: 'Import', text: 'Upload a PDF or DOCX, or paste your resume. Nothing to retype.' },
  { n: '02', title: 'Score', text: 'Paste a job description and see exactly where you match and where you fall short.' },
  { n: '03', title: 'Tailor', text: 'Review each suggested rewrite as a diff. Accept what is true, reject the rest.' },
  { n: '04', title: 'Apply', text: 'Export, track the application and write the cover letter in the same place.' },
]

const STATS = [
  { value: '0', label: 'invented facts, ever' },
  { value: '4', label: 'signals in every ATS score' },
  { value: '100%', label: 'of edits need your approval' },
  { value: 'Free', label: 'to start, no card' },
]

const FAQ = [
  { q: 'Will the AI make things up?', a: 'No. Tailoring may only reword and reprioritise what is already in your resume. Employers, titles, dates, degrees, metrics and skills are never invented, and every change is a diff you accept or reject.' },
  { q: 'Where is my data stored?', a: 'Your resumes live in your browser. If you sign in they also sync to your private account. AI requests go through our server, which keeps the API keys.' },
  { q: 'How is the ATS score calculated?', a: 'Deterministically, from keyword coverage, semantic similarity, structure and bullet quality. The same resume and job always give the same score, and you can see why.' },
  { q: 'Does it work with scanned PDFs?', a: 'Not yet. Text-based PDFs and DOCX files import cleanly. For a scanned file, paste the text instead.' },
]

const TICKER = ['Keyword match', 'Semantic score', 'Weak bullet finder', 'Diff review', 'Cover letters', 'Kanban tracker', 'PDF export', 'DOCX export', 'Experience bank', 'Sage assistant']


function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">{children}</p>
}

function ThemeToggle() {
  const theme = useSettings((s) => s.theme)
  const update = useSettings((s) => s.update)
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button type="button" className="btn-ghost h-9 w-9 rounded-full p-0" onClick={() => update({ theme: next })} aria-label={`Theme: ${theme}. Switch to ${next}`}>
      {theme === 'dark' ? <IconMoon className="h-5 w-5" stroke={2} aria-hidden="true" /> : <IconSun className="h-5 w-5" stroke={2} aria-hidden="true" />}
    </button>
  )
}

/** A static, decorative product shot: resume, live score and a reviewable diff. */
function ProductShot() {
  return (
    <div className="relative mx-auto w-full max-w-xl" aria-hidden="true">
      <div className="absolute -inset-6 -z-10 animate-glow rounded-[2rem] bg-brand-500/25 blur-3xl dark:bg-brand-500/30" />
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl shadow-brand-900/20 dark:border-ink-700 dark:bg-ink-900">
        <div className="flex items-center gap-1.5 border-b border-ink-100 bg-ink-50 px-4 py-2.5 dark:border-ink-800 dark:bg-ink-950">
          <span className="h-2.5 w-2.5 rounded-full bg-ink-300 dark:bg-ink-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-300 dark:bg-ink-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-300 dark:bg-ink-700" />
          <span className="ml-3 rounded-md bg-white px-3 py-0.5 text-[10px] text-ink-400 dark:bg-ink-900">Senior Frontend Engineer · Tailored</span>
        </div>
        <div className="grid grid-cols-5 gap-4 p-5">
          <div className="col-span-3 space-y-2.5">
            <div className="h-3 w-32 rounded bg-ink-800 dark:bg-ink-100" />
            <div className="h-2 w-44 rounded bg-ink-300 dark:bg-ink-600" />
            <div className="pt-2 text-[10px] font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">Experience</div>
            {[92, 78, 85, 64].map((w, i) => (
              <div key={i} className="h-2 rounded bg-ink-200 dark:bg-ink-700" style={{ width: `${w}%` }} />
            ))}
            <div className="space-y-1 rounded-lg border border-brand-200 bg-brand-50 p-2.5 text-[11px] leading-snug dark:border-brand-500/30 dark:bg-brand-500/10">
              <p className="text-red-600 line-through decoration-red-400/70 dark:text-red-300">Worked on the dashboard team</p>
              <p className="font-medium text-brand-800 dark:text-brand-200">Built a React dashboard used daily by 40 analysts</p>
            </div>
          </div>
          <div className="col-span-2 flex flex-col items-center gap-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-950">
            <div className="relative h-20 w-20">
              <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" className="stroke-ink-200 dark:stroke-ink-800" />
                <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" strokeLinecap="round" strokeDasharray="97.4" strokeDashoffset="8" className="stroke-brand-500" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xl font-bold">92</span>
            </div>
            <p className="text-[10px] font-medium text-ink-500 dark:text-ink-400">ATS match</p>
            {[['Keywords', 94], ['Semantic', 88], ['Structure', 96]].map(([l, v]) => (
              <div key={l} className="w-full">
                <div className="mb-0.5 flex justify-between text-[9px] text-ink-500 dark:text-ink-400">
                  <span>{l}</span>
                  <span>{v}</span>
                </div>
                <div className="h-1 rounded-full bg-ink-200 dark:bg-ink-800">
                  <div className="h-1 rounded-full bg-brand-500" style={{ width: `${v}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-3 animate-float rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-xs shadow-xl dark:border-ink-700 dark:bg-ink-900 sm:-left-8">
        <span className="font-semibold text-brand-600 dark:text-brand-400">Sage</span> · “Add the team size you led here?”
      </div>
    </div>
  )
}

/** Public front door. Signed-out visitors see only this; signed-in ones get a way back into the app. */
export function LandingPage() {
  useApplyTheme()
  const [modal, setModal] = useState<AuthMode | null>(null)
  const loaded = useAuth((s) => s.loaded)
  const required = useAuth((s) => s.required)
  const user = useAuth((s) => s.user)
  const canEnter = loaded && (!required || !!user?.emailVerified)
  const cta = (mode: AuthMode, label: string, big = false) =>
    canEnter ? (
      <Link to="/" className={`btn-primary ${big ? 'px-6 py-3 text-base' : ''}`}>
        Open the app
      </Link>
    ) : (
      <button type="button" className={`btn-primary ${big ? 'px-6 py-3 text-base' : ''}`} onClick={() => setModal(mode)}>
        {label}
      </button>
    )
  return (
    <div className="relative min-h-screen overflow-x-clip bg-white text-ink-900 dark:bg-ink-950 dark:text-ink-100">
      <div aria-hidden="true" className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-[40rem]" />
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[-12rem] h-[34rem] w-[60rem] -translate-x-1/2 animate-glow rounded-full bg-brand-500/20 blur-[120px] dark:bg-brand-600/30" />

      <header className="sticky top-0 z-30 border-b border-transparent bg-white/70 backdrop-blur-xl dark:bg-ink-950/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo />
            <span>Resume AI</span>
          </div>
          <nav aria-label="Sections" className="hidden items-center gap-6 text-sm text-ink-600 dark:text-ink-300 md:flex">
            <a href="#features" className="hover:text-brand-600 dark:hover:text-brand-300">Features</a>
            <a href="#how" className="hover:text-brand-600 dark:hover:text-brand-300">How it works</a>
            <a href="#truth" className="hover:text-brand-600 dark:hover:text-brand-300">Truthfulness</a>
            <a href="#faq" className="hover:text-brand-600 dark:hover:text-brand-300">FAQ</a>
          </nav>
          <nav aria-label="Account" className="flex items-center gap-2">
            <ThemeToggle />
            {canEnter ? (
              <Link to="/" className="btn-primary">
                Open the app
              </Link>
            ) : (
              <>
                <button type="button" className="btn-ghost" onClick={() => setModal('login')}>
                  Log in
                </button>
                <button type="button" className="btn-primary" onClick={() => setModal('signup')}>
                  Sign up free
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="relative">
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-24 pt-14 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
          <div className="animate-fade-up">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Free and truthful AI resume builder
            </p>
            <h1 className="text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              A resume that gets read. <span className="gradient-text">Without inventing a thing.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-600 dark:text-ink-300">
              Import your resume, see how it scores against a job, and let AI reword what you already have. It never makes up employers, dates or skills, and you approve every change.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {cta('signup', 'Get started free', true)}
              {!canEnter && (
                <button type="button" className="btn-secondary px-6 py-3 text-base" onClick={() => setModal('login')}>
                  I already have an account
                </button>
              )}
              <a href="#how" className="btn-ghost gap-1.5 px-4 py-3 text-base">
                See how it works <IconArrowRight className="h-4 w-4" stroke={2} aria-hidden="true" />
              </a>
            </div>
            <p className="mt-4 text-xs text-ink-500 dark:text-ink-400">Your resumes stay in your browser and sync to your private account.</p>
          </div>
          <div className="animate-fade-up [animation-delay:150ms]">
            <ProductShot />
          </div>
        </section>

        <section aria-label="Capabilities" className="border-y border-ink-200 bg-ink-50/60 py-4 dark:border-ink-800 dark:bg-ink-900/40">
          <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_10%,#000_90%,transparent)]" aria-hidden="true">
            <div className="flex w-max animate-marquee gap-10 whitespace-nowrap text-sm font-medium text-ink-500 dark:text-ink-400">
              {[...TICKER, ...TICKER].map((t, i) => (
                <span key={i} className="flex items-center gap-10">
                  {t}
                  <span className="h-1 w-1 rounded-full bg-brand-500" />
                </span>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24" aria-label="Features">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <Eyebrow>Everything in one place</Eyebrow>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">From first draft to sent application</h2>
            <p className="mt-3 text-ink-600 dark:text-ink-300">One workspace for the resume, the job, the letter and the follow-up.</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="group relative overflow-hidden rounded-2xl border border-ink-200 bg-white p-6 transition duration-200 hover:-translate-y-1 hover:border-brand-400 hover:shadow-xl hover:shadow-brand-500/10 dark:border-ink-800 dark:bg-ink-900/60 dark:hover:border-brand-500/60">
                <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-500/0 blur-2xl transition group-hover:bg-brand-500/20" />
                <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                  <f.icon className="h-5 w-5" stroke={1.8} aria-hidden="true" />
                </span>
                <h3 className="text-base font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-ink-600 dark:text-ink-300">{f.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="how" className="scroll-mt-20 border-y border-ink-200 bg-ink-50/60 py-24 dark:border-ink-800 dark:bg-ink-900/30">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <Eyebrow>How it works</Eyebrow>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Four steps to a sharper application</h2>
            </div>
            <ol className="grid gap-4 md:grid-cols-4">
              {STEPS.map((s) => (
                <li key={s.n} className="relative rounded-2xl border border-ink-200 bg-white p-6 dark:border-ink-800 dark:bg-ink-950">
                  <span className="gradient-text text-3xl font-bold">{s.n}</span>
                  <h3 className="mt-3 text-base font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-ink-600 dark:text-ink-300">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="truth" className="mx-auto grid max-w-6xl scroll-mt-20 items-center gap-10 px-4 py-24 lg:grid-cols-2">
          <div>
            <Eyebrow>Truthful by design</Eyebrow>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">AI that edits your words, not your history</h2>
            <p className="mt-4 text-ink-600 dark:text-ink-300">Recruiters check. So we built the guard rails in: the assistant is forbidden from adding anything you did not already tell it, and the app verifies every suggestion against your real resume before showing it.</p>
            <ul className="mt-6 space-y-3 text-sm">
              {['Never invents employers, titles, dates or degrees', 'Never makes up metrics or skills', 'Every edit is a diff you accept or reject', 'Asks you a question when it needs a missing fact'].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
                    <IconCheck className="h-3 w-3" stroke={3.5} aria-hidden="true" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <dl className="grid grid-cols-2 gap-4">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-2xl border border-ink-200 bg-white p-6 dark:border-ink-800 dark:bg-ink-900/60">
                <dt className="sr-only">{s.label}</dt>
                <dd className="gradient-text text-4xl font-bold">{s.value}</dd>
                <p className="mt-1 text-sm text-ink-600 dark:text-ink-300" aria-hidden="true">{s.label}</p>
              </div>
            ))}
          </dl>
        </section>

        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-24">
          <div className="mb-10 text-center">
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Questions, answered</h2>
          </div>
          <div className="space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-xl border border-ink-200 bg-white p-4 open:border-brand-400 dark:border-ink-800 dark:bg-ink-900/60 dark:open:border-brand-500/60">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold">
                  {f.q}
                  <span className="text-brand-500 transition group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className="mt-3 text-sm text-ink-600 dark:text-ink-300">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-ink-950 px-6 py-16 text-center text-white shadow-2xl shadow-brand-900/30">
            <div aria-hidden="true" className="grid-bg absolute inset-0 opacity-40" />
            <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">Ready for a resume you can stand behind?</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-brand-100">Import yours in under a minute and see your score.</p>
            <div className="relative mt-8 flex justify-center">
              {canEnter ? (
                <Link to="/" className="btn bg-white px-6 py-3 text-base text-brand-700 hover:bg-brand-50">
                  Open the app
                </Link>
              ) : (
                <button type="button" className="btn bg-white px-6 py-3 text-base text-brand-700 hover:bg-brand-50" onClick={() => setModal('signup')}>
                  Create a free account
                </button>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-200 px-4 py-6 text-center text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400">
        {canEnter ? 'Resume AI · truthful by design.' : 'Sign in to use Resume AI.'}
      </footer>
      {modal && <AuthModal initialMode={modal} onClose={() => setModal(null)} />}
    </div>
  )
}
