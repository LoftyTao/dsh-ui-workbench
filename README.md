# dsh-ui-workbench

<p align="center">中文 | <a href="https://github.com/LoftyTao/dsh-ui-workbench/blob/main/README.en.md">English</a></p>

## 概述

DeepSeek Harness 的 WebUI 插件。在会话页右侧增加一个面板，提供当前会话工作区的文件树、带行号的文件查看器与 Git 审查。

![中文界面截图（1980 × 1080）](https://raw.githubusercontent.com/LoftyTao/dsh-ui-workbench/main/assets/workbench-zh.png)

## 功能

- 当前会话工作区的文件树与文件名搜索
- 带行号、语法高亮和长行换行的 UTF-8 文件查看器
- 已暂存、未暂存、未跟踪文件及提交引用的 Git 差异审查
- 统一和并排差异视图、变更文件筛选、上下文折叠
- 中英文与亮暗主题适配

## 安装

需要 Node.js 20+ 与带 `web` profile 的 DeepSeek Harness。

```sh
npx -y dsh-ui-workbench setup
```

指定其他 profile：`npx -y dsh-ui-workbench setup --profile <名称>`。

也可通过 DSH CLI 安装：

```sh
npx -y --package @deepseek-ai/dsh dsh plugin --profile web add dsh-ui-workbench
```

安装后重启 DSH 并硬刷新页面。

## 许可证

MIT
