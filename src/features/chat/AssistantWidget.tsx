import type { Resume } from '@/types/resume'
import { ASSISTANT_NAME } from '@/lib/assistant'
import { ChatPanel } from './ChatPanel'

/**
 * The assistant's chat window. On wide screens it opens to the left of the resume preview and follows the page as you
 * scroll; on narrow screens it is a sheet at the bottom of the screen.
 */
export function AssistantWidget({ resume, onClose }: { resume: Resume; onClose: () => void }) {
  return (
    <div className="no-print fixed inset-x-3 bottom-3 z-30 lg:absolute lg:inset-auto lg:right-full lg:top-0 lg:mr-3 lg:h-full lg:w-[26rem]">
      <aside
        aria-label={`${ASSISTANT_NAME}, your resume assistant`}
        className="flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl dark:border-ink-700 dark:bg-ink-900 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]"
      >
        <header className="flex items-center gap-3 border-b border-ink-200 px-4 py-3 dark:border-ink-700">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-spark-500 text-ink-950" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold leading-tight">{ASSISTANT_NAME}</h2>
            <p className="text-xs text-ink-500 dark:text-ink-400">Your resume assistant</p>
          </div>
          <button type="button" className="btn-ghost btn-sm" onClick={onClose} aria-label={`Close ${ASSISTANT_NAME}`}>
            ✕
          </button>
        </header>
        <div className="overflow-y-auto p-3">
          <ChatPanel resume={resume} embedded />
        </div>
      </aside>
    </div>
  )
}
