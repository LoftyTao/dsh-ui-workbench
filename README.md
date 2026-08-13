# dsh-ui-workbench

English | [中文](README.zh.md)

A DeepSeek Harness web plugin. Adds a right-side panel to the conversation page: file tree, line-numbered file viewer, and Git review of the current session's workspace.

## Features

- Right-side panel that pushes the conversation area with a CSS margin and leaves the official tool-details column untouched. Switches to an overlay on narrow viewports.
- Panel width adjustable by dragging its left edge. The Files tab has a second splitter between the tree and the viewer.
- Toggle button next to Session Log. Panel state is in-memory only and defaults to closed after a refresh.
- File tree rooted at the current session's working directory. Directories expand lazily. Colored SVG icons for common file types.
- Workspace search by path or file name with jump-to-preview. The Review tab filters changed files as you type. Recursive search skips `.git` and `node_modules`.
- File viewer for UTF-8 text with line numbers, a copy-file-path button, Prism syntax highlighting, wrapping, and chunked reading and rendering by scroll position.
- Git review covering staged, unstaged and untracked files. Scope switches between workspace changes and the last commit (or any branch ref). Changed-file tree, split or unified layouts, show-all-lines or hide-unchanged-lines with 3 lines of context. Additions and deletions are distinguished by color. A workspace without Git offers a `git init` entry.
- Follows the harness light/dark theme and zh/en language. `Esc` closes the panel.

## Architecture

Split into Host and Client parts, mounted as one `ui-workbench` row through `cordis.patch.yml`.

- Host (`src/index.ts`). JSON routes under `/sidebar/api/*` implement file and Git operations with `node:fs` and `node:child_process`. Every request carries a `sessionId`; the working directory is resolved from the session header (`ctx.sessions.get(id).header.cwd`), falling back to a client-supplied absolute path, then the process cwd. Git commands spawn the system `git` per request with `--porcelain` output.
- Client (`src/client/index.tsx`). A React app mounted with `createRoot` into a portal on `document.body`. Open/tab/width state lives in a `useSyncExternalStore` store created in `apply`. The toggle registers in the `conversation.session.header.utilities` slot.

### Host API routes

| Route | Purpose |
| --- | --- |
| `POST /sidebar/api/cwd` | resolve the session's working directory |
| `POST /sidebar/api/list-dir` | list a directory |
| `POST /sidebar/api/read-file` | read UTF-8 text, chunked (128,000 bytes per request) |
| `POST /sidebar/api/search-files` | search file names below the workspace (80 results, 20,000 directories visited) |
| `POST /sidebar/api/git/repository` | probe whether the workspace is a Git repository |
| `POST /sidebar/api/git/init` | run `git init` in the workspace |
| `POST /sidebar/api/git/branch`, `POST /sidebar/api/git/branches` | current branch, local branches |
| `POST /sidebar/api/git/status` | working-tree changed files (staged, unstaged, untracked) |
| `POST /sidebar/api/git/last-commit` | files changed by a commit/ref (default `HEAD`) |
| `POST /sidebar/api/git/diff-file` | working-tree diff of one file (`-U3` or `-U999999`) |
| `POST /sidebar/api/git/last-file-diff` | diff introduced by a commit/ref for one file |

## Requirements

- Node.js >= 20
- pnpm (enabled once with `corepack enable`)
- A DeepSeek Harness installation with the web profile (`~/.dsh/profiles/web`)

## Build from source

```sh
corepack enable        # first time only
pnpm install
pnpm build
```

`pnpm build` runs `tsc -p tsconfig.build.json` for type declarations (`lib/types`) and `tsdown` for the bundles: `lib/index.js` (host, ESM) and `lib/client.js` (browser).

## Install

The plugin follows the [DeepSeek Harness plugin format](https://deepseek-harness.github.io/deepseek-harness/develop/basic/); packaging details are in the [publish guide](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish).

### One command (recommended)

After the package is published to npm, install and activate it in the default web profile with:

```sh
npx -y dsh-ui-workbench setup
```

Choose a different profile with `npx -y dsh-ui-workbench setup --profile <name>`.

### Via the DSH CLI

The command reads the bundle declaration in `cordis.patch.yml` automatically:

```sh
npx -y --package @deepseek-ai/dsh dsh plugin --profile web add dsh-ui-workbench
```

This is equivalent to the one-command installer and can be run from any directory. Restart DSH and hard-refresh the page after installing.

### Before the first npm release

The package name is currently unscoped. Before publishing, set the repository URL and issue tracker URLs in `package.json`, create a GitHub repository, then run:

```sh
pnpm check
npm login
pnpm publish
```

`pnpm check` validates the exact npm file list; the `prepack` hook repeats type checking and produces prebuilt `lib/` files, so normal npm installs never execute this repository's build scripts.

### Manually

Add the row to the web profile's patch file:

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: ui-workbench
      name: 'dsh-ui-workbench'
```

For a GitHub install, use a pinned tag or commit, for example `github:OWNER/dsh-ui-workbench#v0.1.0`. Git installs build from source and require the user to explicitly allow the package's `prepare` script; npm installs do not.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the module map, change rules, and verification commands. [AGENTS.md](AGENTS.md) gives coding agents the same project constraints as human contributors.

## License

MIT
