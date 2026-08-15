# Contributing

Thanks for improving the workbench. Keep each change narrow, explain the user-visible effect, and run `pnpm check` before opening a pull request.

## Module map

| Module | Interface | Owns |
| --- | --- | --- |
| `src/index.ts` | `/sidebar/api/*` POST routes | session-scoped request handling and route registration |
| `src/fs.ts` | filesystem functions | directory listing, bounded text reads, file-name search |
| `src/git.ts` | Git functions | process invocation and porcelain parsing |
| `src/wire.ts` | JSON helpers | request validation and stable error envelopes |
| `src/client/tree.ts` | client tree model | shared folder hierarchy for workspace files and Git changes |
| `src/client/index.tsx` | `apply(ctx)` | browser UI, state, and slot registration |
| `src/client/i18n.tsx` | `useI18n()` | typed UI messages and locale detection |

Do not make React code call Node APIs or put browser state in the host. The browser talks to the host only through `src/client/api.ts`; the host resolves the session workspace before calling filesystem or Git modules. Keep workspace files and Git changes on the shared path-tree model so folders and nested entries use the same hierarchy.

Git review refreshes on initial load, explicit user action, session/ref changes, and a visible-window return event. Keep the review mounted without a fixed polling timer; preserve the selected diff while refreshing its file list and reload it only when the selected entry remains available.

## i18n

`en` in `src/client/i18n.tsx` defines the complete key set. Add a key to `en`, then add the corresponding Chinese text in the matching position in `zh`. The `Record<MessageKey, string>` annotation makes missing or extra Chinese keys fail type checking. Keep messages grouped by the existing UI section and keep placeholders such as `{count}` identical across locales.

## Verification

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm pack:check
```

`pnpm check` runs all three. It is also the release gate executed by `prepack`.

## Pull requests

- Describe the user-facing behaviour and affected module seam.
- Add tests when changing pure parsing, path, or protocol behaviour.
- Do not commit `lib/`, `node_modules/`, logs, or generated tarballs; npm builds `lib/` at pack time.
