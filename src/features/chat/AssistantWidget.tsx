import { IconSparkles } from '@tabler/icons-react'
import type { Resume } from '@/types/resume'
import { ASSISTANT_NAME } from '@/lib/assistant'
import { ChatPanel } from './ChatPanel'

/**
 * The assistant's chat as a docked panel: a fixed-height column to the right of the resume preview on wide screens (only the chat scrolls), and below the preview on narrow ones.
 */
export function AssistantWidget({ resume }: { resume: Resume }) {
  return (
    <div className="no-print min-w-0 lg:h-full lg:min-h-0">
      <aside
        aria-label={`${ASSISTANT_NAME}, your resume assistant`}
        className="flex h-[36rem] max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm dark:border-ink-700 dark:bg-ink-900 lg:h-full lg:max-h-none"
      >
        <header className="flex items-center gap-3 border-b border-ink-200 px-4 py-3 dark:border-ink-700">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-spark-500 text-ink-950" aria-hidden="true">
            <IconSparkles className="h-5 w-5" stroke={2} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold leading-tight">{ASSISTANT_NAME}</h2>
            <p className="text-xs text-ink-500 dark:text-ink-400">Your resume assistant</p>
          </div>
        </header>
        <div className="min-h-0 flex-1 p-3">
          <ChatPanel resume={resume} embedded />
        </div>
      </aside>
    </div>
  )
}
