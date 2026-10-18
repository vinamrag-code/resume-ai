import { ChatPromptTemplate } from '@langchain/core/prompts'

/**
 * Step 1 (Groq): turn the user's latest message into a better prompt. It does NOT rewrite the message itself (that
 * can hold a whole resume or job post that must reach the writer untouched); it adds a short brief that sharpens it.
 */
export const rewritePrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a prompt engineer. Another model will answer the user's latest message. Read the standing instructions, the recent conversation, the latest message and the background passages from the user's saved documents, then write a brief that helps that model answer well.

The brief must:
- state in one or two sentences what the user actually wants, resolving references like "it" or "that bullet" using the conversation;
- list the specific constraints and details that matter (role, tone, length, what must stay unchanged);
- quote only the background passages that are directly useful (omit the section if none are);
- never invent facts, employers, dates, numbers or skills, and never add requirements the user did not ask for.

Write at most 200 words of plain text. Output only the brief, with no preamble.`,
  ],
  [
    'human',
    `STANDING INSTRUCTIONS:
{system}

RECENT CONVERSATION:
{history}

LATEST USER MESSAGE:
{message}

BACKGROUND PASSAGES FROM THE USER'S SAVED DOCUMENTS:
{context}`,
  ],
])

/** Step 3 (Groq): polish Inception's draft without changing what it says or the format it uses. */
export const refinePrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `{system}

---
You are the final editor. A draft answer to the user's request is below. Return the best final version of it:
- fix mistakes, vagueness, filler and awkward wording; follow every instruction above;
- do not add any fact, number, employer, date or skill that is not in the request or the draft;
- keep the draft's format exactly: JSON, tags such as <edits>...</edits>, code fences, lists and headings stay as they are;
- if the draft is already good, return it unchanged.
Output only the final answer, with no commentary about your edits.`,
  ],
  ['human', `REQUEST:\n{request}\n\nDRAFT ANSWER:\n{draft}`],
])
