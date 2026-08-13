# dsh-ui-workbench

[English](README.md) | 中文

DeepSeek Harness 的 web 插件。在会话页右侧增加一个面板，提供当前会话工作区的文件树、带行号的文件查看器与 Git 审查。

## 特性

- 右侧面板。用 CSS margin 推挤对话区，不占用官方工具详情列；窄屏切换为覆盖层。
- 面板左边缘可拖拽调整宽度；「文件」页内文件树与查看器之间另有分割线。
- 开关按钮位于会话日志（Session Log）旁。面板状态仅保存在内存中，刷新后默认关闭。
- 文件树根为当前会话工作目录，目录懒加载展开；常用文件类型显示彩色 SVG 图标。
- 工作区搜索按路径或文件名匹配并跳转预览；审查页随输入实时筛选变更文件；递归搜索跳过 `.git` 与 `node_modules`。
- 文件查看器：UTF-8 文本，带行号、复制文件路径按钮、Prism 语法高亮、长行自动换行，按滚动位置分块读取与渲染。
- Git 审查覆盖已暂存、未暂存与未跟踪文件。范围可在工作区变更与最近提交（或任意分支引用）间切换；提供变更文件树、并排/统一布局、全部行/隐藏未变更行（保留 3 行上下文）。增删行以颜色区分。无 Git 的工作区提供 `git init` 入口。
- 跟随 Harness 的亮暗主题与中英文语言；`Esc` 关闭面板。

## 架构

分为 Host 与 Client 两部分，通过 `cordis.patch.yml` 以单个 `ui-workbench` 行挂载。

- Host（`src/index.ts`）：在 `/sidebar/api/*` 下注册 JSON 路由，用 `node:fs` 与 `node:child_process` 实现文件与 git 操作。每个请求携带 `sessionId`；工作目录从会话头部解析（`ctx.sessions.get(id).header.cwd`），依次回退到客户端提供的绝对路径、进程 cwd。git 命令每次请求调用系统 `git`，输出为 porcelain 格式。
- Client（`src/client/index.tsx`）：React 应用，用 `createRoot` 挂载到 `document.body` 上的 portal。开/关、标签页、宽度状态存放于 `apply` 闭包内的 `useSyncExternalStore` store；开关注册在 `conversation.session.header.utilities` 插槽。

### Host API 路由

| 路由 | 用途 |
| --- | --- |
| `POST /sidebar/api/cwd` | 解析会话工作目录 |
| `POST /sidebar/api/list-dir` | 列出目录 |
| `POST /sidebar/api/read-file` | 按块读取 UTF-8 文本（每请求 128,000 字节） |
| `POST /sidebar/api/search-files` | 在工作区下按文件名搜索（80 条结果，访问 20,000 个目录） |
| `POST /sidebar/api/git/repository` | 探测工作区是否为 Git 仓库 |
| `POST /sidebar/api/git/init` | 在工作区执行 `git init` |
| `POST /sidebar/api/git/branch`、`POST /sidebar/api/git/branches` | 当前分支、本地分支列表 |
| `POST /sidebar/api/git/status` | 工作区变更文件（已暂存、未暂存、未跟踪） |
| `POST /sidebar/api/git/last-commit` | 某提交/引用变更的文件（默认 `HEAD`） |
| `POST /sidebar/api/git/diff-file` | 单个文件的工作区 diff（`-U3` 或 `-U999999`） |
| `POST /sidebar/api/git/last-file-diff` | 某提交/引用对单个文件引入的 diff |

## 环境要求

- Node.js >= 20
- pnpm（首次用 `corepack enable` 启用）
- 带 web profile（`~/.dsh/profiles/web`）的 DeepSeek Harness

## 从源代码构建

```sh
corepack enable        # 仅首次
pnpm install
pnpm build
```

`pnpm build` 先运行 `tsc -p tsconfig.build.json` 生成类型声明（`lib/types`），再运行 `tsdown` 生成包：`lib/index.js`（host，ESM）与 `lib/client.js`（浏览器）。

## 安装

插件遵循 [DeepSeek Harness 插件格式](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)；打包细节见[发布指南](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)。

### 一条命令（推荐）

发布到 npm 后，以下命令会安装并启用默认 `web` profile：

```sh
npx -y dsh-ui-workbench setup
```

其他 profile 可使用 `npx -y dsh-ui-workbench setup --profile <名称>`。

### 通过 DSH CLI

命令自动读取 `cordis.patch.yml` 中的 bundle 声明：

```sh
npx -y --package @deepseek-ai/dsh dsh plugin --profile web add dsh-ui-workbench
```

这与一条命令安装器等价，可在任意目录执行。安装后重启 DSH 并硬刷新页面。

### 首次发布 npm 前

当前使用无 scope 的包名。发布前请在 `package.json` 中填入仓库和 issue 地址，创建 GitHub 仓库，然后执行：

```sh
pnpm check
npm login
pnpm publish
```

`pnpm check` 会验证 npm 的精确文件列表；`prepack` 会再次进行类型检查并生成预编译的 `lib/` 文件。因此普通 npm 安装不会执行本仓库的构建脚本。发布的压缩包只包含安装器、DSH bundle patch、运行时 bundle、公开类型声明、包元数据、README 和许可证。

### 手动挂载

在 web profile 的 patch 文件中加入该行：

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: ui-workbench
      name: 'dsh-ui-workbench'
```

若从 GitHub 安装，请固定 tag 或 commit，例如 `github:OWNER/dsh-ui-workbench#v0.1.0`。Git 安装需要从源码构建，用户必须显式允许包的 `prepare` 脚本；npm 安装则不需要。

## 贡献

[CONTRIBUTING.md](CONTRIBUTING.md) 说明模块边界、修改规则和验证命令；[AGENTS.md](AGENTS.md) 为编码智能体提供与人类贡献者一致的项目约束。

## 许可证

MIT
