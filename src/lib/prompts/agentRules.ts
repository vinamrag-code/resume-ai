import rules from './AGENT_RULES.md?raw'

const MARKER = '<!-- editing -->'
const [core = '', editing = ''] = rules.split(MARKER)

/** Rules every agent follows (scope, completeness, permission, honesty). The source of truth is AGENT_RULES.md. Edit with care. */
export const AGENT_RULES = core.trim()

/** The core rules plus the ones for agents that propose resume edits (the chat assistant). */
export const EDITING_AGENT_RULES = `${AGENT_RULES}\n${editing.trim()}`
