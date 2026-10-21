# AGENTS.md

Guide for AI coding CLIs (Claude Code, Codex, Gemini CLI, etc.) working on **Resume AI**. Human-oriented docs are in `README.md`; working rules are in `rules.md`. This file is the quick map.

## What this is

A local-first AI resume builder: import a resume (PDF/DOCX/paste), edit it with a live preview, score it against a job description (deterministic ATS score), tailor it via reviewable diffs, chat with **Sage** (the resume assistant), write cover letters, track applications (Kanban), and export PDF/DOCX. Data lives in the browser (`localStorage` + IndexedDB); optional Firebase sign-in and Firestore sync. AI calls go through a small Node proxy that holds the API keys.

**Hard product rule: truthfulness.** The AI must never invent employers, titles, dates, degrees, metrics or skills. Tailoring may only reword/reprioritise existing facts. Guards live in `src/lib/ats/guards.ts` and `src/lib/changes.ts`; never weaken them.

## Stack

- Client: React 19, React Router 7, Tailwind (class-based dark mode, light/dark only), Zustand (`persist`), zod, Vite, TypeScript (strict).
- AI: LangChain (`@langchain/openai`, `core`, `textsplitters`); providers Groq, OpenRouter, Inception (all OpenAI-compatible `/chat/completions`).
- Embeddings: `@huggingface/transformers` (MiniLM) in the browser; vector store in IndexedDB (`idb`).
- Server: Node 20, `server/` bundled with esbuild to `server-dist/index.mjs` (proxy + static server).
- Auth/sync: Firebase Auth + Firestore (optional, enabled when `FIREBASE_*` env is set).
- Tests: Vitest + Testing Library.

## Commands

```
npm install
npm run dev            # Vite dev server on :5173; proxy runs inside it
npm test               # Vitest (firestore-rules tests are skipped without the emulator)
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint
npm run build          # typecheck + production client build into dist/
npm run build:server   # server -> server-dist/index.mjs
npm start              # run the built server (reads PORT and env)
```

**The deployed app is served from `dist/`, so run `npm run build` after any client change** (and `npm run build:server` + restart for server changes). Run `npm run typecheck && npm run lint && npm test` before finishing.

## Layout

```
server/              AI proxy, static server, Firebase token check, rate limits, model allowlist, job-URL import
src/
  App.tsx            routes: import, resume/:id (workspace), build, bank, cover, tracker, settings
  components/        Layout, shared UI primitives (ui.tsx)
  features/          one folder per screen: ats, auth, bank, build, chat (Sage), cover, dashboard,
                     editor, import, onboarding, settings, tailor, templates, tracker, workspace
  lib/
    llm/             LlmClient interface, OpenAI-compatible client, providers, generateJson (zod + one retry)
    chain/           LangChain pipeline: retrieve -> improve prompt -> write -> polish, with fallbacks
    rag/             IndexedDB vector store, indexing, hybrid retrieval
    prompts/         one file per task; all include shared TRUTHFULNESS_RULES
    ats/             deterministic scoring, keywords, bullets, guards, embeddings
    export/ extract/ PDF (print CSS) / DOCX export; PDF/DOCX text extraction
    sync/ firebase/  Firestore sync and client setup
    changes.ts       model output -> Change objects (diffs); stale changes skipped
    assistant.ts     Sage's name constant
  store/             Zustand stores: resumes, jobs, coverLetters, chats, bank, settings, backup
  types/             zod schemas and types
  test/              setup, fixtures, mock LLM
firestore.rules      security rules (tests in firestore-rules/, need the emulator)
```

## Conventions

- Match surrounding code: naming, comment density, idiom. Prefer existing libraries/components (zustand stores, zod schemas, `src/components/ui.tsx`, `LlmClient`, the existing embedder) over new dependencies.
- Agent behaviour rules (do everything asked, nothing more, nothing without approval) live in `src/lib/prompts/AGENT_RULES.md`; it is loaded into the chat and tailor prompts at build time, so edit that file, not copies. Chat replies also go through `features/chat/reviewChanges.ts` (completes half-done multi-part requests, flags unrequested edits).
- Validate all LLM JSON with zod via `generateJson()`; never trust model output shape.
- Model edits refer to indexes and are resolved against the real resume (`changes.ts`); `before` always comes from the resume.
- Every AI edit is a diff the user accepts or rejects. Do not auto-apply AI changes.
- Saved-data shape changes need a store migration (`persist` version / merge) and Firestore-rule compatibility.
- API keys are server-only. Never bundle them into the client or log them. `.env` is git-ignored.
- Add or update tests next to the code you change.

## Git workflow

- Base branch is `dev`; one branch per feature, branched from `dev`. No drive-by refactors, renames, reformatting or dependency bumps.
- Never push a local-only base-path change (`BASE_PATH`) to any branch; check `git diff` before committing.
- `PROGRESS.md` is git-ignored session notes; update it at the end of a session.
- Only commit or push when the user asks.

## Environment

Server variables are listed in `.env.example`: `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `INCEPTION_API_KEY`, `FIREBASE_*`, allowed-model lists, rate limits, `TRUST_PROXY`. With no `FIREBASE_*` the app is open (local dev); with them, sign-in and verified email are required and enforced server-side and in Firestore rules.

## Gotchas

- Scanned/image-only PDFs are unsupported (no OCR). LinkedIn/Indeed job pages can't be fetched; users paste the description.
- Rate limits are in-memory per process: run a single server instance.
- Client builds for a sub-path need `BASE_PATH=/sub/` at build time.
