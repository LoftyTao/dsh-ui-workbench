# dsh-ui-workbench

DeepSeek Harness 的 web 插件：右侧工作台面板，包含文件树、带行号的文件查看器、Git 审查（工作区变更 / 上一轮提交、分支切换、带行号 diff）。

## 特性

- **OpenCode 风格工作台**：紧凑的文件/审查分段导航、项目树、固定文件头、变更状态和逐行 diff 统计。
- **右侧独立面板**：通过 portal 挂载 + CSS `#root { margin-right }` 推挤，展开时只挤压中间对话区，**不占用**官方工具详情面板（`details` 列）。窄屏自动切换为覆盖层。
- **可调宽度**：面板左边缘拖拽调节整体宽度；「文件」页内文件树与内容区之间另有可拖分割线。
- **主题与可访问性**：跟随 DSH/系统的亮暗色语义变量，支持 `Esc` 关闭、减少动态效果和带标签的图标按钮。
- **开/关切换**：会话头部按钮 toggle 面板，刷新后默认关闭。
- **文件树**：根 = 当前会话工作目录，目录懒加载展开。
- **工作区搜索**：文件页按路径/文件名搜索并跳转到预览，审查页实时筛选变更文件；递归搜索仅跳过 `.git` 与 `node_modules`。
- **文件查看器**：UTF-8 文本，带行号、语言标识和一键复制，超长内容提示截断；代码行按滚动位置分批挂载。
- **Git 审查**：工作区/最近提交切换、分支引用、变更文件树、增删统计和带行号 diff；支持并排/统一格式、全部行/隐藏未变更行，覆盖已暂存、未暂存与未跟踪文件，并对长 diff 分批渲染。

## 架构

- Host 半（`src/index.ts`）：`/sidebar/api/*` JSON 路由，用 `node:fs` + `node:child_process` 实现文件与 git 操作，会话 cwd 来自 `ctx.sessions.get(id).header.cwd`。
- Client 半（`src/client/index.tsx`）：React + `createRoot` portal 右栏，`useSyncExternalStore` 共享开/关/宽度/tab 状态。

## 构建

```sh
corepack enable            # 启用 pnpm（首次）
pnpm install
pnpm build                 # tsdown → lib/index.js + lib/client.js
```

## 挂载

插件格式与加载机制遵循 [DeepSeek Harness 官方开发文档](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)；组合包安装细节见[打包与安装插件](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)。

通过 CLI 安装（自动读取 `cordis.patch.yml`）：

```sh
cd ~/.dsh/profiles/web
npx -y --package @deepseek-ai/dsh dsh plugin --profile web add dsh-ui-workbench
```

或手动挂载：

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: ui-workbench
      name: 'dsh-ui-workbench'
```

装完重启 DSH 并硬刷新。
