# Resume AI

A free, open-source, **local-first** AI resume builder. Import a resume, analyse it against a job with a transparent ATS score, tailor it with reviewable diffs, chat with a resume counselor, write cover letters, and track applications. No backend, no accounts, no telemetry.

- Your data lives in your browser (`localStorage`).
- AI answers come from Groq (primary) and OpenRouter (fallback + fact-checker) using your own free API keys from `.env`, called straight from the browser. Local [Ollama](https://ollama.com) is an optional advanced mode.
- Semantic matching runs in the browser with `@huggingface/transformers` (`Xenova/all-MiniLM-L6-v2`, ~25 MB, downloaded once).
- Network calls go only to the AI provider(s) you configured and the one-time embedding-model download. With Ollama selected, nothing but that download leaves your computer.

**Truthfulness is a hard rule.** Every prompt tells the model never to invent employers, titles, dates, degrees, metrics or skills. Tailoring may only reword and reprioritise existing facts. The app adds guards on top: edits are shown as diffs you accept or reject, numbers that do not appear in your resume get a warning, and skill re-ordering can never add a skill.

## Features

Import (PDF / DOCX / paste, LLM → zod-validated structure) · section editor with live preview, autosave and multiple resumes · 3 single-column ATS-safe templates with font and spacing controls · deterministic ATS score · tailoring with per-change Accept/Reject · resume agent chat · streamed cover letters (formal / friendly / concise) · Kanban tracker · PDF and DOCX export (links stay clickable) · JSON backup/restore · light/dark theme · first-run onboarding.

## Setup

Requires Node 20+.

### 1. Get free API keys

Resume AI uses hosted models through your own free API keys, so there is nothing heavy to install:

- **Groq** (fast, answers first): <https://console.groq.com/keys>
- **OpenRouter** (fallback and independent fact-checker): <https://openrouter.ai/keys>

One key is enough to start; both is best.

### 2. Add them to `.env`

```
copy .env.example .env      # PowerShell (macOS/Linux: cp .env.example .env)
```

```
VITE_GROQ_API_KEY=your-key
VITE_OPENROUTER_API_KEY=your-key
```

`.env` is git-ignored. `VITE_*` values are bundled into the page, so use this only on your own computer and **never deploy a build that contains a real key**.

### 3. Run

```
npm install
npm run dev
```

Open <http://localhost:5173>, go to **Settings** and press **Test connection**.

### How models are chosen (Auto mode, the default)

- **Primary:** Groq (`openai/gpt-oss-120b`), the fastest. If it fails or is rate-limited, OpenRouter takes over automatically.
- **Checker:** the AI fact-check of suggested edits goes to OpenRouter first, so a second, independent model reviews them (falling back to Groq).
- Providers without a key are skipped; with one key it is used for everything. You can force a single provider and change model names in Settings.
- Resume text and job descriptions are sent to these providers. For fully local AI, see below.

### Optional, advanced: local AI with Ollama

Install [Ollama](https://ollama.com/download), run `ollama pull llama3.1:8b`, allow the app's origin (Windows PowerShell: `setx OLLAMA_ORIGINS "http://localhost:5173"`, then restart Ollama; macOS/Linux: `OLLAMA_ORIGINS=http://localhost:5173 ollama serve`), and choose **Ollama (local, advanced)** in Settings. Then nothing leaves your computer except the one-time embedding-model download.

### Other scripts

```
npm test           # Vitest unit + component tests
npm run typecheck  # tsc --noEmit (strict)
npm run lint       # ESLint
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

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
