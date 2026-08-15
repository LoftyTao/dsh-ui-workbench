# dsh-ui-workbench

<p align="center">中文 | <a href="https://github.com/LoftyTao/dsh-ui-workbench/blob/main/README.en.md">English</a></p>

## 概述

DeepSeek Harness 的 WebUI 插件。在会话页右侧增加一个面板，提供当前会话工作区的文件树、带行号的文件查看器与 Git 审查。

## DSH 元数据

| 字段 | 值 |
| --- | --- |
| Family | DSH UI |
| Category | Client |
| Role | Client |
| Capability | 工作区文件浏览与 Git 审查 |
| Provides | Host `/sidebar/api/*` 路由与 Browser 侧 Workbench 面板 |
| Injects | Host：`webServer`、`sessions`；Client：`slots`、`sessions`、`@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-slots` |
| Config | Host `Config` 当前为空对象；面板宽度由 Browser 状态管理，主题读取可用的 DSH `theme` 服务并观察 DSH DOM 主题标记，语言读取 DSH 文档状态 |
| Credential Boundary | 不保存凭据；通过会话作用域的 DSH Host 工作区服务访问文件与 Git 状态 |
| Model Experience | 在会话页提供可见的工作区审查面板 |
| Dependency | DSH `0.1.0-rc.6`、Node `>=22.19`、`pnpm@11.21.0`、React 18、Client Runtime |
| Status | Experimental |
| 适用范围 | `web` profile、DSH Web Client、当前会话工作区 |

![WebUI 插件界面截图](https://raw.githubusercontent.com/LoftyTao/dsh-ui-workbench/main/assets/workbench.png)

## 功能

- 当前会话工作区的文件树与文件名搜索
- 带行号、语法高亮和长行换行的 UTF-8 文件查看器
- 已暂存、未暂存、未跟踪文件及提交引用的 Git 差异审查
- 使用 Git 状态缩写 `M`、`A`、`D`、`R`、`C`、`T`、`U` 表达编辑状态；未跟踪文件使用 `U` 语义显示
- 统一和并排差异视图、变更文件筛选、上下文折叠
- 差异视图隐藏 Git patch 元数据，保留文件语法高亮，使用主题感知的 base/strong 两级背景区分整行与行内变更；行内范围对齐实际替换字符，纯新增或删除行只保留行背景，并在折叠区显示 `<count> unmodified lines`
- 中英文与亮暗主题适配，主题跟随 DSH 外观设置实时切换

## Provides / Model Experience

Host 入口负责会话作用域、路径安全、文件读取和 Git 操作；Browser 入口负责文件树、变更树、文件查看器和差异视图。文件浏览与 Git 审查共用目录树模型，目录、嵌套文件和刷新后的展开状态保持一致。

Git 审查在初次加载、手动刷新、会话或引用变化以及窗口重新可见时更新。选中的变更文件仍然存在时，刷新保留当前 diff；固定时间轮询保持关闭。

## Injects / Config

Host Function Plugin 使用 `webServer` 与 `sessions` 声明式注入，并导出空对象 `Config`。Client 入口使用 `slots` 与 `sessions`，主题服务按运行时可选读取；主题服务不可用时，工作台观察 `html` 的 `color-scheme` 与 `body[data-ds-dark-theme]`，因此主题修改无需新增 profile 注入或重启步骤。颜色复用 DSH `--dsw-*` token 与代码高亮 token。所有 Host 路由通过 `ctx.effect()` 注册并由 disposal 函数卸载。

## 热重载

Browser 入口使用全局 runtime owner 管理 root、slot、事件监听器、观察器和样式标签。新 bundle 在同一 Web 进程接管 owner 时先释放旧实例，再重新绑定 Host Context；面板开关、宽度、当前文件、Git 选择、筛选和差异布局保存在跨模块重载状态中。主题适配同时连接 DSH `theme/change` 与 DOM 观察接缝，构建产物 HMR、外观切换和主题服务重载均保持实时生效。开发 profile 的 HMR 监听范围需要包含 `plugins/client/dsh-ui-workbench/lib`，以便构建产物更新立即进入同一 Browser aggregate。

## 设计边界

浏览器只能通过 `src/client/api.ts` 访问 Host；Git 命令集中在 `src/git.ts`，文件系统访问集中在 `src/fs.ts`，路径树构建集中在 `src/client/tree.ts`。插件提供工作区审查界面，不承担 Git 提交、凭据保存或通用文件编辑职责。

## 测试与验收

```sh
pnpm check
pnpm pack:check
dsh plugin --profile web add ./plugins/client/dsh-ui-workbench
dsh --profile web --dump-config
```

测试覆盖 Git 未跟踪目录展开、共享目录树、Host Loader 契约、Host reload/rebind、Browser runtime disposal 和状态连续；包校验覆盖根入口、`./client`、`./invariant`、类型声明、patch 和 README。使用同一 Web 进程完成构建产物 reload，确认旧 root、slot、事件、观察器和样式释放后只保留当前实例。

## 安装

需要 Node.js 22.19+ 与带 `web` profile 的 DeepSeek Harness。

```sh
npx -y --package @deepseek-ai/dsh dsh plugin --profile web add github:LoftyTao/dsh-ui-workbench#v0.1.0
```

GitHub 安装会从源码构建，请在 DSH 提示时允许 `prepare` 脚本。将包加入 `web` profile 后，源码构建由 HMR 在同一 Web 进程接管；主题适配不增加重启步骤，页面加载一次即可完成初始 Browser aggregate。

## 许可证

MIT
