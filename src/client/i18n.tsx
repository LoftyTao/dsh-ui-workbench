import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/**
 * Workbench UI strings.
 *
 * `en` is the source of truth for the key list; `zh` is type-checked against it
 * (`Record<MessageKey, string>`), so adding, renaming or removing a key in only
 * one locale fails the build instead of surfacing as a runtime crash.
 *
 * To add a string: add the key to `en`, then add the matching key to `zh` in the
 * same position. Placeholders such as `{count}` are interpolated via `t(key, values)`.
 */
const en = {
  // Toggle & tabs
  filesReview: 'Files & review',
  openFilesReview: 'Open files & review',
  closeFilesReview: 'Close files & review',
  files: 'Files',
  review: 'Review',
  workbenchViews: 'Workbench views',
  resizeWorkbench: 'Resize workbench',
  resizeTree: 'Resize file tree',
  // File tree & search
  loading: 'Loading…',
  noWorkspace: 'Current workspace directory was not found',
  listDirFailed: 'Failed to read directory',
  searchFailed: 'Search failed',
  searchWorkspace: 'Search workspace files',
  clearSearch: 'Clear search',
  noMatchingFiles: 'No matching files',
  limitedResults: 'Showing the first {count} results. Use a more specific name.',
  readFileFailed: 'Failed to read file',
  // File viewer
  selectFile: 'Select a file',
  selectFileDetail: 'Open a file from the project tree to preview it',
  reading: 'Reading…',
  copyFilePath: 'Copy file path',
  largeFile: 'This file is large. More content loads as you scroll.',
  shownLines: 'Showing {shown} / {total} lines · Scroll down to load more',
  readingNext: 'Reading the next chunk…',
  continueReading: 'Keep scrolling to read the next chunk',
  // Review toolbar
  readDiffFailed: 'Failed to read diff',
  refreshFailed: 'Failed to refresh changes',
  searchChangedFiles: 'Search changed files',
  reviewScope: 'Review scope',
  workspaceChanges: 'Workspace changes',
  lastCommit: 'Last commit',
  currentBranch: 'Current branch',
  commitRef: 'Commit reference',
  changes: 'Changes',
  refreshChanges: 'Refresh changes',
  noChanges: 'No changes',
  cleanWorkspace: 'The workspace is clean',
  noCommitChanges: 'This commit has no file changes',
  // Git bootstrap
  noGit: 'No Git repository yet',
  noGitDetail: 'Create a Git repository in this workspace to start reviewing file changes',
  createGit: 'Create Git repository',
  creatingGit: 'Creating…',
  createGitFailed: 'Failed to create Git repository',
  // Review list & diff
  resizeReviewList: 'Resize review list',
  selectChange: 'Select a change',
  selectChangeDetail: 'Select a file on the left to inspect its diff',
  diffLayout: 'Diff layout',
  diffContext: 'Diff context',
  splitDiff: 'Show side-by-side diff',
  unifiedDiff: 'Show unified diff',
  showAllLines: 'Show all lines',
  hideUnchanged: 'Hide unchanged lines',
  readingDiff: 'Reading diff…',
  noDiff: 'No diff to display',
  noDiffDetail: 'The file may only be staged or not yet tracked by Git',
} as const

type MessageKey = keyof typeof en

const zh: Record<MessageKey, string> = {
  // Toggle & tabs
  filesReview: '文件与审查',
  openFilesReview: '打开文件与审查',
  closeFilesReview: '关闭文件与审查',
  files: '文件',
  review: '审查',
  workbenchViews: '工作台视图',
  resizeWorkbench: '调整工作台宽度',
  resizeTree: '调整文件树宽度',
  // File tree & search
  loading: '加载中…',
  noWorkspace: '未找到当前工作区目录',
  listDirFailed: '读取目录失败',
  searchFailed: '搜索失败',
  searchWorkspace: '搜索工作区文件',
  clearSearch: '清除搜索',
  noMatchingFiles: '没有匹配的文件',
  limitedResults: '仅显示前 {count} 项，请输入更具体的名称',
  readFileFailed: '读取文件失败',
  // File viewer
  selectFile: '选择一个文件',
  selectFileDetail: '从左侧项目树中打开文件进行预览',
  reading: '读取中…',
  copyFilePath: '复制文件路径',
  largeFile: '文件较大，内容将在滚动时分块加载',
  shownLines: '已显示 {shown} / {total} 行 · 向下滚动继续加载',
  readingNext: '正在读取下一段…',
  continueReading: '继续滚动以读取下一段',
  // Review toolbar
  readDiffFailed: '读取 diff 失败',
  refreshFailed: '刷新变更失败',
  searchChangedFiles: '搜索变更文件',
  reviewScope: '审查范围',
  workspaceChanges: '工作区变更',
  lastCommit: '最近一次提交',
  currentBranch: '当前分支',
  commitRef: '提交引用',
  changes: '变更',
  refreshChanges: '刷新变更',
  noChanges: '没有变更',
  cleanWorkspace: '工作区是干净的',
  noCommitChanges: '此提交没有文件变更',
  // Git bootstrap
  noGit: '尚未创建 Git 仓库',
  noGitDetail: '在当前工作区创建 Git 仓库后即可审查文件变更',
  createGit: '创建 Git 仓库',
  creatingGit: '正在创建…',
  createGitFailed: '创建 Git 仓库失败',
  // Review list & diff
  resizeReviewList: '调整审查列表宽度',
  selectChange: '选择一项变更',
  selectChangeDetail: '在左侧选择文件以查看逐行差异',
  diffLayout: '差异布局',
  diffContext: '差异上下文',
  splitDiff: '显示并排差异',
  unifiedDiff: '统一格式差异',
  showAllLines: '显示所有行',
  hideUnchanged: '隐藏未变更的行',
  readingDiff: '读取差异…',
  noDiff: '没有可显示的差异',
  noDiffDetail: '文件可能仅存在于暂存区或尚未被 Git 跟踪',
}

const messages = { en, zh }

type Locale = keyof typeof messages
type Translate = (key: MessageKey, values?: Record<string, string | number>) => string

function localeFromDocument(): Locale {
  const harnessHeader = document.querySelector('[data-slot="conversation.session.header"] header')
  const harnessTabs = [...(harnessHeader?.querySelectorAll('[role="tab"]') ?? [])].map((tab) => tab.textContent?.trim())
  if (harnessTabs.includes('Chat') || harnessTabs.includes('Trajectory')) return 'en'
  if (harnessTabs.includes('对话') || harnessTabs.includes('轨迹')) return 'zh'
  return document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

const I18nContext = createContext<{ locale: Locale; t: Translate } | null>(null)

export function I18nProvider(props: { children: ReactNode }): ReactNode {
  const [locale, setLocale] = useState<Locale>(localeFromDocument)
  useEffect(() => {
    const update = (): void => setLocale(localeFromDocument())
    const languageObserver = new MutationObserver(update)
    languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    const headerSlot = document.querySelector('[data-slot="conversation.session.header"]')
    const headerObserver = new MutationObserver(update)
    if (headerSlot !== null) headerObserver.observe(headerSlot, { childList: true, subtree: true, characterData: true })
    window.addEventListener('languagechange', update)
    update()
    return () => {
      languageObserver.disconnect()
      headerObserver.disconnect()
      window.removeEventListener('languagechange', update)
    }
  }, [])
  const value = useMemo(() => {
    const t: Translate = (key, values = {}) => {
      let text: string = messages[locale][key]
      for (const [name, replacement] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(replacement))
      return text
    }
    return { locale, t }
  }, [locale])
  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>
}

export function useI18n(): { locale: Locale; t: Translate } {
  const value = useContext(I18nContext)
  if (value === null) throw new Error('useI18n must be used inside I18nProvider')
  return value
}
