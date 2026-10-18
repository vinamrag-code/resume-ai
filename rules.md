# Working rules

Rules for anyone (human or Claude) changing this codebase.

1. **One branch per feature.** Never stack unrelated work on an existing feature branch. Branch from `dev`.
2. **Never push the base path change to any branch.** It is local to this server only. Keep it out of commits (check `git diff` for it before every commit).
3. **No unnecessary changes.** Touch only what the feature needs: no drive-by refactors, renames, reformatting or dependency bumps.
4. **Reuse what exists.** Prefer the libraries and components already in the project (zustand stores, zod schemas, `src/components/ui.tsx`, the `LlmClient` interface, the existing embedder) over adding new ones.
5. **Ask when stuck.** If something is unclear or blocked, ask rather than guessing or inventing an answer.
6. **Save progress.** At the end of every session, update `PROGRESS.md` (git-ignored working notes) with what was done, what is in flight, and what comes next, so the next session starts without re-discovering it.
