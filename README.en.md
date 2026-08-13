# dsh-ui-workbench

<p align="center"><a href="https://github.com/LoftyTao/dsh-ui-workbench/blob/main/README.md">中文</a> | English</p>

## Overview

A DeepSeek Harness WebUI plugin. It adds a right-side panel to the conversation page with a file tree, line-numbered file viewer, and Git review for the current session workspace.

![English UI screenshot (1980 × 1080)](https://raw.githubusercontent.com/LoftyTao/dsh-ui-workbench/main/assets/workbench-en.png)

## Capabilities

- File tree and file-name search for the current session workspace
- UTF-8 file viewer with line numbers, syntax highlighting, and long-line wrapping
- Git review for staged, unstaged, untracked, and commit-reference changes
- Unified and split diff views, changed-file filtering, and context folding
- Chinese/English and light/dark theme support

## Install

Requires Node.js 20+ and DeepSeek Harness with the `web` profile.

```sh
npx -y --package @deepseek-ai/dsh dsh plugin --profile web add github:LoftyTao/dsh-ui-workbench#v0.1.0
```

GitHub installs build from source; allow the `prepare` script when DSH prompts. Restart DSH and hard-refresh the page after installation.

## License

MIT
