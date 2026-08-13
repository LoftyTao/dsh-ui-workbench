# Agent guide

Treat this repository as a small plugin with clear seams. Read `CONTRIBUTING.md` before editing.

## Non-negotiable constraints

- Preserve the host/client split. Browser code may use only `src/client/api.ts` to reach host operations.
- Every host route stays session-scoped. Validate request fields in `src/wire.ts`; never trust a browser path without resolving it through the session workspace.
- Keep process and filesystem details inside `src/git.ts` and `src/fs.ts`, respectively. Do not duplicate shell commands or path traversal logic in route handlers.
- Keep `en` as the i18n key source of truth. Typecheck after any string change.
- Do not add build outputs or credentials to source control.

## Required checks

Run `pnpm check` after code or package changes. Use `pnpm pack:check` to inspect exactly what npm will publish.
