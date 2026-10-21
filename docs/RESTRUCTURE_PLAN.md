# Restructure plan: `backend/`, `frontend/`, `landing/`

Status: **plan only, nothing implemented.**

Three pieces were requested: backend (AI pipelines, LLMs, agent calls), frontend (the app after login) and a landing page (pure frontend). The landing page is assumed to be its own static site.

## What the code does today

`server/` is only a proxy (about 1,700 lines). The AI work happens in the browser:
- The browser runs the LangChain pipeline, prompts, RAG retrieval and embeddings, and parses the model's JSON output.
- This lives in `src/lib/llm`, `chain`, `rag`, `prompts`, `ats`, `changes.ts` and the feature files `tailorResume.ts`, `parseResume.ts`, `generateLetter.ts`, `chatLogic.ts`, `useSemantic.ts`.
- The browser calls the proxy only for raw `/chat/completions` requests.

Moving "all pipelines, LLMs and agent calls" to the backend is therefore an architecture change, not only a file move. That is the bulk of the work.

## Target layout

```
resume-ai/
  backend/    Node 20 + TypeScript: API, auth, AI pipelines, agent, RAG, embeddings
  frontend/   React app after login: workspace, editor, tracker, bank, settings
  landing/    Static public site: marketing page + sign-in entry
  shared/     zod schemas and types used by both sides (resume, chat, changes)
  package.json  npm workspaces + root scripts
```

## What goes where

**`backend/`**
- Everything now in `server/`: proxy, Firebase token check, rate limits, model allowlist, job-URL import.
- Moved from `src/lib`: `llm/`, `chain/`, `rag/`, `prompts/`, `ats/guards.ts`, and the AI parts of `changes.ts`. Truthfulness guards stay server-side so users cannot bypass them.
- New task endpoints replacing the raw proxy for app features:

| Endpoint | Replaces |
|---|---|
| `POST /api/parse-resume` | `parseResume.ts` |
| `POST /api/tailor` | `tailorResume.ts` and `verifyChanges.ts` |
| `POST /api/chat` | Sage (`chatLogic.ts`) |
| `POST /api/cover-letter` | `generateLetter.ts` |
| `POST /api/bank/build` | `BuildPanel` |
| `POST /api/ats/semantic` | `useSemantic.ts` |

- Server-side embeddings and a vector store, replacing browser MiniLM and IndexedDB.

**`frontend/`**
- Everything except the landing page: `features/*`, `components/`, Zustand stores, the editor, export (PDF/DOCX), file extraction, Firestore sync, auth gate.
- Each AI feature calls a typed API client (`frontend/src/api/`) instead of running LangChain.
- Keeps its own Vite config, Tailwind config and tests.

**`landing/`**
- `LandingPage.tsx`, `AuthModal` and the sign-in button.
- A small standalone Vite site reusing the brand tokens, with a "Sign in / Get started" link into the app.

**`shared/`**
- zod schemas and types (`types/`), imported by both sides.

## Phases

Each phase ends with typecheck, lint and tests passing.

1. **Workspaces and shared types.** Root workspace and `shared/`, no behaviour change.
2. **Move the existing server to `backend/`.** Update the esbuild script, the Vite dev proxy, Dockerfile and `render.yaml`. Move `server/*.test.ts` along.
3. **Move the whole client to `frontend/`.** Fix aliases, tsconfig, Tailwind and `BASE_PATH` handling. The app works exactly as before.
4. **Split out `landing/`.** Own Vite entry; `/welcome` becomes the landing site; decide the sign-in hand-off to the app.
5. **Migrate AI to the backend, one feature at a time.** Order: parse resume, cover letter, tailor, chat, bank build, ATS semantic score and RAG. Each step adds the endpoint and tests, switches the frontend client, then deletes the browser code. LLM-mocking tests move to the backend.
6. **Cleanup.** Update CI, README, `AGENTS.md`, `rules.md`; delete dead `src/lib` code.

## Open decisions

1. **Landing hosting:** separate static site on its own domain/path (recommended), or served by the same Node server?
2. **How far to move AI:** the full migration (phase 5), or folders only first and AI later? The folder move is low risk; the AI migration changes every feature.
3. **Embeddings/RAG:** move to the server (MiniLM in Node, server-side storage; more memory and cost) or keep ATS semantic scoring and retrieval in the browser for now?
4. **Data storage:** keep resumes local-first with Firestore sync, backend sees only per-request data (recommended), or should the backend own the data?
5. **Branching:** one `refactor/split-apps` branch, or one branch per phase (per `AGENTS.md`, one branch per feature from `dev`)?

Deployment changes too. Today one Render service serves everything. After the split: the backend serves `frontend/dist`, plus a separate static host for `landing/`, unless decision 1 is "same server".
