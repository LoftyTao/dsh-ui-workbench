/**
 * dsh-ui-workbench client half: a right-side workbench panel (file tree /
 * file viewer / git review) portalled onto document.body, sized via the CSS
 * `#root { margin-right: var(--uwb-width) }` push so the app shell yields
 * space but the official tool-details panel stays untouched. A header action
 * (beside the session title) toggles the panel; the panel's left edge drags
 * its width, and the file tree / viewer divider also drags.
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Context } from '../context-types.ts'
import * as api from './api.ts'
import './workbench.css'

export const inject = ['slots', 'sessions']

const DEFAULT_WIDTH = 720
const MIN_WIDTH = 320
const MAX_WIDTH = 1400
const TREE_MIN = 120
const TREE_MAX = 480

type IconName = 'chevron' | 'file' | 'folder' | 'git' | 'files' | 'refresh' | 'close' | 'copy' | 'branch'

function Icon(props: { name: IconName; size?: number; className?: string }): ReactNode {
  const size = props.size ?? 16
  const paths: Record<IconName, ReactNode> = {
    chevron: <path d="m9 18 6-6-6-6" />,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /></>,
    folder: <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
    git: <><circle cx="6" cy="5" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="6" cy="19" r="2" /><path d="M6 7v10M8 5h4a6 6 0 0 1 6 6v-3" /></>,
    files: <><path d="M15 2H6a2 2 0 0 0-2 2v13" /><path d="M18 6h-8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z" /></>,
    refresh: <><path d="M20 11a8 8 0 1 0-2.34 5.66" /><path d="M20 4v7h-7" /></>,
    close: <><path d="m18 6-12 12" /><path d="m6 6 12 12" /></>,
    copy: <><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>,
    branch: <><circle cx="6" cy="4" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="6" cy="20" r="2" /><path d="M6 6v12M18 8a6 6 0 0 1-6 6H6" /></>,
  }
  return (
    <svg className={props.className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[props.name]}
    </svg>
  )
}

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

function parentPath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index > 0 ? normalized.slice(0, index) : ''
}

function languageOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const languages: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TSX', js: 'JavaScript', jsx: 'JSX', json: 'JSON', css: 'CSS', scss: 'SCSS',
    html: 'HTML', md: 'Markdown', py: 'Python', rs: 'Rust', go: 'Go', java: 'Java', yml: 'YAML', yaml: 'YAML',
    sh: 'Shell', ps1: 'PowerShell', sql: 'SQL', toml: 'TOML', vue: 'Vue', svelte: 'Svelte',
  }
  return languages[ext] ?? (ext ? ext.toUpperCase() : 'Text')
}

/** Shared UI state held in the apply closure, subscribed via useSyncExternalStore. */
interface UiState {
  open: boolean
  tab: 'tree' | 'git'
  width: number
}

function createUiStore() {
  let state: UiState = { open: false, tab: 'tree', width: DEFAULT_WIDTH }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => state,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    set: (patch: Partial<UiState>) => {
      state = { ...state, ...patch }
      for (const fn of listeners) fn()
    },
  }
}

function splitLines(text: string): string[] {
  const lines = text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

interface FsTreeEntry {
  name: string
  dir: boolean
  path: string
}

function buildDirTree(files: api.FsEntry[], rootPath: string): FsTreeEntry[] {
  return files.map((f) => ({
    name: f.name,
    dir: f.dir,
    path: rootPath.replace(/[\\/]+$/, '') + '/' + f.name,
  }))
}

interface GitTreeEntry {
  name: string
  dir: boolean
  path: string | null
  code: string | null
  children: GitTreeEntry[] | null
}

function buildGitTree(files: api.GitFileEntry[]): GitTreeEntry[] {
  const root: GitTreeEntry = { name: '', dir: true, path: null, code: null, children: [] }
  for (const f of files) {
    const parts = f.path.split(/[\\/]/).filter((p) => p !== '')
    let node: GitTreeEntry = root
    parts.forEach((name, i) => {
      const isLeaf = i === parts.length - 1
      const children = node.children!
      let child = children.find((c) => c.name === name && c.dir === !isLeaf)
      if (child === undefined) {
        child = isLeaf
          ? { name, dir: false, path: f.path, code: f.code, children: null }
          : { name, dir: true, path: null, code: null, children: [] }
        children.push(child)
      }
      node = child
    })
  }
  return root.children ?? []
}

interface DiffRow {
  cls: 'hunk' | 'meta' | 'add' | 'del' | 'ctx'
  old: string
  neu: string
  text: string
}

function parseDiff(text: string): DiffRow[] {
  const out: DiffRow[] = []
  let oldN = 0
  let newN = 0
  for (const raw of splitLines(text)) {
    if (raw.indexOf('@@') === 0) {
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw)
      if (m) { oldN = parseInt(m[1] ?? '0', 10); newN = parseInt(m[2] ?? '0', 10) }
      out.push({ cls: 'hunk', old: '', neu: '', text: raw })
    } else if (
      raw.indexOf('+++ ') === 0 || raw.indexOf('--- ') === 0 || raw.indexOf('diff ') === 0
      || raw.indexOf('index ') === 0 || raw.indexOf('new file') === 0 || raw.indexOf('deleted file') === 0
      || raw.indexOf('similarity') === 0 || raw.indexOf('old mode') === 0 || raw.indexOf('new mode') === 0
      || raw.indexOf('Binary files') === 0 || raw === ''
    ) {
      out.push({ cls: 'meta', old: '', neu: '', text: raw })
    } else if (raw.charAt(0) === '+') {
      out.push({ cls: 'add', old: '', neu: String(newN), text: raw })
      newN += 1
    } else if (raw.charAt(0) === '-') {
      out.push({ cls: 'del', old: String(oldN), neu: '', text: raw })
      oldN += 1
    } else {
      out.push({ cls: 'ctx', old: String(oldN), neu: String(newN), text: raw })
      oldN += 1
      newN += 1
    }
  }
  return out
}

function FsTreeNode(props: {
  entry: FsTreeEntry
  onOpen: (entry: FsTreeEntry) => void
  selectedPath: string | null
  sessionId: string
  cwd: string | null
}): ReactNode {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FsTreeEntry[] | null>(null)
  const [loading, setLoading] = useState(false)

  const toggle = async (): Promise<void> => {
    if (!props.entry.dir) { props.onOpen(props.entry); return }
    if (!expanded) {
      setExpanded(true)
      if (children === null) {
        setLoading(true)
        const r = await api.listDir(props.sessionId, props.cwd, props.entry.path)
        setChildren(buildDirTree(r.entries, r.path))
        setLoading(false)
      }
    } else {
      setExpanded(false)
    }
  }

  const sel = props.selectedPath === props.entry.path
  return (
    <div>
      <div className={'uwb-row' + (props.entry.dir ? ' dir' : ' file') + (sel ? ' sel' : '')} onClick={() => void toggle()}>
        <span className={'uwb-chevron' + (expanded ? ' expanded' : '')}>{props.entry.dir ? <Icon name="chevron" size={13} /> : null}</span>
        <Icon name={props.entry.dir ? 'folder' : 'file'} size={15} className="uwb-file-icon" />
        <span className="uwb-row-label">{props.entry.name}</span>
      </div>
      {expanded ? (
        <div className="uwb-children">
          {loading ? <div className="uwb-empty">加载中…</div>
            : (children ?? []).map((c, i) => (
              <FsTreeNode key={i} entry={c} onOpen={props.onOpen} selectedPath={props.selectedPath} sessionId={props.sessionId} cwd={props.cwd} />
            ))}
        </div>
      ) : null}
    </div>
  )
}

function FileTree(props: { sessionId: string; cwd: string | null; onOpen: (entry: FsTreeEntry) => void; selectedPath: string | null }): ReactNode {
  const [rootEntries, setRootEntries] = useState<FsTreeEntry[]>([])
  const [rootPath, setRootPath] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    if (props.cwd == null) {
      setRootEntries([])
      setRootPath('')
      setErr('未找到当前工作区目录')
      return () => { live = false }
    }
    setErr('')
    api.listDir(props.sessionId, props.cwd).then((r) => {
      if (!live) return
      setRootPath(r.path)
      setRootEntries(buildDirTree(r.entries, r.path))
    }).catch((e: Error) => { if (live) setErr(e.message) })
    return () => { live = false }
  }, [props.sessionId, props.cwd])

  return (
    <div className="uwb-tree-content">
      <div className="uwb-tree-title">
        <span>工作区</span>
        <span className="uwb-tree-count">{rootEntries.length}</span>
      </div>
      <p className="uwb-path uwb-root-path" title={rootPath || props.cwd || ''}>{fileName(rootPath || props.cwd || '') || '未连接'}</p>
      {err ? <div className="uwb-empty uwb-err">{err}</div>
        : rootEntries.map((c, i) => (
          <FsTreeNode key={i} entry={c} onOpen={props.onOpen} selectedPath={props.selectedPath} sessionId={props.sessionId} cwd={props.cwd} />
        ))}
    </div>
  )
}

function FileViewer(props: { sessionId: string; cwd: string | null; file: FsTreeEntry | null }): ReactNode {
  const [content, setContent] = useState<{ path: string; text: string; truncated: boolean } | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (props.file == null) { setContent(null); return }
    let live = true
    setContent(null)
    setErr('')
    api.readFile(props.sessionId, props.cwd, props.file.path).then((r) => {
      if (live) setContent({ path: r.path, text: r.content, truncated: r.truncated })
    }).catch((e: Error) => { if (live) setErr(e.message) })
    return () => { live = false }
  }, [props.sessionId, props.cwd, props.file])

  if (props.file == null) return <EmptyState icon="files" title="选择一个文件" detail="从左侧项目树中打开文件进行预览" />
  if (err) return <div className="uwb-empty uwb-err">{err}</div>
  if (content === null) return <div className="uwb-empty">读取中…</div>

  const lines = splitLines(content.text)
  return (
    <div className="uwb-document">
      <div className="uwb-file-head">
        <div className="uwb-file-ident">
          <Icon name="file" size={16} />
          <div><strong>{fileName(content.path)}</strong><span>{parentPath(content.path)}</span></div>
        </div>
        <div className="uwb-file-actions">
          <span className="uwb-language">{languageOf(content.path)}</span>
          <button className="uwb-icon-btn" onClick={() => void navigator.clipboard?.writeText(content.text)} title="复制文件内容" aria-label="复制文件内容"><Icon name="copy" size={15} /></button>
        </div>
      </div>
      {content.truncated ? <div className="uwb-notice">内容过长，仅显示前 500,000 个字符</div> : null}
      <div className="uwb-code-view">
        {lines.map((ln, i) => (
          <div className="uwb-line" key={i}>
            <span className="uwb-ln">{String(i + 1)}</span>
            <span className="uwb-lc">{ln || ' '}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState(props: { icon: IconName; title: string; detail: string }): ReactNode {
  return (
    <div className="uwb-empty-state">
      <span className="uwb-empty-icon"><Icon name={props.icon} size={22} /></span>
      <strong>{props.title}</strong>
      <span>{props.detail}</span>
    </div>
  )
}

function GitTreeNodeView(props: { node: GitTreeEntry; onOpen: (node: GitTreeEntry) => void; selectedPath: string | null }): ReactNode {
  const [expanded, setExpanded] = useState(false)
  const isLeaf = props.node.dir === false
  const sel = props.selectedPath === props.node.path
  const first = String(props.node.code ?? '').charAt(0).trim()
  const codeClass = first === 'A' ? 'A' : first === 'D' ? 'D' : (first === 'M' || first === 'R') ? 'M' : 'U'
  return (
    <div>
      <div
        className={'uwb-row' + (isLeaf ? ' file' : ' dir') + (sel ? ' sel' : '')}
        onClick={() => { if (isLeaf) props.onOpen(props.node); else setExpanded(!expanded) }}
      >
        <span className={'uwb-chevron' + (expanded ? ' expanded' : '')}>{isLeaf ? null : <Icon name="chevron" size={13} />}</span>
        <Icon name={isLeaf ? 'file' : 'folder'} size={15} className="uwb-file-icon" />
        {isLeaf ? <span className={'uwb-code ' + codeClass}>{String(props.node.code ?? '?').replace(/\s/g, '') || '?'}</span> : null}
        <span className="uwb-row-label">{props.node.name}</span>
      </div>
      {!isLeaf && expanded ? (
        <div className="uwb-children">
          {(props.node.children ?? []).map((c, i) => (
            <GitTreeNodeView key={i} node={c} onOpen={props.onOpen} selectedPath={props.selectedPath} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function GitReview(props: { sessionId: string; cwd: string | null }): ReactNode {
  const [branchList, setBranchList] = useState<string[]>([])
  const [currentBranch, setCurrentBranch] = useState('')
  const [viewMode, setViewMode] = useState<'work' | 'last'>('work')
  const [ref, setRef] = useState('')
  const [workFiles, setWorkFiles] = useState<api.GitFileEntry[]>([])
  const [lastFiles, setLastFiles] = useState<api.GitFileEntry[]>([])
  const [sel, setSel] = useState<{ path: string; source: 'work' | 'last' } | null>(null)
  const [diffText, setDiffText] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [diffErr, setDiffErr] = useState('')

  const refresh = useCallback(async (): Promise<void> => {
    setErr('')
    const refFor = ref || 'HEAD'
    const [b, bs, w, l] = await Promise.all([
      api.gitBranch(props.sessionId, props.cwd),
      api.gitBranches(props.sessionId, props.cwd),
      api.gitStatusFiles(props.sessionId, props.cwd),
      api.gitLastCommitFiles(props.sessionId, props.cwd, refFor),
    ])
    setCurrentBranch(b)
    setBranchList(bs)
    setWorkFiles(w)
    setLastFiles(l)
  }, [props.sessionId, props.cwd, ref])

  useEffect(() => { void refresh().catch((e: Error) => setErr(e.message)) }, [refresh])

  const openFile = async (node: GitTreeEntry, source: 'work' | 'last'): Promise<void> => {
    if (node.path == null) return
    setSel({ path: node.path, source })
    setDiffErr('')
    setLoading(true)
    try {
      const refFor = ref || 'HEAD'
      const d = source === 'work'
        ? await api.gitDiffFile(props.sessionId, props.cwd, node.path)
        : await api.gitLastFileDiff(props.sessionId, props.cwd, node.path, refFor)
      setDiffText(d)
    } catch (e) {
      setDiffErr(e instanceof Error ? e.message : '读取 diff 失败')
    } finally {
      setLoading(false)
    }
  }

  const shownFiles = viewMode === 'work' ? workFiles : lastFiles
  const tree = useMemo(() => buildGitTree(shownFiles), [shownFiles])
  const diffRows = useMemo(() => parseDiff(diffText), [diffText])
  const additions = diffRows.filter((row) => row.cls === 'add').length
  const deletions = diffRows.filter((row) => row.cls === 'del').length
  const effRef = ref || currentBranch || 'HEAD'

  return (
    <div className="uwb-review">
      <div className="uwb-review-sidebar">
        <div className="uwb-review-controls">
          <label className="uwb-control-label">审查范围</label>
          <select className="uwb-select uwb-select-wide" value={viewMode} onChange={(e) => { setViewMode(e.target.value as 'work' | 'last'); setSel(null); setDiffText(''); setDiffErr('') }}>
            <option value="work">工作区变更</option>
            <option value="last">最近一次提交</option>
          </select>
          <label className="uwb-control-label">{viewMode === 'work' ? '当前分支' : '提交引用'}</label>
          <div className="uwb-select-wrap">
            <Icon name="branch" size={14} />
            <select className="uwb-select uwb-select-wide" disabled={viewMode === 'work'} value={effRef} onChange={(e) => { setRef(e.target.value); setSel(null); setDiffText(''); setDiffErr('') }}>
              {branchList.length > 0 ? branchList.map((n) => <option key={n} value={n}>{n}</option>) : <option value={effRef}>{effRef}</option>}
            </select>
          </div>
        </div>
        <div className="uwb-changes-head">
          <span>变更</span><span className="uwb-count-badge">{shownFiles.length}</span>
          <button className="uwb-icon-btn" onClick={() => void refresh()} title="刷新变更" aria-label="刷新变更"><Icon name="refresh" size={14} /></button>
        </div>
        <div className="uwb-change-tree">
          {err ? <div className="uwb-empty uwb-err">{err}</div> : null}
          {shownFiles.length === 0 ? <EmptyState icon="git" title="没有变更" detail={viewMode === 'work' ? '工作区是干净的' : '此提交没有文件变更'} />
            : tree.map((n, i) => <GitTreeNodeView key={i} node={n} onOpen={(nd) => void openFile(nd, viewMode)} selectedPath={sel?.path ?? null} />)}
        </div>
      </div>
      <div className="uwb-review-main">
        {sel == null ? <EmptyState icon="git" title="选择一项变更" detail="在左侧选择文件以查看逐行差异" />
          : (
            <div className="uwb-document">
              <div className="uwb-file-head">
                <div className="uwb-file-ident">
                  <Icon name="file" size={16} />
                  <div><strong>{fileName(sel.path)}</strong><span>{parentPath(sel.path)}</span></div>
                </div>
                <div className="uwb-diff-stats"><span className="add">+{additions}</span><span className="del">−{deletions}</span></div>
              </div>
              {diffErr ? <div className="uwb-empty uwb-err">{diffErr}</div> : null}
              {loading ? <div className="uwb-loading"><span />读取差异…</div>
                : diffRows.length === 0 ? <EmptyState icon="git" title="没有可显示的差异" detail="文件可能仅存在于暂存区或尚未被 Git 跟踪" />
                  : <div className="uwb-code-view uwb-diff-view">{diffRows.map((r, i) => (
                    <div className={'uwb-line uwb-diff-' + r.cls} key={i}>
                      <span className="uwb-ln">{r.old}</span>
                      <span className="uwb-ln">{r.neu}</span>
                      <span className="uwb-lc">{r.text || ' '}</span>
                    </div>
                  ))}</div>}
            </div>
          )}
      </div>
    </div>
  )
}

function Workbench(props: { ctx: Context; ui: ReturnType<typeof createUiStore> }): ReactNode {
  const ui = useSyncExternalStore(props.ui.subscribe, props.ui.getSnapshot)
  const [sessionList, setSessionList] = useState<{ current?: string; byId: Record<string, { cwd?: string }> }>({ byId: {} })
  const [file, setFile] = useState<FsTreeEntry | null>(null)
  const [treeW, setTreeW] = useState(220)
  const [resizeDrag, setResizeDrag] = useState<{ start: number; x: number } | null>(null)
  const [treeDrag, setTreeDrag] = useState<{ start: number; x: number } | null>(null)

  useEffect(() => {
    const sessions = props.ctx.sessions
    const list = sessions?.list
    if (list) {
      const update = (): void => setSessionList(list.getSnapshot())
      update()
      return list.subscribe(update)
    }
    return undefined
  }, [props.ctx])

  const sessionId = sessionList.current
  const cwd = sessionId != null ? (sessionList.byId[sessionId]?.cwd ?? null) : null
  const [resolvedCwd, setResolvedCwd] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    if (sessionId == null) { setResolvedCwd(null); return () => { live = false } }
    if (cwd != null) { setResolvedCwd(cwd); return () => { live = false } }
    api.sessionCwd(sessionId).then((r) => { if (live) setResolvedCwd(r) })
    return () => { live = false }
  }, [sessionId, cwd])

  const effectiveCwd = cwd ?? resolvedCwd

  useEffect(() => {
    document.documentElement.style.setProperty('--uwb-width', ui.open ? `${Math.min(ui.width, window.innerWidth)}px` : '0px')
  }, [ui.open, ui.width])

  useEffect(() => {
    if (!ui.open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') props.ui.set({ open: false })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [ui.open, props.ui])

  useEffect(() => {
    if (resizeDrag == null) return
    const move = (e: MouseEvent): void => {
      const nx = resizeDrag.start - (e.clientX - resizeDrag.x)
      props.ui.set({ width: Math.max(MIN_WIDTH, Math.min(nx, MAX_WIDTH)) })
    }
    const up = (): void => setResizeDrag(null)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [resizeDrag, props.ui])

  useEffect(() => {
    if (treeDrag == null) return
    const move = (e: MouseEvent): void => {
      const nx = treeDrag.start + (e.clientX - treeDrag.x)
      setTreeW(Math.max(TREE_MIN, Math.min(nx, TREE_MAX)))
    }
    const up = (): void => setTreeDrag(null)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [treeDrag])

  const sid = sessionId ?? ''

  useEffect(() => { setFile(null) }, [sessionId])

  return (
    <div className={'uwb-root' + (ui.open ? '' : ' uwb-closed')} style={{ width: ui.width }}>
      <div className="uwb-resize" onMouseDown={(e) => { e.preventDefault(); setResizeDrag({ start: ui.width, x: e.clientX }) }} />
      <div className="uwb-head">
        <div className="uwb-brand"><span className="uwb-brand-mark"><Icon name="files" size={15} /></span><span>工作台</span></div>
        <div className="uwb-tabs" role="tablist" aria-label="工作台视图">
          <button role="tab" aria-selected={ui.tab === 'tree'} className={'uwb-tab' + (ui.tab === 'tree' ? ' on' : '')} onClick={() => props.ui.set({ tab: 'tree' })}><Icon name="files" size={14} />文件</button>
          <button role="tab" aria-selected={ui.tab === 'git'} className={'uwb-tab' + (ui.tab === 'git' ? ' on' : '')} onClick={() => props.ui.set({ tab: 'git' })}><Icon name="git" size={14} />审查</button>
        </div>
        <button className="uwb-close uwb-icon-btn" onClick={() => props.ui.set({ open: false })} title="关闭 (Esc)" aria-label="关闭工作台"><Icon name="close" size={16} /></button>
      </div>
      {ui.tab === 'tree' ? (
        <div className="uwb-body">
          <div className="uwb-tree" style={{ width: treeW }}>
            <FileTree sessionId={sid} cwd={effectiveCwd} onOpen={setFile} selectedPath={file?.path ?? null} />
          </div>
          <div
            className="uwb-tree-resize"
            onMouseDown={(e) => { e.preventDefault(); setTreeDrag({ start: treeW, x: e.clientX }) }}
          />
          <div className="uwb-view"><FileViewer sessionId={sid} cwd={effectiveCwd} file={file} /></div>
        </div>
      ) : (
        <GitReview sessionId={sid} cwd={effectiveCwd} />
      )}
    </div>
  )
}

export function apply(ctx: Context): void {
  const ui = createUiStore()
  let rootDiv: HTMLDivElement | undefined
  let root: Root | undefined

  ctx.effect(() => {
    rootDiv = document.createElement('div')
    rootDiv.setAttribute('data-uwb-root', '')
    document.body.appendChild(rootDiv)
    root = createRoot(rootDiv)
    root.render(<Workbench ctx={ctx} ui={ui} />)
    return () => {
      root?.unmount()
      rootDiv?.remove()
      document.documentElement.style.setProperty('--uwb-width', '0px')
    }
  }, 'dsh-ui-workbench: mount')

  ctx.effect(() => ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register(
    { name: 'conversation.session.header.actions', id: 'ui-workbench', order: 30 },
    () => {
      const open = useSyncExternalStore(ui.subscribe, () => ui.getSnapshot().open)
      return (
        <button
          className={'uwb-openbtn' + (open ? ' on' : '')}
          onClick={() => ui.set({ open: !open })}
          title={open ? '关闭文件与审查' : '打开文件与审查（右侧面板）'}
        >
          <Icon name={open ? 'close' : 'files'} size={15} /><span>{open ? '关闭工作台' : '文件与审查'}</span>
        </button>
      )
    },
  )), 'dsh-ui-workbench: header action')
}
