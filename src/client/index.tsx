/**
 * dsh-ui-workbench client half: a right-side workbench panel (file tree /
 * file viewer / git review) portalled onto document.body, sized via the CSS
 * `#root { margin-right: var(--uwb-width) }` push so the app shell yields
 * space but the official tool-details panel stays untouched. A header action
 * (beside the session title) toggles the panel; the panel's left edge drags
 * its width, and the file tree / viewer divider also drags.
 */
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, useState, type ReactNode, type RefObject, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BracketsYellow as JsonFileIcon, CodeBlue as CssFileIcon, Docker as DockerFileIcon, Document as DocumentFileIcon, Go as GoFileIcon, Ignore as IgnoreFileIcon, Image as ImageFileIcon, Java as JavaFileIcon, Js as JavaScriptFileIcon, Markdown as MarkdownFileIcon, NPM as NpmFileIcon, PNPM as PnpmFileIcon, Python as PythonFileIcon, Reactjs as ReactJavaScriptFileIcon, Reactts as ReactTypeScriptFileIcon, Rust as RustFileIcon, Sass as SassFileIcon, Shell as ShellFileIcon, SVG as SvgFileIcon, Svelte as SvelteFileIcon, Text as TextFileIcon, Tsconfig as TsconfigFileIcon, TypeScript as TypeScriptFileIcon, Vue as VueFileIcon, XML as XmlFileIcon, Yaml as YamlFileIcon } from '@react-symbols/icons/files'
import { Folder as FolderFileIcon } from '@react-symbols/icons/folders'
import Prism from 'prismjs'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-scss'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-powershell'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-sql'
import type { Context } from '../context-types.ts'
import * as api from './api.ts'
import './workbench.css'

export const inject = ['slots', 'sessions']

const DEFAULT_WIDTH = 720
const MIN_WIDTH = 320
const MAX_WIDTH = 1400
const TREE_MIN = 120
const TREE_MAX = 480
const PRISM_LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', json: 'json', css: 'css', scss: 'scss',
  html: 'markup', htm: 'markup', xml: 'markup', svg: 'markup', md: 'markdown', py: 'python', sh: 'bash',
  bash: 'bash', ps1: 'powershell', yml: 'yaml', yaml: 'yaml', sql: 'sql',
}
const FILE_ICON_BY_NAME: Record<string, typeof TextFileIcon> = {
  'package.json': NpmFileIcon, 'package-lock.json': NpmFileIcon, 'pnpm-lock.yaml': PnpmFileIcon,
  'pnpm-lock.yml': PnpmFileIcon, dockerfile: DockerFileIcon, '.gitignore': IgnoreFileIcon, 'tsconfig.json': TsconfigFileIcon,
}
const FILE_ICON_BY_EXTENSION: Record<string, typeof TextFileIcon> = {
  ts: TypeScriptFileIcon, tsx: ReactTypeScriptFileIcon, js: JavaScriptFileIcon, jsx: ReactJavaScriptFileIcon,
  json: JsonFileIcon, css: CssFileIcon, scss: SassFileIcon, sass: SassFileIcon, html: XmlFileIcon, htm: XmlFileIcon,
  xml: XmlFileIcon, md: MarkdownFileIcon, mdx: MarkdownFileIcon, py: PythonFileIcon, rs: RustFileIcon, go: GoFileIcon,
  java: JavaFileIcon, vue: VueFileIcon, svelte: SvelteFileIcon, yml: YamlFileIcon, yaml: YamlFileIcon,
  svg: SvgFileIcon, png: ImageFileIcon, jpg: ImageFileIcon, jpeg: ImageFileIcon, gif: ImageFileIcon, webp: ImageFileIcon,
  sh: ShellFileIcon, bash: ShellFileIcon, zsh: ShellFileIcon, ps1: ShellFileIcon, txt: TextFileIcon,
}

type IconName = 'chevron' | 'file' | 'folder' | 'git' | 'files' | 'refresh' | 'close' | 'copy' | 'branch' | 'search'

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
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
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

function workspaceFilePath(cwd: string | null, path: string): string {
  if (/^(?:[a-z]:[\\/]|\/)/i.test(path) || cwd === null) return path
  const separator = cwd.includes('\\') ? '\\' : '/'
  return `${cwd.replace(/[\\/]$/, '')}${separator}${path.replace(/[\\/]/g, separator).replace(/^[\\/]/, '')}`
}

function prismLanguage(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return PRISM_LANGUAGE_BY_EXTENSION[ext] ?? null
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function highlightedLines(text: string, language: string | null): string[] | null {
  if (language === null) return null
  const grammar = Prism.languages[language]
  if (grammar === undefined) return null
  const lines = ['']
  const appendText = (value: string, classes: string[]): void => {
    const parts = value.split('\n')
    parts.forEach((part, index) => {
      const escaped = escapeHtml(part)
      const html = classes.length > 0 && escaped !== '' ? `<span class="${classes.join(' ')}">${escaped}</span>` : escaped
      lines[lines.length - 1] = (lines[lines.length - 1] ?? '') + html
      if (index < parts.length - 1) lines.push('')
    })
  }
  const visit = (value: string | Prism.Token | Array<string | Prism.Token>, classes: string[] = []): void => {
    if (typeof value === 'string') { appendText(value, classes); return }
    if (Array.isArray(value)) { value.forEach((child) => visit(child, classes)); return }
    const alias = Array.isArray(value.alias) ? value.alias : value.alias === undefined ? [] : [value.alias]
    visit(value.content, [...classes, 'token', value.type, ...alias])
  }
  visit(Prism.tokenize(text, grammar))
  if (lines.length > 0 && lines[lines.length - 1] === '' && text.endsWith('\n')) lines.pop()
  return lines
}

function FileTypeIcon(props: { name: string; size?: number }): ReactNode {
  const name = fileName(props.name).toLowerCase()
  const extension = name.split('.').pop() ?? ''
  const FileSvg = FILE_ICON_BY_NAME[name] ?? FILE_ICON_BY_EXTENSION[extension] ?? DocumentFileIcon
  const size = props.size ?? 16
  return <FileSvg className="uwb-file-type-icon" width={size} height={size} aria-hidden="true" />
}

function useLazyLimit(total: number, resetKey: string, batch = 400): { limit: number; sentinel: RefObject<HTMLDivElement> } {
  const [limit, setLimit] = useState(batch)
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => { setLimit(batch) }, [batch, resetKey])
  useEffect(() => {
    const node = sentinel.current
    if (node === null || limit >= total) return
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setLimit((value) => Math.min(value + batch, total))
    }, { rootMargin: '240px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [batch, limit, total])
  return { limit, sentinel }
}

function ResizeHandle(props: {
  className: string
  value: number
  direction: 1 | -1
  min: number
  max: number
  label: string
  onChange: (value: number) => void
}): ReactNode {
  const origin = useRef(0)
  const latest = useRef(0)
  const base = useRef(props.value)
  const frame = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    document.body.classList.remove('uwb-is-resizing')
  }, [])

  const update = (): void => {
    frame.current = null
    const next = base.current + props.direction * (latest.current - origin.current)
    props.onChange(Math.max(props.min, Math.min(next, props.max)))
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    origin.current = event.clientX
    latest.current = event.clientX
    base.current = props.value
    setDragging(true)
    document.body.classList.add('uwb-is-resizing')
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    latest.current = event.clientX
    frame.current ??= requestAnimationFrame(update)
  }
  const finish = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    update()
    setDragging(false)
    document.body.classList.remove('uwb-is-resizing')
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    let next: number | undefined
    if (event.key === 'ArrowLeft') next = props.value - 10
    if (event.key === 'ArrowRight') next = props.value + 10
    if (event.key === 'Home') next = props.min
    if (event.key === 'End') next = props.max
    if (next === undefined) return
    event.preventDefault()
    props.onChange(Math.max(props.min, Math.min(next, props.max)))
  }
  return <div className={props.className} role="separator" tabIndex={0} aria-label={props.label} aria-orientation="vertical" aria-valuemin={props.min} aria-valuemax={props.max} aria-valuenow={Math.round(props.value)} data-dragging={dragging || undefined} onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finish} onPointerCancel={finish} />
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

interface SplitDiffRow {
  kind: 'line' | 'wide'
  oldLine: string
  newLine: string
  oldText: string
  newText: string
  oldClass: DiffRow['cls']
  newClass: DiffRow['cls']
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

function pairDiffRows(rows: DiffRow[]): SplitDiffRow[] {
  const paired: SplitDiffRow[] = []
  for (let index = 0; index < rows.length;) {
    const row = rows[index]
    if (row === undefined) break
    if (row.cls === 'hunk' || row.cls === 'meta') {
      paired.push({ kind: 'wide', oldLine: '', newLine: '', oldText: row.text, newText: '', oldClass: row.cls, newClass: row.cls })
      index += 1
      continue
    }
    if (row.cls === 'ctx') {
      paired.push({ kind: 'line', oldLine: row.old, newLine: row.neu, oldText: row.text.slice(1), newText: row.text.slice(1), oldClass: 'ctx', newClass: 'ctx' })
      index += 1
      continue
    }

    const deleted: DiffRow[] = []
    const added: DiffRow[] = []
    while (rows[index]?.cls === 'del') { deleted.push(rows[index]!); index += 1 }
    while (rows[index]?.cls === 'add') { added.push(rows[index]!); index += 1 }
    const count = Math.max(deleted.length, added.length)
    for (let offset = 0; offset < count; offset += 1) {
      const del = deleted[offset]
      const add = added[offset]
      paired.push({
        kind: 'line',
        oldLine: del?.old ?? '',
        newLine: add?.neu ?? '',
        oldText: del?.text.slice(1) ?? '',
        newText: add?.text.slice(1) ?? '',
        oldClass: del === undefined ? 'meta' : 'del',
        newClass: add === undefined ? 'meta' : 'add',
      })
    }
  }
  return paired
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
        {props.entry.dir ? <FolderFileIcon className="uwb-file-icon" width={16} height={16} aria-hidden="true" /> : <FileTypeIcon name={props.entry.name} size={16} />}
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
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    if (props.cwd == null) {
      setRootEntries([])
      setErr('未找到当前工作区目录')
      return () => { live = false }
    }
    setErr('')
    api.listDir(props.sessionId, props.cwd).then((r) => {
      if (!live) return
      setRootEntries(buildDirTree(r.entries, r.path))
    }).catch((e: Error) => { if (live) setErr(e.message) })
    return () => { live = false }
  }, [props.sessionId, props.cwd])

  return (
    <div className="uwb-tree-content">
      {err ? <div className="uwb-empty uwb-err">{err}</div>
        : rootEntries.map((c, i) => (
          <FsTreeNode key={i} entry={c} onOpen={props.onOpen} selectedPath={props.selectedPath} sessionId={props.sessionId} cwd={props.cwd} />
        ))}
    </div>
  )
}

function WorkspaceSearch(props: {
  sessionId: string
  cwd: string | null
  onOpen: (entry: FsTreeEntry) => void
}): ReactNode {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<api.FsSearchEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const normalized = query.trim()
    if (normalized === '' || props.sessionId === '' || props.cwd === null) {
      setResults([])
      setTruncated(false)
      setLoading(false)
      setError('')
      return
    }
    let live = true
    setLoading(true)
    const timer = window.setTimeout(() => {
      api.searchFiles(props.sessionId, props.cwd, normalized).then((response) => {
        if (!live) return
        setResults(response.entries)
        setTruncated(response.truncated)
        setError('')
      }).catch((reason: unknown) => {
        if (!live) return
        setResults([])
        setError(reason instanceof Error ? reason.message : '搜索失败')
      }).finally(() => { if (live) setLoading(false) })
    }, 180)
    return () => { live = false; window.clearTimeout(timer) }
  }, [props.cwd, props.sessionId, query])

  const active = query.trim() !== ''
  return (
    <div className={'uwb-search' + (active ? ' active' : '')}>
      <div className="uwb-search-box">
        <Icon name="search" size={15} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索工作区文件" aria-label="搜索工作区文件" />
        {loading ? <span className="uwb-search-spinner" /> : null}
        {active && !loading ? <button className="uwb-search-clear" onClick={() => setQuery('')} aria-label="清除搜索"><Icon name="close" size={13} /></button> : null}
      </div>
      {active ? (
        <div className="uwb-search-results">
          {error ? <div className="uwb-search-status uwb-err">{error}</div> : null}
          {!loading && error === '' && results.length === 0 ? <div className="uwb-search-status">没有匹配的文件</div> : null}
          {results.map((result) => (
            <button key={result.path} className="uwb-search-result" onClick={() => {
              props.onOpen({ name: result.name, path: result.path, dir: false })
              setQuery('')
            }}>
              <FileTypeIcon name={result.name} size={16} />
              <span><strong>{result.name}</strong><small>{result.relative}</small></span>
            </button>
          ))}
          {truncated ? <div className="uwb-search-status">仅显示前 {results.length} 项，请输入更具体的名称</div> : null}
        </div>
      ) : null}
    </div>
  )
}

function FileViewer(props: { sessionId: string; cwd: string | null; file: FsTreeEntry | null }): ReactNode {
  const [content, setContent] = useState<{ path: string; text: string; truncated: boolean; nextOffset: number } | null>(null)
  const [err, setErr] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const moreSentinel = useRef<HTMLDivElement>(null)
  const lines = useMemo(() => splitLines(content?.text ?? ''), [content])
  const language = useMemo(() => prismLanguage(content?.path ?? ''), [content?.path])
  const highlighted = useMemo(() => highlightedLines(content?.text ?? '', language), [content?.text, language])
  const lazy = useLazyLimit(lines.length, content?.path ?? '')

  useEffect(() => {
    if (props.file == null) { setContent(null); return }
    let live = true
    setContent(null)
    setErr('')
    api.readFile(props.sessionId, props.cwd, props.file.path).then((r) => {
      if (live) setContent({ path: r.path, text: r.content, truncated: r.truncated, nextOffset: r.nextOffset })
    }).catch((e: Error) => { if (live) setErr(e.message) })
    return () => { live = false }
  }, [props.sessionId, props.cwd, props.file])

  const loadMore = useCallback(async (): Promise<void> => {
    if (props.file == null || content == null || !content.truncated || loadingMore) return
    setLoadingMore(true)
    try {
      const next = await api.readFile(props.sessionId, props.cwd, props.file.path, content.nextOffset)
      setContent((current) => current === null ? current : {
        path: next.path,
        text: current.text + next.content,
        truncated: next.truncated,
        nextOffset: next.nextOffset,
      })
    } catch (reason) {
      setErr(reason instanceof Error ? reason.message : '读取文件失败')
    } finally {
      setLoadingMore(false)
    }
  }, [content, loadingMore, props.cwd, props.file, props.sessionId])

  useEffect(() => {
    const node = moreSentinel.current
    if (node === null || content?.truncated !== true || loadingMore || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore()
    }, { rootMargin: '320px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [content?.truncated, lazy.limit, lines.length, loadMore, loadingMore])

  if (props.file == null) return <EmptyState icon="files" title="选择一个文件" detail="从左侧项目树中打开文件进行预览" />
  if (err) return <div className="uwb-empty uwb-err">{err}</div>
  if (content === null) return <div className="uwb-empty">读取中…</div>

  return (
    <div className="uwb-document">
      <div className="uwb-file-head">
        <div className="uwb-file-ident">
          <strong>{fileName(content.path)}</strong>
        </div>
        <div className="uwb-file-actions">
          <button className="uwb-icon-btn" onClick={() => void navigator.clipboard?.writeText(content.path)} title="复制文件路径" aria-label="复制文件路径"><Icon name="copy" size={15} /></button>
        </div>
      </div>
      {content.truncated ? <div className="uwb-notice">文件较大，内容将在滚动时分块加载</div> : null}
      <div className="uwb-code-view uwb-wrap">
        {lines.slice(0, lazy.limit).map((ln, i) => (
          <div className="uwb-line" key={i}>
            <span className="uwb-ln">{String(i + 1)}</span>
            <span className="uwb-lc uwb-highlight">{highlighted === null ? (ln || ' ') : <span dangerouslySetInnerHTML={{ __html: highlighted[i] || ' ' }} />}</span>
          </div>
        ))}
        {lazy.limit < lines.length ? <div ref={lazy.sentinel} className="uwb-lazy-status">已显示 {lazy.limit} / {lines.length} 行 · 向下滚动继续加载</div> : null}
        {content.truncated && lazy.limit >= lines.length ? <div ref={moreSentinel} className="uwb-lazy-status">{loadingMore ? '正在读取下一段…' : '继续滚动以读取下一段'}</div> : null}
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
        {isLeaf ? <FileTypeIcon name={props.node.name} size={16} /> : <FolderFileIcon className="uwb-file-icon" width={16} height={16} aria-hidden="true" />}
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
  const [diffLayout, setDiffLayout] = useState<'split' | 'unified'>('split')
  const [contextMode, setContextMode] = useState<'all' | 'changes'>('changes')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [diffErr, setDiffErr] = useState('')
  const [filter, setFilter] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(238)
  const diffRequest = useRef(0)

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

  const loadDiff = useCallback(async (path: string, source: 'work' | 'last', full: boolean): Promise<void> => {
    const request = diffRequest.current + 1
    diffRequest.current = request
    setDiffErr('')
    setLoading(true)
    try {
      const refFor = ref || 'HEAD'
      const d = source === 'work'
        ? await api.gitDiffFile(props.sessionId, props.cwd, path, full)
        : await api.gitLastFileDiff(props.sessionId, props.cwd, path, refFor, full)
      if (request !== diffRequest.current) return
      setDiffText(d)
    } catch (e) {
      if (request !== diffRequest.current) return
      setDiffErr(e instanceof Error ? e.message : '读取 diff 失败')
    } finally {
      if (request === diffRequest.current) setLoading(false)
    }
  }, [props.cwd, props.sessionId, ref])

  const openFile = (node: GitTreeEntry, source: 'work' | 'last'): void => {
    if (node.path == null) return
    setSel({ path: node.path, source })
    void loadDiff(node.path, source, contextMode === 'all')
  }

  const allShownFiles = viewMode === 'work' ? workFiles : lastFiles
  const normalizedFilter = filter.trim().toLocaleLowerCase()
  const shownFiles = normalizedFilter === '' ? allShownFiles : allShownFiles.filter((file) => file.path.toLocaleLowerCase().includes(normalizedFilter))
  const tree = useMemo(() => buildGitTree(shownFiles), [shownFiles])
  const diffRows = useMemo(() => parseDiff(diffText), [diffText])
  const splitRows = useMemo(() => pairDiffRows(diffRows), [diffRows])
  const additions = diffRows.filter((row) => row.cls === 'add').length
  const deletions = diffRows.filter((row) => row.cls === 'del').length
  const effRef = ref || currentBranch || 'HEAD'
  const renderedRowCount = diffLayout === 'split' ? splitRows.length : diffRows.length
  const lazy = useLazyLimit(renderedRowCount, `${sel?.path ?? ''}:${diffLayout}:${contextMode}:${diffText.length}`)

  return (
    <div className="uwb-review">
      <div className="uwb-review-sidebar" style={{ width: sidebarWidth }}>
        <div className="uwb-review-search">
          <Icon name="search" size={15} />
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜索变更文件" aria-label="搜索变更文件" />
          {filter !== '' ? <button className="uwb-search-clear" onClick={() => setFilter('')} aria-label="清除搜索"><Icon name="close" size={13} /></button> : null}
        </div>
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
          <span>变更</span><span className="uwb-count-badge">{shownFiles.length}{normalizedFilter === '' ? '' : ` / ${allShownFiles.length}`}</span>
          <button className="uwb-icon-btn" onClick={() => void refresh()} title="刷新变更" aria-label="刷新变更"><Icon name="refresh" size={14} /></button>
        </div>
        <div className="uwb-change-tree">
          {err ? <div className="uwb-empty uwb-err">{err}</div> : null}
          {shownFiles.length === 0 ? <EmptyState icon="git" title="没有变更" detail={viewMode === 'work' ? '工作区是干净的' : '此提交没有文件变更'} />
            : tree.map((n, i) => <GitTreeNodeView key={i} node={n} onOpen={(nd) => openFile(nd, viewMode)} selectedPath={sel?.path ?? null} />)}
        </div>
      </div>
      <ResizeHandle className="uwb-tree-resize" label="调整审查列表宽度" value={sidebarWidth} direction={1} min={190} max={420} onChange={setSidebarWidth} />
      <div className="uwb-review-main">
        {sel == null ? <EmptyState icon="git" title="选择一项变更" detail="在左侧选择文件以查看逐行差异" />
          : (
            <div className="uwb-document">
              <div className="uwb-document-head">
                <div className="uwb-file-head">
                  <div className="uwb-file-ident">
                    <strong>{fileName(sel.path)}</strong>
                  </div>
                  <div className="uwb-file-actions">
                    <div className="uwb-diff-stats"><span className="add">+{additions}</span><span className="del">−{deletions}</span></div>
                    <button className="uwb-icon-btn" onClick={() => void navigator.clipboard?.writeText(workspaceFilePath(props.cwd, sel.path))} title="复制文件路径" aria-label="复制文件路径"><Icon name="copy" size={15} /></button>
                  </div>
                </div>
                <div className="uwb-diff-toolbar">
                  <div className="uwb-segment" role="group" aria-label="差异布局">
                    <button aria-pressed={diffLayout === 'split'} className={diffLayout === 'split' ? 'on' : ''} onClick={() => setDiffLayout('split')}>显示并排差异</button>
                    <button aria-pressed={diffLayout === 'unified'} className={diffLayout === 'unified' ? 'on' : ''} onClick={() => setDiffLayout('unified')}>统一格式差异</button>
                  </div>
                  <div className="uwb-segment" role="group" aria-label="差异上下文">
                    <button aria-pressed={contextMode === 'all'} className={contextMode === 'all' ? 'on' : ''} onClick={() => {
                      setContextMode('all')
                      void loadDiff(sel.path, sel.source, true)
                    }}>显示所有行</button>
                    <button aria-pressed={contextMode === 'changes'} className={contextMode === 'changes' ? 'on' : ''} onClick={() => {
                      setContextMode('changes')
                      void loadDiff(sel.path, sel.source, false)
                    }}>隐藏未变更的行</button>
                  </div>
                </div>
              </div>
              {diffErr ? <div className="uwb-empty uwb-err">{diffErr}</div> : null}
              {loading ? <div className="uwb-loading"><span />读取差异…</div>
                : diffRows.length === 0 ? <EmptyState icon="git" title="没有可显示的差异" detail="文件可能仅存在于暂存区或尚未被 Git 跟踪" />
                  : diffLayout === 'unified' ? (
                    <div className={'uwb-code-view uwb-diff-view' + (contextMode === 'all' ? ' uwb-wrap' : '')}>{diffRows.slice(0, lazy.limit).map((r, i) => (
                      <div className={'uwb-line uwb-diff-' + r.cls} key={i}>
                        <span className="uwb-ln">{r.old}</span>
                        <span className="uwb-ln">{r.neu}</span>
                        <span className="uwb-lc">{r.text || ' '}</span>
                      </div>
                    ))}
                    {lazy.limit < diffRows.length ? <div ref={lazy.sentinel} className="uwb-lazy-status">已显示 {lazy.limit} / {diffRows.length} 行 · 向下滚动继续加载</div> : null}</div>
                  ) : (
                    <div className={'uwb-split-view' + (contextMode === 'all' ? ' uwb-wrap' : '')}>{splitRows.slice(0, lazy.limit).map((row, index) => row.kind === 'wide' ? (
                      <div className={'uwb-split-wide uwb-diff-' + row.oldClass} key={index}>{row.oldText || ' '}</div>
                    ) : (
                      <div className="uwb-split-row" key={index}>
                        <div className={'uwb-split-side uwb-diff-' + row.oldClass + (row.oldLine === '' ? ' uwb-diff-empty' : '')}><span className="uwb-ln">{row.oldLine}</span><span className="uwb-lc">{row.oldText || ' '}</span></div>
                        <div className={'uwb-split-side uwb-diff-' + row.newClass + (row.newLine === '' ? ' uwb-diff-empty' : '')}><span className="uwb-ln">{row.newLine}</span><span className="uwb-lc">{row.newText || ' '}</span></div>
                      </div>
                    ))}
                    {lazy.limit < splitRows.length ? <div ref={lazy.sentinel} className="uwb-lazy-status">已显示 {lazy.limit} / {splitRows.length} 行 · 向下滚动继续加载</div> : null}</div>
                  )}
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

  const sid = sessionId ?? ''

  useEffect(() => { setFile(null) }, [sessionId])

  return (
    <div className={'uwb-root' + (ui.open ? '' : ' uwb-closed')} style={{ width: ui.width }}>
      <ResizeHandle className="uwb-resize" label="调整工作台宽度" value={ui.width} direction={-1} min={MIN_WIDTH} max={Math.min(MAX_WIDTH, window.innerWidth)} onChange={(width) => props.ui.set({ width })} />
      <div className="uwb-head">
        <div className="uwb-tabs" role="tablist" aria-label="工作台视图">
          <button role="tab" aria-selected={ui.tab === 'tree'} className={'uwb-tab' + (ui.tab === 'tree' ? ' on' : '')} onClick={() => props.ui.set({ tab: 'tree' })}><Icon name="files" size={14} />文件</button>
          <button role="tab" aria-selected={ui.tab === 'git'} className={'uwb-tab' + (ui.tab === 'git' ? ' on' : '')} onClick={() => props.ui.set({ tab: 'git' })}><Icon name="git" size={14} />审查</button>
        </div>
        <button className="uwb-close uwb-icon-btn" onClick={() => props.ui.set({ open: false })} title="关闭 (Esc)" aria-label="关闭工作台"><Icon name="close" size={16} /></button>
      </div>
      {ui.tab === 'tree' ? (
        <div className="uwb-body">
          <div className="uwb-tree" style={{ width: treeW }}>
            <WorkspaceSearch sessionId={sid} cwd={effectiveCwd} onOpen={setFile} />
            <FileTree sessionId={sid} cwd={effectiveCwd} onOpen={setFile} selectedPath={file?.path ?? null} />
          </div>
          <ResizeHandle className="uwb-tree-resize" label="调整文件树宽度" value={treeW} direction={1} min={TREE_MIN} max={Math.min(TREE_MAX, ui.width - 160)} onChange={setTreeW} />
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
