# Resume AI

A free, open-source, **local-first** AI resume builder. Import a resume, analyse it against a job with a transparent ATS score, tailor it with reviewable diffs, chat with a resume counselor, write cover letters, and track applications. No backend, no accounts, no telemetry.

- Your data lives in your browser (`localStorage`).
- AI answers come from Groq (primary) and OpenRouter (fallback + fact-checker) through a small server-side proxy that holds your API keys. Local [Ollama](https://ollama.com) is an optional advanced mode.
- Semantic matching runs in the browser with `@huggingface/transformers` (`Xenova/all-MiniLM-L6-v2`, ~25 MB, downloaded once).
- Network calls go only to the AI provider(s) you configured and the one-time embedding-model download. With Ollama selected, nothing but that download leaves your computer.

**Truthfulness is a hard rule.** Every prompt tells the model never to invent employers, titles, dates, degrees, metrics or skills. Tailoring may only reword and reprioritise existing facts. The app adds guards on top: edits are shown as diffs you accept or reject, numbers that do not appear in your resume get a warning, and skill re-ordering can never add a skill.

## Features

Import (PDF / DOCX / paste, LLM → zod-validated structure) · section editor with live preview, autosave and multiple resumes · 3 single-column ATS-safe templates with font and spacing controls · deterministic ATS score · tailoring with per-change Accept/Reject · resume agent chat (edits content and layout) · streamed cover letters (formal / friendly / concise) · Kanban tracker · PDF and DOCX export (links stay clickable) · JSON backup/restore · light/dark theme · first-run onboarding.

## Setup

Requires Node 20+.

### 1. Get free API keys

Resume AI uses hosted models through the keys you configure **on the server**:

- **Groq** (fast, answers first): <https://console.groq.com/keys>
- **OpenRouter** (fallback and independent fact-checker): <https://openrouter.ai/keys>

One key is enough to start; both is best.

### 2. Add them to `.env`

```
copy .env.example .env      # PowerShell (macOS/Linux: cp .env.example .env)
```

```
GROQ_API_KEY=your-key
OPENROUTER_API_KEY=your-key
```

`.env` is git-ignored. The keys are read only by the server-side proxy (below) and are **never bundled into the browser build or sent to visitors**.

### 3. Run

```
npm install
npm run dev
```

Open <http://localhost:5173>, go to **Profile -> Settings** and press **Test connection**. In development the proxy runs inside the Vite dev server, using the same code as production.

### The AI proxy (hosting for other people)

Visitors never see your keys. The browser calls `/api/llm/...` on your own server, and `server/` adds the key and forwards the request:

- `GET /api/auth/config` publishes the public Firebase settings and whether sign-in is required.
- `GET /api/llm/status` tells the app which providers are configured (never the keys).
- `POST /api/llm/{groq|openrouter}/chat/completions` is a validated, streaming passthrough.
- **Protections:** a model allowlist (visitors cannot pick other or paid models), message-count / prompt-size / output-token caps, only known fields forwarded (no tools), same-origin only, and per-visitor rate limits (default 20/minute and 300/day, configurable; set `TRUST_PROXY=1` behind a platform proxy so limits are per visitor).
- Limits are per server process (in memory), so run a single instance, or add a shared store such as Redis if you scale out.

To host (one Node service serves the app and the proxy):

```
npm ci
npm run build          # client -> dist/
npm run build:server   # proxy + static server -> server-dist/index.mjs
npm start              # reads PORT, GROQ_API_KEY, OPENROUTER_API_KEY, ...
```

`render.yaml` is included for [Render](https://render.com): set `GROQ_API_KEY` and `OPENROUTER_API_KEY` in the dashboard. All server variables are listed in `.env.example`. Anyone who can open your site can use your quota within these limits, so keep the limits modest and set spending caps on your provider accounts.

### Sign-in and cloud sync (Firebase)

Optional, and recommended when other people can reach your server. Uses **Firebase Authentication** (Google sign-in) and **Cloud Firestore**:

- **AI features need sign-in** (Agent, Tailor, AI import parsing, cover letters). **Manual editing, ATS scoring, templates and export never do.** Without the four `FIREBASE_*` settings the app behaves as before, with no sign-in.
- **Rate limits are per account** (default 30/minute, 500/day) instead of per IP. The server verifies the user's Firebase ID token (signature, audience, issuer, expiry) on every AI request.
- **Cloud sync** stores each resume, job and cover letter as its own Firestore document under `users/{uid}/items/{id}`. The app stays local-first: it works from browser storage and syncs in the background while signed in (live updates plus a short debounce after edits; Firestore also queues edits made offline). The newer edit of each item wins and deletions propagate. Different accounts on one browser are never mixed. Users can delete their cloud data (and sign out) in Settings.
- **Security rules** (`firestore.rules`) let a signed-in user read and write only their own items, with a fixed shape and size limit. They must be published in the Firebase console (see below); until then, sync reports a permission error and everything else keeps working.

Setup:

1. Create a Firebase project (turn Google Analytics off), enable **Authentication -> Google**, and create a **Firestore** database in production mode.
2. Add your site's host (for example `your-app.onrender.com`) under **Authentication -> Settings -> Authorized domains** (`localhost` is there by default).
3. Register a **web app** and copy its config into `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID` (see `.env.example`; `render.yaml` already contains them).
4. Open **Firestore Database -> Rules**, paste the contents of `firestore.rules`, and **Publish**.

The page loads the Firebase SDK only when sign-in is enabled, and the browser then talks to Google/Firebase directly for sign-in and sync. Synced resumes are stored in your Firebase project, so treat them as personal data and add a privacy notice before inviting the public. Timestamps come from each device's clock, so a badly wrong clock can make an older edit win.

#### Admin: managing AI models

An admin is a signed-in user who has a document at `admins/{their uid}` in Firestore, created once by hand in the Firebase console (Authentication -> Users to copy the UID, then Firestore -> Start collection `admins`, Document ID = the UID, any field such as `role: "admin"`). Nobody can create or change that document from the app, and being an admin does not give access to other users' resumes.

Admins see **Admin: AI models** in Settings: one list of allowed models per provider and a default for each. It is saved to `config/models` in Firestore (readable by everyone, writable only by admins) and the server reads it with a ~30 second cache, so changes apply to all users within about a minute and survive restarts and deploys. The server only calls models on this list. Other users see a dropdown of allowed models; until they pick one themselves they automatically follow the admin's default. Without an admin document the environment defaults (`GROQ_ALLOWED_MODELS`, `OPENROUTER_ALLOWED_MODELS`) apply.

#### Testing the security rules

`firestore-rules/rules.test.ts` runs against the Firestore emulator (it is skipped in a normal `npm test`). The emulator needs Java 21; with Docker you do not need to install it:

```
docker run --rm -v "$PWD":/work -w /work node:22-trixie bash -c "apt-get update -qq && apt-get install -y -qq openjdk-21-jre-headless && npx --yes firebase-tools@latest emulators:exec --only firestore --project demo-resume-ai 'npx vitest run firestore-rules'"
```

### How models are chosen (Auto mode, the default)

- **Primary:** Groq (`openai/gpt-oss-120b`), the fastest. If it fails or is rate-limited, OpenRouter takes over automatically.
- **Checker:** the AI fact-check of suggested edits goes to OpenRouter first, so a second, independent model reviews them (falling back to Groq).
- Providers without a key on the server are skipped; with one key it is used for everything.
- Resume text and job descriptions are sent through your server to these providers. For fully local AI, see below.

### Optional, advanced: local AI with Ollama

Install [Ollama](https://ollama.com/download), run `ollama pull llama3.1:8b`, allow the app's origin (Windows PowerShell: `setx OLLAMA_ORIGINS "http://localhost:5173"`, then restart Ollama; macOS/Linux: `OLLAMA_ORIGINS=http://localhost:5173 ollama serve`), and choose **Ollama (local, advanced)** in Settings. Then nothing leaves your computer except the one-time embedding-model download.

### Other scripts

```
npm test           # Vitest unit + component tests
npm run typecheck  # tsc --noEmit (strict)
npm run lint       # ESLint
npm run build      # typecheck + production build into dist/
npm run build:server && npm start   # production server (static app + AI proxy)
```

## What the Agent can change

Content: summary, bullets (replace / add / remove), contact details, job titles, companies, dates, schools, degrees, project and certification fields, and skill order. Layout: template, font size, spacing, header alignment and bullet indent. Every suggestion is a diff you apply with one click (and can edit first). The visible reply never contains JSON; if a reply cannot be turned into a change, the Agent says so. Layout and explicit fixes can be applied from your first message; open-ended content rewrites start with clarifying questions. There is no per-line indentation or free positioning, and the Agent says so instead of pretending.

## How AI result quality is protected

1. **Prompts** share one set of truthfulness rules and include good/bad rewrite examples (`src/lib/prompts`).
2. **Structured output**: JSON is validated with zod and retried once with the error fed back.
3. **Rule-based guards** flag numbers and names/tools in a rewrite that are not in your resume (`src/lib/ats/guards.ts`, `src/lib/changes.ts`); skill reordering can never add skills.
4. **Quality filter** drops bullet rewrites that score worse on action verb / metric / length, unless they add a missing job keyword.
5. **AI fact-check**: a second model pass lists claims in each rewrite that your resume does not support and attaches them as warnings (applied to Tailor and Chat suggestions; if the check fails it never blocks you).
6. **Parse cross-check**: emails and phone numbers from the parsed resume must appear in the source text; invented ones are removed and missed ones recovered.
7. **You decide**: every change is a diff you accept or reject, and accepted edits can be undone.

## Architecture

- **UI**: React 19 + React Router, Tailwind CSS (class-based dark mode), feature folders.
- **State**: Zustand stores with `persist` (`resume-ai:*` keys in localStorage): resumes, jobs, cover letters, settings. Chat transcripts are memory-only.
- **LLM**: `src/lib/llm` exposes a small `LlmClient` interface (`chat`, `stream`, `testConnection`). `OllamaClient` implements it with `/api/chat` (NDJSON streaming, `format: "json"`); `OpenAiCompatibleClient` covers OpenRouter and Groq (`/chat/completions`, SSE streaming); `FallbackClient` chains providers (Auto mode). `getLlm()` builds it from Settings; `setLlmClient()` swaps the provider (used by tests). `generateJson()` validates with zod and retries once, feeding the validation error back.
- **Prompts**: `src/lib/prompts`, one file per task, all including the shared `TRUTHFULNESS_RULES`.
- **ATS score** (`src/lib/ats`): pure and deterministic. Components: keyword coverage (frequency + tech-term extraction, light stemming), semantic similarity (embedding cosine, best-chunk matching), section completeness, bullet quality (action verb, quantified, length) and formatting checks. Weights are 30/20/15/20/15 and are renormalised when a component is unavailable (no job description, or embeddings not yet run). The LLM is never asked for a score.
- **Changes** (`src/lib/changes.ts`): model output (indexes, not ids) is resolved against the real resume into `Change` objects (`before` always comes from the resume), shared by Tailoring and Chat. Stale changes (resume edited since) are skipped, never forced.
- **Export**: PDF through `window.print()` with print CSS that shows only `.print-area`; DOCX via the `docx` library.

## Project structure

```
server/            AI proxy + static server (config, Firebase token check, rate limit, tests)
src/
  components/      Layout, shared UI primitives
  features/
    ats/ chat/ cover/ dashboard/ editor/ import/ onboarding/
    settings/ tailor/ templates/ tracker/ workspace/
  lib/
    ats/ (keywords, bullets, score, embeddings)   llm/   prompts/
    export/ extract/ changes.ts diff.ts resume.ts arrays.ts id.ts
  store/           resumes, jobs, coverLetters, settings, backup
  types/           zod schemas and types (resume, job)
  test/            setup, fixtures, helpers (mock LLM)
```

## Decisions

- **Skills are a flat list** (not grouped) to keep parsing, editing and reordering simple.
- **PDF export uses the browser print dialog** (choose "Save as PDF"); there is no bundled PDF generator.
- **Semantic matching is opt-in** (button) so the ~25 MB model is only downloaded when wanted. The ONNX runtime is bundled with the app rather than loaded from a CDN.
- **Job description lives on the resume** ("Target job") and is shared by ATS, Tailor and Agent.
- **Tailoring** has two modes. "Edit this resume" (default) writes each accepted change into the resume immediately, with per-change Undo. "Save as a new tailored copy" leaves the original untouched and also creates a "Saved" job in the tracker linked to the copy. The ATS score is shown before, now, and projected if everything is accepted.
- **Clarify-then-edit** in the agent is enforced in code: edit blocks on the first assistant turn are ignored.
- **Drag and drop** uses native HTML5 events; each card also has a status menu for keyboard use.
- **Chat history** is not persisted or included in backups.
- Backups replace existing data on import.

## Known limitations

- Scanned/image-only PDFs are not supported (no OCR); paste the text instead.
- Quality depends on the local model; small models may produce weak parses or need a retry.
- In-browser embeddings need a one-time internet connection for the model download; Safari older than 26 may need a non-asyncify ONNX runtime that is not bundled.
- Print-based PDFs depend on the browser's print settings (disable headers/footers).
- Data is per-browser; use Export/Import to move it.

## License

MIT
