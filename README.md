# Resume AI

A free, open-source, **local-first** AI resume builder. Import a resume, analyse it against a job with a transparent ATS score, tailor it with reviewable diffs, chat with a resume counselor, write cover letters, and track applications. No backend, no accounts, no telemetry.

- Your data lives in your browser (`localStorage`).
- The AI is your own [Ollama](https://ollama.com) server, called straight from the browser (or, optionally, OpenRouter/Groq with your own key in `.env`).
- Semantic matching runs in the browser with `@huggingface/transformers` (`Xenova/all-MiniLM-L6-v2`, ~25 MB, downloaded once).
- By default the only network calls are to your Ollama server and that one-time model download. A cloud provider is used only if you choose one.

**Truthfulness is a hard rule.** Every prompt tells the model never to invent employers, titles, dates, degrees, metrics or skills. Tailoring may only reword and reprioritise existing facts. The app adds guards on top: edits are shown as diffs you accept or reject, numbers that do not appear in your resume get a warning, and skill re-ordering can never add a skill.

## Features

Import (PDF / DOCX / paste, LLM → zod-validated structure) · section editor with live preview, autosave and multiple resumes · 3 single-column ATS-safe templates with font and spacing controls · deterministic ATS score · tailoring with per-change Accept/Reject · resume agent chat · streamed cover letters (formal / friendly / concise) · Kanban tracker · PDF and DOCX export · JSON backup/restore · light/dark theme · first-run onboarding.

## Setup

Requires Node 20+.

### 1. Install Ollama and pull a model

Install from <https://ollama.com/download>, then:

```
ollama pull llama3.1:8b
```

Any chat model works; set its name in Settings. Bigger models give better JSON and writing.

### 2. Allow the browser to reach Ollama (`OLLAMA_ORIGINS`)

Ollama rejects browser requests from unknown origins. Allow the app's origin (the Vite dev server uses `http://localhost:5173`) and restart Ollama.

Windows (PowerShell):

```
setx OLLAMA_ORIGINS "http://localhost:5173"
```

then quit and restart Ollama. macOS / Linux:

```
OLLAMA_ORIGINS=http://localhost:5173 ollama serve
```

### Optional: cloud providers (OpenRouter, Groq)

If your computer is too small for a good local model, you can use a hosted model with your own API key instead of Ollama:

```
copy .env.example .env      # PowerShell (macOS/Linux: cp)
```

Put your key in `.env` (`VITE_OPENROUTER_API_KEY` and/or `VITE_GROQ_API_KEY`), restart `npm run dev`, then choose the provider and model in **Settings** and press **Test connection**.

- With a cloud provider, resume text and job descriptions are sent to that provider. Ollama remains the fully local option.
- `VITE_*` values are bundled into the page. Use this only on your own computer; **never deploy a build that contains a real key**. `.env` is git-ignored.
- Free OpenRouter models are rate-limited; if you see a rate-limit message, wait a minute or choose another model.

### 3. Run the app

```
npm install
npm run dev
```

Open <http://localhost:5173>, go to **Settings**, and press **Test connection**.

### Other scripts

```
npm test           # Vitest unit + component tests
npm run typecheck  # tsc --noEmit (strict)
npm run lint       # ESLint
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build (allow its origin in OLLAMA_ORIGINS)
```

## Architecture

- **UI**: React 19 + React Router, Tailwind CSS (class-based dark mode), feature folders.
- **State**: Zustand stores with `persist` (`resume-ai:*` keys in localStorage): resumes, jobs, cover letters, settings. Chat transcripts are memory-only.
- **LLM**: `src/lib/llm` exposes a small `LlmClient` interface (`chat`, `stream`, `testConnection`). `OllamaClient` implements it with `/api/chat` (NDJSON streaming, `format: "json"`); `OpenAiCompatibleClient` covers OpenRouter and Groq (`/chat/completions`, SSE streaming). `getLlm()` builds it from Settings; `setLlmClient()` swaps the provider (used by tests). `generateJson()` validates with zod and retries once, feeding the validation error back.
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
- **Tailoring** saves a copy and also creates a "Saved" job in the tracker linked to it.
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
