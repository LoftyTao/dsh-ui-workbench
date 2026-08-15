# dsh-ui-workbench

<p align="center"><a href="https://github.com/LoftyTao/dsh-ui-workbench/blob/main/README.md">中文</a> | English</p>

## Overview

A DeepSeek Harness WebUI plugin. It adds a right-side panel to the conversation page with a file tree, line-numbered file viewer, and Git review for the current session workspace.

## DSH metadata

| Field | Value |
| --- | --- |
| Family | DSH UI |
| Category | Client |
| Role | Client |
| Capability | Workspace file browsing and Git review |
| Provides | Host `/sidebar/api/*` routes and a browser Workbench panel |
| Injects | Host: `webServer`, `sessions`; Client: `slots`, `sessions`, `@deepseek-ai/dsh-client-runtime`, `@deepseek-ai/dsh-client-ui-slots` |
| Config | Host `Config` is an empty object; panel width stays in browser state, while theme reads the optional DSH `theme` service and observes the DSH DOM theme marker, and language follows the DSH document state |
| Credential Boundary | Stores no credentials; accesses files and Git state through the session-scoped DSH host workspace |
| Model Experience | Visible workspace review panel on the conversation page |
| Dependency | DSH `0.1.0-rc.6`, Node `>=22.19`, `pnpm@11.21.0`, React 18, Client Runtime |
| Status | Experimental |
| Scope | `web` profile, DSH Web Client, current session workspace |

![WebUI plugin screenshot](https://raw.githubusercontent.com/LoftyTao/dsh-ui-workbench/main/assets/workbench.png)

## Capabilities

- File tree and file-name search for the current session workspace
- UTF-8 file viewer with line numbers, syntax highlighting, and long-line wrapping
- Git review for staged, unstaged, untracked, and commit-reference changes
- Git status abbreviations `M`, `A`, `D`, `R`, `C`, `T`, and `U`; untracked files use `U`
- Unified and split diff views, changed-file filtering, and context folding
- Diff views keep file syntax highlighting, use theme-aware base/strong background layers for line and inline changes, align inline ranges to the replaced characters, keep pure additions and deletions at line-background level, hide Git patch metadata, and label folded spans as `<count> unmodified lines`
- Chinese/English support with live light/dark theme synchronization from DSH Appearance settings

The host owns session-scoped paths, file reads, and Git operations. The browser owns the file tree, change tree, file viewer, and diff view. Both trees use one path hierarchy so folders and nested changes remain aligned. Workbench colors reuse the DSH `--dsw-*` semantic tokens and code-highlight variables, so the panel follows the Appearance setting without a second palette. Git review refreshes on initial load, explicit action, session or ref changes, and visible-window return events; fixed polling remains disabled.

## Hot Reload

The Browser entry uses a global runtime owner for the React root, slot contribution, event listeners, observers, and style tag. A replacement bundle claims the owner in the same Web process, disposes the previous instance, and rebinds the Host context. Panel visibility, width, current file, Git selection, filtering, and diff layout live in cross-module reload state. Theme adaptation connects both `theme/change` and the DOM observation seam, so bundle HMR, Appearance changes, and theme-service reloads stay live without a restart. The development profile must include `plugins/client/dsh-ui-workbench/lib` in its HMR watch roots so each build reaches the same Browser aggregate immediately.

## Install

Requires Node.js 22.19+ and DeepSeek Harness with the `web` profile.

```sh
npx -y --package @deepseek-ai/dsh dsh plugin --profile web add github:LoftyTao/dsh-ui-workbench#v0.1.0
```

GitHub installs build from source; allow the `prepare` script when DSH prompts. After adding the package to the `web` profile, source builds are claimed by HMR in the same Web process; the theme integration adds no restart step, and one page load creates the initial Browser aggregate.

## License

MIT
