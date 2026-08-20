/**
 * dsh-ui-workbench client half: a right-side workbench panel (file tree /
 * file viewer / git review) portalled onto document.body. The active session's
 * scroll body receives the width offset, leaving its header and the official
 * tool-details panel untouched. A utility beside Session Log toggles the
 * panel; the panel's left edge and the file tree divider are both draggable.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useSyncExternalStore, useState, type ReactNode, type RefObject, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BracketsYellow as JsonFileIcon, CodeBlue as CssFileIcon, Docker as DockerFileIcon, Document as DocumentFileIcon, Go as GoFileIcon, Ignore as IgnoreFileIcon, Image as ImageFileIcon, Java as JavaFileIcon, Js as JavaScriptFileIcon, Markdown as MarkdownFileIcon, NPM as NpmFileIcon, PNPM as PnpmFileIcon, Python as PythonFileIcon, Reactjs as ReactJavaScriptFileIcon, Reactts as ReactTypeScriptFileIcon, Rust as RustFileIcon, Sass as SassFileIcon, Shell as ShellFileIcon, SVG as SvgFileIcon, Svelte as SvelteFileIcon, Text as TextFileIcon, Tsconfig as TsconfigFileIcon, TypeScript as TypeScriptFileIcon, Vue as VueFileIcon, XML as XmlFileIcon, Yaml as YamlFileIcon } from '@react-symbols/icons/files'
import { Folder as FolderFileIcon } from '@react-symbols/icons/folders'
import type { Context } from '../context-types.ts'
import { CLIENT_INJECT } from '../invariant.ts'
import * as api from './api.ts'
import { I18nProvider, useI18n } from './i18n.tsx'
import {
  claimRuntime,
  createRuntimeOwner,
  createUiStore,
  getFileState,
  getGitReviewState,
  getTreeWidth,
  setFileState,
  setGitReviewState,
  setTreeWidth,
} from './runtime.ts'
import { pairDiffRows, parseDiff, type DiffInlineRange } from './diff.ts'
import { ensureSyntaxHighlighter, getSyntaxHighlighter, getSyntaxRevision, subscribeSyntax, type SyntaxLanguage } from './highlight.ts'
import { getThemeColorScheme, subscribeTheme } from './theme.ts'
import { buildDirTree, buildGitTree, type FsTreeEntry, type GitTreeEntry } from './tree.ts'
import installWorkbenchStyle from './workbench.css'

export const inject = CLIENT_INJECT

const MIN_WIDTH = 320
const MAX_WIDTH = 1400
const TREE_MIN = 120
const TREE_MAX = 480
const SHIKI_LANGUAGE_BY_EXTENSION: Record<string, SyntaxLanguage> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', json: 'json', css: 'css', scss: 'scss',
  sass: 'sass', html: 'html', htm: 'html', xml: 'xml', svg: 'xml', md: 'markdown', mdx: 'mdx', py: 'python',
  sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell', yml: 'yaml', yaml: 'yaml', sql: 'sql', typ: 'typst',
  rs: 'rust', go: 'go', java: 'java', vue: 'vue', svelte: 'svelte',
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

function isTypstFile(path: string): boolean {
  return path.toLowerCase().endsWith('.typ')
}

type IconName = 'chevron' | 'file' | 'folder' | 'git' | 'files' | 'refresh' | 'close' | 'copy' | 'branch' | 'search' | 'preview' | 'code'

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
    preview: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
    code: <><path d="m8 9-3 3 3 3" /><path d="m16 9 3 3-3 3" /><path d="m14 6-4 12" /></>,
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

function gitStatusLabel(code: string | null): string {
  const normalized = (code ?? '').replace(/\s/g, '')
  if (normalized === '??' || normalized === 'U') return 'U'
  const first = normalized.charAt(0)
  return ['A', 'C', 'D', 'M', 'R', 'T', 'U'].includes(first) ? first : '?'
}

function workspaceFilePath(cwd: string | null, path: string): string {
  if (/^(?:[a-z]:[\\/]|\/)/i.test(path) || cwd === null) return path
  const separator = cwd.includes('\\') ? '\\' : '/'
  return `${cwd.replace(/[\\/]$/, '')}${separator}${path.replace(/[\\/]/g, separator).replace(/^[\\/]/, '')}`
}

function syntaxLanguage(path: string): SyntaxLanguage | null {
  const name = fileName(path).toLowerCase()
  if (name === 'dockerfile') return 'dockerfile'
  if (name === 'makefile') return 'makefile'
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return SHIKI_LANGUAGE_BY_EXTENSION[ext] ?? (ext === '' ? null : ext as SyntaxLanguage)
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function highlightedLines(text: string, language: SyntaxLanguage | null, options: { ranges?: DiffInlineRange[]; markerClass?: string } = {}): string[] | null {
  if (language === null) return null
  const highlighter = getSyntaxHighlighter()
  if (highlighter === null || !highlighter.getLoadedLanguages().includes(language)) return null
  const ranges = options.ranges ?? []
  const markerClass = options.markerClass
  return highlighter.codeToTokensWithThemes(text, {
    lang: language,
    themes: { light: 'github-light', dark: 'github-dark' },
  }).map((tokens) => {
    let line = ''
    for (const token of tokens) {
      const base = token.offset
      const value = token.content
      const styles = Object.entries(token.variants).map(([theme, style]) => `--shiki-${theme}:${style.color}`).join(';')
      const fontStyle = token.variants.light?.fontStyle ?? 0
      const classes = ['shiki-token', fontStyle & 1 ? 'shiki-italic' : '', fontStyle & 2 ? 'shiki-bold' : '', fontStyle & 4 ? 'shiki-underline' : ''].filter(Boolean).join(' ')
      let localStart = 0
      const boundaries = new Set<number>([0, value.length])
      for (const range of ranges) {
        if (range.end <= base || range.start >= base + value.length) continue
        boundaries.add(Math.max(0, Math.min(value.length, range.start - base)))
        boundaries.add(Math.max(0, Math.min(value.length, range.end - base)))
      }
      const points = [...boundaries].sort((a, b) => a - b)
      for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
        const localEnd = points[pointIndex] ?? value.length
        const part = value.slice(localStart, localEnd)
        const covered = ranges.some((range) => base + localStart < range.end && base + localEnd > range.start)
        const escaped = escapeHtml(part)
        const tokenHtml = escaped === '' ? '' : `<span class="${classes}" style="${styles}">${escaped}</span>`
        line += covered && markerClass !== undefined ? `<span class="${markerClass}">${tokenHtml}</span>` : tokenHtml
        localStart = localEnd
      }
    }
    return line
  })
}

function useSyntaxRevision(): number {
  useEffect(() => { void ensureSyntaxHighlighter() }, [])
  return useSyncExternalStore(subscribeSyntax, getSyntaxRevision, getSyntaxRevision)
}

function DiffCode(props: { text: string; language: SyntaxLanguage | null; ranges?: DiffInlineRange[]; markerClass?: string }): ReactNode {
  const highlighted = highlightedLines(props.text, props.language, { ranges: props.ranges, markerClass: props.markerClass })
  const html = highlighted?.[0]
  if (html === undefined) return props.text || ' '
  return <span className="uwb-highlight" dangerouslySetInnerHTML={{ __html: html || ' ' }} />
}

function FileTypeIcon(props: { name: string; size?: number }): ReactNode {
  const name = fileName(props.name).toLowerCase()
  const extension = name.split('.').pop() ?? ''
  const FileSvg = FILE_ICON_BY_NAME[name] ?? FILE_ICON_BY_EXTENSION[extension] ?? DocumentFileIcon
  const size = props.size ?? 16
  return <FileSvg className="uwb-file-type-icon" width={size} height={size} aria-hidden="true" />
}

function useWorkbenchColorScheme(ctx: Context): 'light' | 'dark' {
  const subscribe = useCallback((listener: () => void) => subscribeTheme(ctx, listener), [ctx])
  const getSnapshot = useCallback(() => getThemeColorScheme(ctx), [ctx])
  return useSyncExternalStore(subscribe, getSnapshot, () => 'light')
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

function FsTreeNode(props: {
  entry: FsTreeEntry
  onOpen: (entry: FsTreeEntry) => void
  selectedPath: string | null
  sessionId: string
  cwd: string | null
}): ReactNode {
  const { t } = useI18n()
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
          {loading ? <div className="uwb-empty">{t('loading')}</div>
            : (children ?? []).map((c) => (
              <FsTreeNode key={c.path} entry={c} onOpen={props.onOpen} selectedPath={props.selectedPath} sessionId={props.sessionId} cwd={props.cwd} />
            ))}
        </div>
      ) : null}
    </div>
  )
}

function FileTree(props: { sessionId: string; cwd: string | null; onOpen: (entry: FsTreeEntry) => void; selectedPath: string | null }): ReactNode {
  const { t } = useI18n()
  const [rootEntries, setRootEntries] = useState<FsTreeEntry[]>([])
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    if (props.cwd == null) {
      setRootEntries([])
      setErr(t('noWorkspace'))
      return () => { live = false }
    }
    setErr('')
    api.listDir(props.sessionId, props.cwd).then((r) => {
      if (!live) return
      setRootEntries(buildDirTree(r.entries, r.path))
    }).catch(() => { if (live) setErr(t('listDirFailed')) })
    return () => { live = false }
  }, [props.sessionId, props.cwd, t])

  return (
    <div className="uwb-tree-content">
      {err ? <div className="uwb-empty uwb-err">{err}</div>
        : rootEntries.map((c) => (
          <FsTreeNode key={c.path} entry={c} onOpen={props.onOpen} selectedPath={props.selectedPath} sessionId={props.sessionId} cwd={props.cwd} />
        ))}
    </div>
  )
}

function WorkspaceSearch(props: {
  sessionId: string
  cwd: string | null
  onOpen: (entry: FsTreeEntry) => void
}): ReactNode {
  const { t } = useI18n()
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
      }).catch(() => {
        if (!live) return
        setResults([])
        setError(t('searchFailed'))
      }).finally(() => { if (live) setLoading(false) })
    }, 180)
    return () => { live = false; window.clearTimeout(timer) }
  }, [props.cwd, props.sessionId, query, t])

  const active = query.trim() !== ''
  return (
    <div className={'uwb-search' + (active ? ' active' : '')}>
      <div className="uwb-search-box">
        <Icon name="search" size={15} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchWorkspace')} aria-label={t('searchWorkspace')} />
        {loading ? <span className="uwb-search-spinner" /> : null}
        {active && !loading ? <button className="uwb-search-clear" onClick={() => setQuery('')} aria-label={t('clearSearch')}><Icon name="close" size={13} /></button> : null}
      </div>
      {active ? (
        <div className="uwb-search-results">
          {error ? <div className="uwb-search-status uwb-err">{error}</div> : null}
          {!loading && error === '' && results.length === 0 ? <div className="uwb-search-status">{t('noMatchingFiles')}</div> : null}
          {results.map((result) => (
            <button key={result.path} className="uwb-search-result" onClick={() => {
              props.onOpen({ name: result.name, path: result.path, dir: false })
              setQuery('')
            }}>
              <FileTypeIcon name={result.name} size={16} />
              <span><strong>{result.name}</strong><small>{result.relative}</small></span>
            </button>
          ))}
          {truncated ? <div className="uwb-search-status">{t('limitedResults', { count: results.length })}</div> : null}
        </div>
      ) : null}
    </div>
  )
}

function splitLines(text: string): string[] {
  const lines = text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

const LazyTypstPage = memo(function LazyTypstPage(props: { page: api.TypstPage; shared: string; index: number; visible: boolean }): ReactNode {
  const svg = props.visible
    ? `<svg class="typst-doc" viewBox="0 0 ${props.page.width} ${props.page.height}" width="${props.page.width}" height="${props.page.height}" data-width="${props.page.width}" data-height="${props.page.height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:h5="http://www.w3.org/1999/xhtml">${props.shared}${props.page.content}</svg>`
    : ''
  return <div className="uwb-typst-page-slot" data-page-index={props.index} style={{ aspectRatio: `${props.page.width} / ${props.page.height}` }} role="document" aria-label={`Typst page ${props.index + 1}`} onDragStart={(event) => event.preventDefault()} dangerouslySetInnerHTML={{ __html: svg }} />
})

function TypstDocument(props: { pages: api.TypstPage[]; shared: string }): ReactNode {
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement>(null)
  const editing = useRef(false)
  const scrollFrame = useRef(0)
  const [visiblePages, setVisiblePages] = useState<ReadonlySet<number>>(() => new Set([0]))
  const [currentPage, setCurrentPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')

  const pageElements = (): HTMLElement[] => [...(scrollRef.current?.querySelectorAll<HTMLElement>('.uwb-typst-page-slot') ?? [])]
  const goToPage = (requested: number, smooth = true): void => {
    const pages = pageElements()
    if (pages.length === 0) return
    const page = Math.max(1, Math.min(Math.trunc(requested), pages.length))
    const viewport = scrollRef.current
    const target = pages[page - 1]
    if (viewport === null || target === undefined) return
    const top = target.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop
    viewport.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
    setCurrentPage(page)
    setPageInput(String(page))
  }
  const commitPageInput = (): void => {
    const page = Number.parseInt(pageInput, 10)
    goToPage(Number.isFinite(page) ? page : currentPage)
  }

  useEffect(() => {
    const page = Math.min(currentPage, props.pages.length)
    setCurrentPage(page)
    setPageInput(String(page))
  }, [props.pages])

  useEffect(() => {
    const viewport = scrollRef.current
    if (viewport === null) return
    setVisiblePages(new Set([0]))
    const observer = new IntersectionObserver((entries) => {
      setVisiblePages((current) => {
        let next: Set<number> | undefined
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.pageIndex)
          if (!Number.isSafeInteger(index) || current.has(index) === entry.isIntersecting) continue
          next ??= new Set(current)
          if (entry.isIntersecting) next.add(index)
          else next.delete(index)
        }
        return next ?? current
      })
    }, { root: viewport, rootMargin: '100% 0px' })
    pageElements().forEach((page) => observer.observe(page))
    return () => observer.disconnect()
  }, [props.pages])

  const onScroll = (): void => {
    if (scrollFrame.current !== 0) return
    scrollFrame.current = window.requestAnimationFrame(() => {
      scrollFrame.current = 0
      const viewport = scrollRef.current
      const pages = pageElements()
      if (viewport === null || pages.length === 0) return
      const position = viewport.scrollTop + (pages[0]?.offsetTop ?? 0) + 1
      let low = 0
      let high = pages.length - 1
      while (low < high) {
        const middle = Math.ceil((low + high) / 2)
        if ((pages[middle]?.offsetTop ?? 0) <= position) low = middle
        else high = middle - 1
      }
      const page = low + 1
      setCurrentPage((value) => value === page ? value : page)
      if (!editing.current) setPageInput((value) => value === String(page) ? value : String(page))
    })
  }

  useEffect(() => () => window.cancelAnimationFrame(scrollFrame.current), [])

  return (
    <>
      <div className="uwb-typst-toolbar" role="group" aria-label={t('previewPage')}>
        <button className="uwb-icon-btn uwb-page-prev" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)} title={t('previousPage')} aria-label={t('previousPage')}><Icon name="chevron" size={15} /></button>
        <div className="uwb-page-position">
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={pageInput}
            aria-label={t('previewPage')}
            onFocus={() => { editing.current = true }}
            onChange={(event) => { if (/^\d*$/.test(event.target.value)) setPageInput(event.target.value) }}
            onBlur={() => { commitPageInput(); editing.current = false }}
            onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur() }}
            onKeyUp={(event) => event.stopPropagation()}
          />
          <span>/ {props.pages.length}</span>
        </div>
        <button className="uwb-icon-btn" disabled={currentPage >= props.pages.length} onClick={() => goToPage(currentPage + 1)} title={t('nextPage')} aria-label={t('nextPage')}><Icon name="chevron" size={15} /></button>
      </div>
      <div ref={scrollRef} className="uwb-typst-scroll" onScroll={onScroll}>
        <div className="uwb-typst-pages">
          {props.pages.map((page, index) => <LazyTypstPage key={index} page={page} shared={props.shared} index={index} visible={visiblePages.has(index)} />)}
        </div>
      </div>
    </>
  )
}

function TypstPreview(props: { sessionId: string; cwd: string | null; path: string }): ReactNode {
  const { t } = useI18n()
  const [pages, setPages] = useState<api.TypstPage[]>([])
  const [shared, setShared] = useState('')
  const [error, setError] = useState<{ message: string; code?: string } | null>(null)
  const [rendering, setRendering] = useState(true)
  const request = useRef(0)
  const revision = useRef('')

  useEffect(() => {
    let disposed = false
    let timer = 0
    const render = async (): Promise<void> => {
      if (document.visibilityState === 'hidden') {
        timer = window.setTimeout(() => void render(), 1000)
        return
      }
      const current = request.current + 1
      request.current = current
      try {
        const result = await api.renderTypst(props.sessionId, props.cwd, props.path, revision.current)
        if (disposed || current !== request.current) return
        if (result.unchanged) return
        revision.current = result.revision
        setPages((value) => value.length === result.pages.length && value.every((page, index) => page.width === result.pages[index]?.width && page.height === result.pages[index]?.height && page.content === result.pages[index]?.content) ? value : result.pages)
        setShared(result.shared)
        setError(null)
      } catch (cause) {
        if (disposed || current !== request.current) return
        const value = cause as Error & { code?: string }
        setError({ message: value.message, code: value.code })
      } finally {
        if (!disposed && current === request.current) {
          setRendering(false)
          timer = window.setTimeout(() => void render(), 1000)
        }
      }
    }
    setPages([])
    setShared('')
    revision.current = ''
    setError(null)
    setRendering(true)
    void render()
    return () => { disposed = true; request.current += 1; window.clearTimeout(timer) }
  }, [props.cwd, props.path, props.sessionId])

  return (
    <div className="uwb-typst-preview">
      {rendering && pages.length === 0 ? <div className="uwb-loading"><span />{t('renderingTypst')}</div> : null}
      {error === null ? null : (
        <div className="uwb-typst-error">
          <strong>{t('typstPreviewFailed')}</strong>
          <pre>{error.code === 'typst-not-installed' ? t('typstNotInstalled') : error.message}</pre>
        </div>
      )}
      {pages[0] === undefined ? null : <TypstDocument pages={pages} shared={shared} />}
    </div>
  )
}

function TypstFileViewer(props: { sessionId: string; cwd: string | null; file: FsTreeEntry }): ReactNode {
  const { t } = useI18n()
  const [mode, setMode] = useState<'preview' | 'text'>('preview')
  const modeSwitch = (
    <div className="uwb-view-switch" role="tablist" aria-label={t('typstViewMode')}>
      <button type="button" role="tab" aria-selected={mode === 'preview'} className={mode === 'preview' ? 'active' : ''} onClick={() => setMode('preview')} title={t('previewMode')} aria-label={t('previewMode')}><Icon name="preview" size={14} /></button>
      <button type="button" role="tab" aria-selected={mode === 'text'} className={mode === 'text' ? 'active' : ''} onClick={() => setMode('text')} title={t('textMode')} aria-label={t('textMode')}><Icon name="code" size={14} /></button>
    </div>
  )
  if (mode === 'text') return <SourceFileViewer sessionId={props.sessionId} cwd={props.cwd} file={props.file} actions={modeSwitch} />
  return (
    <div className="uwb-document uwb-typst-document">
      <div className="uwb-file-head">
        <div className="uwb-file-ident">
          <strong>{fileName(props.file.path)}</strong>
        </div>
        <div className="uwb-file-actions">
          {modeSwitch}
          <button className="uwb-icon-btn" onClick={() => void navigator.clipboard?.writeText(props.file.path)} title={t('copyFilePath')} aria-label={t('copyFilePath')}><Icon name="copy" size={15} /></button>
        </div>
      </div>
      <TypstPreview sessionId={props.sessionId} cwd={props.cwd} path={props.file.path} />
    </div>
  )
}

function SourceFileViewer(props: { sessionId: string; cwd: string | null; file: FsTreeEntry | null; actions?: ReactNode }): ReactNode {
  const { t } = useI18n()
  const [content, setContent] = useState<{ path: string; text: string; truncated: boolean; nextOffset: number } | null>(null)
  const [err, setErr] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const moreSentinel = useRef<HTMLDivElement>(null)
  const lines = useMemo(() => splitLines(content?.text ?? ''), [content])
  const syntaxRevision = useSyntaxRevision()
  const language = useMemo(() => syntaxLanguage(content?.path ?? ''), [content?.path])
  const highlighted = useMemo(() => highlightedLines(content?.text ?? '', language), [content?.text, language, syntaxRevision])
  const lazy = useLazyLimit(lines.length, content?.path ?? '')

  useEffect(() => {
    if (props.file == null) { setContent(null); return }
    let live = true
    setContent(null)
    setErr('')
    api.readFile(props.sessionId, props.cwd, props.file.path).then((r) => {
      if (live) setContent({ path: r.path, text: r.content, truncated: r.truncated, nextOffset: r.nextOffset })
    }).catch(() => { if (live) setErr(t('readFileFailed')) })
    return () => { live = false }
  }, [props.sessionId, props.cwd, props.file, t])

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
    } catch {
      setErr(t('readFileFailed'))
    } finally {
      setLoadingMore(false)
    }
  }, [content, loadingMore, props.cwd, props.file, props.sessionId, t])

  useEffect(() => {
    const node = moreSentinel.current
    if (node === null || content?.truncated !== true || loadingMore || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore()
    }, { rootMargin: '320px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [content?.truncated, lazy.limit, lines.length, loadMore, loadingMore])

  if (props.file == null) return <EmptyState icon="files" title={t('selectFile')} detail={t('selectFileDetail')} />
  if (err) return <div className="uwb-empty uwb-err">{err}</div>
  if (content === null) return <div className="uwb-empty">{t('reading')}</div>

  return (
    <div className="uwb-document">
      <div className="uwb-file-head">
        <div className="uwb-file-ident">
          <strong>{fileName(content.path)}</strong>
        </div>
        <div className="uwb-file-actions">
          {props.actions}
          <button className="uwb-icon-btn" onClick={() => void navigator.clipboard?.writeText(content.path)} title={t('copyFilePath')} aria-label={t('copyFilePath')}><Icon name="copy" size={15} /></button>
        </div>
      </div>
      {content.truncated ? <div className="uwb-notice">{t('largeFile')}</div> : null}
      <div className="uwb-code-view uwb-wrap">
        {lines.slice(0, lazy.limit).map((ln, i) => (
          <div className="uwb-line" key={i}>
            <span className="uwb-ln">{String(i + 1)}</span>
            <span className="uwb-lc uwb-highlight">{highlighted === null ? (ln || ' ') : <span dangerouslySetInnerHTML={{ __html: highlighted[i] || ' ' }} />}</span>
          </div>
        ))}
        {lazy.limit < lines.length ? <div ref={lazy.sentinel} className="uwb-lazy-status">{t('shownLines', { shown: lazy.limit, total: lines.length })}</div> : null}
        {content.truncated && lazy.limit >= lines.length ? <div ref={moreSentinel} className="uwb-lazy-status">{loadingMore ? t('readingNext') : t('continueReading')}</div> : null}
      </div>
    </div>
  )
}

function FileViewer(props: { sessionId: string; cwd: string | null; file: FsTreeEntry | null }): ReactNode {
  if (props.file !== null && isTypstFile(props.file.path)) {
    return <TypstFileViewer sessionId={props.sessionId} cwd={props.cwd} file={props.file} />
  }
  return <SourceFileViewer {...props} />
}

function EmptyState(props: { icon: IconName; title: string; detail: string; action?: ReactNode }): ReactNode {
  return (
    <div className="uwb-empty-state">
      <span className="uwb-empty-icon"><Icon name={props.icon} size={22} /></span>
      <strong>{props.title}</strong>
      <span className="uwb-empty-detail">{props.detail}</span>
      {props.action === undefined ? null : <div className="uwb-empty-actions">{props.action}</div>}
    </div>
  )
}

function GitTreeNodeView(props: { node: GitTreeEntry; onOpen: (node: GitTreeEntry) => void; selectedPath: string | null }): ReactNode {
  const [expanded, setExpanded] = useState(false)
  const isLeaf = props.node.dir === false
  const sel = props.selectedPath === props.node.path
  const status = gitStatusLabel(props.node.code)
  const codeClass = status === 'A' ? 'A' : status === 'D' ? 'D' : (status === 'C' || status === 'M' || status === 'R' || status === 'T') ? 'M' : 'U'
  return (
    <div>
      <div
        className={'uwb-row' + (isLeaf ? ' file' : ' dir') + (sel ? ' sel' : '')}
        onClick={() => { if (isLeaf) props.onOpen(props.node); else setExpanded(!expanded) }}
      >
        <span className={'uwb-chevron' + (expanded ? ' expanded' : '')}>{isLeaf ? null : <Icon name="chevron" size={13} />}</span>
        {isLeaf ? <FileTypeIcon name={props.node.name} size={16} /> : <FolderFileIcon className="uwb-file-icon" width={16} height={16} aria-hidden="true" />}
        {isLeaf ? <span className={'uwb-code ' + codeClass}>{status}</span> : null}
        <span className="uwb-row-label">{props.node.name}</span>
      </div>
      {!isLeaf && expanded ? (
        <div className="uwb-children">
          {(props.node.children ?? []).map((c) => (
            <GitTreeNodeView key={c.path ?? c.name} node={c} onOpen={props.onOpen} selectedPath={props.selectedPath} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function GitReview(props: { sessionId: string; cwd: string | null }): ReactNode {
  const { t } = useI18n()
  useSyntaxRevision()
  const reviewKey = `${props.sessionId}:${props.cwd ?? ''}`
  const persisted = getGitReviewState(reviewKey)
  const [branchList, setBranchList] = useState<string[]>([])
  const [currentBranch, setCurrentBranch] = useState('')
  const [viewMode, setViewMode] = useState<'work' | 'last'>(() => persisted?.viewMode ?? 'work')
  const [ref, setRef] = useState(() => persisted?.ref ?? '')
  const [workFiles, setWorkFiles] = useState<api.GitFileEntry[]>([])
  const [lastFiles, setLastFiles] = useState<api.GitFileEntry[]>([])
  const [sel, setSel] = useState<{ path: string; source: 'work' | 'last' } | null>(() => persisted?.sel ?? null)
  const [diffText, setDiffText] = useState('')
  const [diffLayout, setDiffLayout] = useState<'split' | 'unified'>(() => persisted?.diffLayout ?? 'unified')
  const [contextMode, setContextMode] = useState<'all' | 'changes'>(() => persisted?.contextMode ?? 'changes')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [diffErr, setDiffErr] = useState('')
  const [filter, setFilter] = useState(() => persisted?.filter ?? '')
  const [sidebarWidth, setSidebarWidth] = useState(() => persisted?.sidebarWidth ?? 238)
  const [repository, setRepository] = useState<boolean | null>(null)
  const [creatingRepository, setCreatingRepository] = useState(false)
  const [reviewRevision, setReviewRevision] = useState(0)
  const refreshRequest = useRef(0)
  const diffRequest = useRef(0)
  const refreshInFlight = useRef(false)
  const selectionRef = useRef<typeof sel>(null)

  useEffect(() => {
    setGitReviewState(reviewKey, {
      viewMode,
      ref,
      diffLayout,
      contextMode,
      filter,
      sidebarWidth,
      sel,
    })
  }, [contextMode, diffLayout, filter, ref, reviewKey, sel, sidebarWidth, viewMode])

  useEffect(() => { setErr(''); setDiffErr('') }, [t])
  useEffect(() => { selectionRef.current = sel }, [sel])

  const refresh = useCallback(async (): Promise<void> => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    const request = refreshRequest.current + 1
    refreshRequest.current = request
    setErr('')
    try {
      let initialized: boolean | null = null
      try {
        initialized = await api.gitRepository(props.sessionId, props.cwd)
      } catch {
        // Compatibility with a running Harness host that has not reloaded the
        // newly added repository-probe route yet. Existing Git routes still
        // provide the review data until the host is restarted.
      }
      if (request !== refreshRequest.current) return
      if (initialized === false) { setRepository(false); return }
      const refFor = ref || 'HEAD'
      const [b, bs, w, l] = await Promise.all([
        api.gitBranch(props.sessionId, props.cwd),
        api.gitBranches(props.sessionId, props.cwd),
        api.gitStatusFiles(props.sessionId, props.cwd),
        api.gitLastCommitFiles(props.sessionId, props.cwd, refFor),
      ])
      if (request !== refreshRequest.current) return
      setRepository(true)
      setCurrentBranch(b)
      setBranchList(bs)
      setWorkFiles(w)
      setLastFiles(l)

      const selected = selectionRef.current
      const selectedFiles = selected?.source === 'work' ? w : l
      if (selected !== null && !selectedFiles.some((file) => file.path === selected.path)) {
        setSel(null)
        setDiffText('')
        diffRequest.current += 1
      } else if (selected !== null) {
        // A status row does not change when an already-modified file is edited
        // again. Reload the selected diff on every completed poll so its
        // content, not only the changed-file list, stays current.
        setReviewRevision((value) => value + 1)
      }
    } catch {
      if (request === refreshRequest.current) {
        setRepository(true)
        setErr(t('refreshFailed'))
      }
    } finally {
      refreshInFlight.current = false
    }
  }, [props.sessionId, props.cwd, ref, t])

  useEffect(() => {
    void refresh()
    return () => { refreshRequest.current += 1; diffRequest.current += 1 }
  }, [refresh])

  useEffect(() => {
    const update = (): void => { if (document.visibilityState === 'visible') void refresh() }
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [refresh])

  const createRepository = async (): Promise<void> => {
    setCreatingRepository(true)
    setErr('')
    try {
      await api.gitInit(props.sessionId, props.cwd)
      await refresh()
    } catch {
      setErr(t('createGitFailed'))
    } finally {
      setCreatingRepository(false)
    }
  }

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
    } catch {
      if (request !== diffRequest.current) return
      setDiffErr(t('readDiffFailed'))
    } finally {
      if (request === diffRequest.current) setLoading(false)
    }
  }, [props.cwd, props.sessionId, ref, t])

  useEffect(() => {
    const selected = selectionRef.current
    if (reviewRevision > 0 && selected !== null) void loadDiff(selected.path, selected.source, contextMode === 'all')
  }, [contextMode, loadDiff, reviewRevision])

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
  const diffLanguage = useMemo(() => syntaxLanguage(sel?.path ?? ''), [sel?.path])
  const additions = diffRows.filter((row) => row.cls === 'add').length
  const deletions = diffRows.filter((row) => row.cls === 'del').length
  const effRef = ref || currentBranch || 'HEAD'
  const renderedRowCount = diffLayout === 'split' ? splitRows.length : diffRows.length
  const lazy = useLazyLimit(renderedRowCount, `${sel?.path ?? ''}:${diffLayout}:${contextMode}:${diffText.length}`)

  if (repository === false) {
    return (
      <div className="uwb-review">
        <EmptyState
          icon="git"
          title={t('noGit')}
          detail={t('noGitDetail')}
          action={<><button className="uwb-empty-action" type="button" disabled={creatingRepository} onClick={() => void createRepository()}>{creatingRepository ? t('creatingGit') : t('createGit')}</button>{err !== '' ? <span className="uwb-err">{err}</span> : null}</>}
        />
      </div>
    )
  }

  if (repository === null) return <div className="uwb-review"><div className="uwb-loading"><span />{t('loading')}</div></div>

  return (
    <div className="uwb-review">
      <div className="uwb-review-sidebar" style={{ width: sidebarWidth }}>
        <div className="uwb-review-search">
          <Icon name="search" size={15} />
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t('searchChangedFiles')} aria-label={t('searchChangedFiles')} />
          {filter !== '' ? <button className="uwb-search-clear" onClick={() => setFilter('')} aria-label={t('clearSearch')}><Icon name="close" size={13} /></button> : null}
        </div>
        <div className="uwb-review-controls">
          <label className="uwb-control-label">{t('reviewScope')}</label>
          <select className="uwb-select uwb-select-wide" value={viewMode} onChange={(e) => { setViewMode(e.target.value as 'work' | 'last'); setSel(null); setDiffText(''); setDiffErr('') }}>
            <option value="work">{t('workspaceChanges')}</option>
            <option value="last">{t('lastCommit')}</option>
          </select>
          <label className="uwb-control-label">{viewMode === 'work' ? t('currentBranch') : t('commitRef')}</label>
          <div className="uwb-select-wrap">
            <Icon name="branch" size={14} />
            <select className="uwb-select uwb-select-wide" disabled={viewMode === 'work'} value={effRef} onChange={(e) => { setRef(e.target.value); setSel(null); setDiffText(''); setDiffErr('') }}>
              {branchList.length > 0 ? branchList.map((n) => <option key={n} value={n}>{n}</option>) : <option value={effRef}>{effRef}</option>}
            </select>
          </div>
        </div>
        <div className="uwb-changes-head">
          <span>{t('changes')}</span><span className="uwb-count-badge">{shownFiles.length}{normalizedFilter === '' ? '' : ` / ${allShownFiles.length}`}</span>
          <button className="uwb-icon-btn" onClick={() => void refresh()} title={t('refreshChanges')} aria-label={t('refreshChanges')}><Icon name="refresh" size={14} /></button>
        </div>
        <div className="uwb-change-tree">
          {err ? <div className="uwb-empty uwb-err">{err}</div> : null}
          {shownFiles.length === 0 ? <EmptyState icon="git" title={t('noChanges')} detail={viewMode === 'work' ? t('cleanWorkspace') : t('noCommitChanges')} />
            : tree.map((n) => <GitTreeNodeView key={n.path ?? n.name} node={n} onOpen={(nd) => openFile(nd, viewMode)} selectedPath={sel?.path ?? null} />)}
        </div>
      </div>
      <ResizeHandle className="uwb-tree-resize" label={t('resizeReviewList')} value={sidebarWidth} direction={1} min={190} max={420} onChange={setSidebarWidth} />
      <div className="uwb-review-main">
        {sel == null ? <EmptyState icon="git" title={t('selectChange')} detail={t('selectChangeDetail')} />
          : (
            <div className="uwb-document">
              <div className="uwb-document-head">
                <div className="uwb-file-head">
                  <div className="uwb-file-ident">
                    <strong>{fileName(sel.path)}</strong>
                  </div>
                  <div className="uwb-file-actions">
                    <div className="uwb-diff-stats"><span className="add">+{additions}</span><span className="del">−{deletions}</span></div>
                    <button className="uwb-icon-btn" onClick={() => void navigator.clipboard?.writeText(workspaceFilePath(props.cwd, sel.path))} title={t('copyFilePath')} aria-label={t('copyFilePath')}><Icon name="copy" size={15} /></button>
                  </div>
                </div>
                <div className="uwb-diff-toolbar">
                  <div className="uwb-segment" role="group" aria-label={t('diffLayout')}>
                    <button aria-pressed={diffLayout === 'split'} className={diffLayout === 'split' ? 'on' : ''} onClick={() => setDiffLayout('split')}>{t('splitDiff')}</button>
                    <button aria-pressed={diffLayout === 'unified'} className={diffLayout === 'unified' ? 'on' : ''} onClick={() => setDiffLayout('unified')}>{t('unifiedDiff')}</button>
                  </div>
                  <div className="uwb-segment" role="group" aria-label={t('diffContext')}>
                    <button aria-pressed={contextMode === 'all'} className={contextMode === 'all' ? 'on' : ''} onClick={() => {
                      setContextMode('all')
                      void loadDiff(sel.path, sel.source, true)
                    }}>{t('showAllLines')}</button>
                    <button aria-pressed={contextMode === 'changes'} className={contextMode === 'changes' ? 'on' : ''} onClick={() => {
                      setContextMode('changes')
                      void loadDiff(sel.path, sel.source, false)
                    }}>{t('hideUnchanged')}</button>
                  </div>
                </div>
              </div>
              {diffErr ? <div className="uwb-empty uwb-err">{diffErr}</div> : null}
              {loading ? <div className="uwb-loading"><span />{t('readingDiff')}</div>
                : diffRows.length === 0 ? <EmptyState icon="git" title={t('noDiff')} detail={t('noDiffDetail')} />
                  : diffLayout === 'unified' ? (
                    <div className={'uwb-code-view uwb-diff-view' + (contextMode === 'all' ? ' uwb-wrap' : '')}>{diffRows.slice(0, lazy.limit).map((r, i) => r.cls === 'gap' ? (
                      <div className="uwb-line uwb-diff-gap" key={i}><span className="uwb-diff-gap-label">{t('unmodifiedLines', { count: r.count ?? 0 })}</span></div>
                    ) : (
                      <div className={'uwb-line uwb-diff-' + r.cls} key={i}>
                        <span className="uwb-ln">{r.old}</span>
                        <span className="uwb-ln">{r.neu}</span>
                        <span className="uwb-lc"><DiffCode text={r.text} language={diffLanguage} ranges={r.inline} markerClass={r.cls === 'add' ? 'uwb-diff-inline-add' : r.cls === 'del' ? 'uwb-diff-inline-del' : undefined} /></span>
                      </div>
                    ))}
                    {lazy.limit < diffRows.length ? <div ref={lazy.sentinel} className="uwb-lazy-status">{t('shownLines', { shown: lazy.limit, total: diffRows.length })}</div> : null}</div>
                  ) : (
                    <div className={'uwb-split-view' + (contextMode === 'all' ? ' uwb-wrap' : '')}>{splitRows.slice(0, lazy.limit).map((row, index) => row.kind === 'wide' ? (
                      <div className={'uwb-split-wide uwb-diff-' + row.oldClass} key={index}>{row.gapCount !== undefined ? t('unmodifiedLines', { count: row.gapCount }) : row.oldText || ' '}</div>
                    ) : (
                      <div className="uwb-split-row" key={index}>
                        <div className={'uwb-split-side uwb-diff-' + row.oldClass + (row.oldLine === '' ? ' uwb-diff-empty' : '')}><span className="uwb-ln">{row.oldLine}</span><span className="uwb-lc"><DiffCode text={row.oldText} language={diffLanguage} ranges={row.oldInline} markerClass={row.oldClass === 'del' ? 'uwb-diff-inline-del' : undefined} /></span></div>
                        <div className={'uwb-split-side uwb-diff-' + row.newClass + (row.newLine === '' ? ' uwb-diff-empty' : '')}><span className="uwb-ln">{row.newLine}</span><span className="uwb-lc"><DiffCode text={row.newText} language={diffLanguage} ranges={row.newInline} markerClass={row.newClass === 'add' ? 'uwb-diff-inline-add' : undefined} /></span></div>
                      </div>
                    ))}
                    {lazy.limit < splitRows.length ? <div ref={lazy.sentinel} className="uwb-lazy-status">{t('shownLines', { shown: lazy.limit, total: splitRows.length })}</div> : null}</div>
                  )}
            </div>
          )}
      </div>
    </div>
  )
}

function Workbench(props: { ctx: Context; ui: ReturnType<typeof createUiStore> }): ReactNode {
  const { t } = useI18n()
  const ui = useSyncExternalStore(props.ui.subscribe, props.ui.getSnapshot)
  const colorScheme = useWorkbenchColorScheme(props.ctx)
  const [sessionList, setSessionList] = useState<{ current?: string; byId: Record<string, { cwd?: string }> }>({ byId: {} })
  const [file, setFile] = useState<FsTreeEntry | null>(null)
  const [treeW, setTreeW] = useState(220)
  const previousSession = useRef<string | undefined>(undefined)

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
    setResolvedCwd(null)
    api.sessionCwd(sessionId).then((r) => { if (live) setResolvedCwd(r) })
    return () => { live = false }
  }, [sessionId, cwd])

  const effectiveCwd = cwd ?? resolvedCwd

  useEffect(() => {
    document.documentElement.style.setProperty('--uwb-width', ui.open ? `${Math.min(ui.width, window.innerWidth)}px` : '0px')
  }, [ui.open, ui.width])

  useEffect(() => {
    let frame = 0
    let observedHeader: Element | null = null
    let contentElement: Element | null = null
    const update = (): void => {
      const header = document.querySelector('[data-slot="conversation.session.header"] > header')
      if (header !== observedHeader) {
        if (observedHeader !== null) resizeObserver.unobserve(observedHeader)
        observedHeader = header
        if (header !== null) resizeObserver.observe(header)
      }
      const sessionRoot = header?.parentElement?.parentElement
      const nextContent = [...(sessionRoot?.children ?? [])].find((child) => child !== header?.parentElement && child.getBoundingClientRect().top >= (header?.getBoundingClientRect().bottom ?? 0)) ?? null
      if (nextContent !== contentElement) {
        contentElement?.classList.remove('uwb-host-content')
        contentElement = nextContent
        contentElement?.classList.add('uwb-host-content')
      }
      const top = header?.getBoundingClientRect().bottom ?? 0
      document.documentElement.style.setProperty('--uwb-top', `${Math.max(0, Math.round(top))}px`)
    }
    const schedule = (): void => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(update)
    }
    const resizeObserver = new ResizeObserver(schedule)
    const treeObserver = new MutationObserver(schedule)
    treeObserver.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', schedule)
    update()
    return () => {
      window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      treeObserver.disconnect()
      window.removeEventListener('resize', schedule)
      contentElement?.classList.remove('uwb-host-content')
    }
  }, [])

  useEffect(() => {
    if (!ui.open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') props.ui.set({ open: false })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [ui.open, props.ui])

  const sid = sessionId ?? ''

  useEffect(() => {
    const changed = previousSession.current !== undefined && previousSession.current !== sessionId
    previousSession.current = sessionId
    if (changed) props.ui.set({ open: false })
    setFile(sessionId === undefined ? null : getFileState(sessionId))
    setTreeW(sessionId === undefined ? 220 : getTreeWidth(sessionId))
  }, [sessionId, props.ui])

  useEffect(() => {
    if (sessionId !== undefined) setFileState(sessionId, file)
  }, [file, sessionId])

  useEffect(() => {
    if (sessionId !== undefined) setTreeWidth(sessionId, treeW)
  }, [sessionId, treeW])

  return (
    <div className={'uwb-root' + (ui.open ? '' : ' uwb-closed')} data-uwb-color-scheme={colorScheme} style={{ width: ui.width }}>
      <ResizeHandle className="uwb-resize" label={t('resizeWorkbench')} value={ui.width} direction={-1} min={MIN_WIDTH} max={Math.min(MAX_WIDTH, window.innerWidth)} onChange={(width) => props.ui.set({ width })} />
      <div className="uwb-head">
        <div className="uwb-tabs" role="tablist" aria-label={t('workbenchViews')}>
          <button role="tab" aria-selected={ui.tab === 'tree'} className={'uwb-tab' + (ui.tab === 'tree' ? ' on' : '')} onClick={() => props.ui.set({ tab: 'tree' })}><Icon name="files" size={14} />{t('files')}</button>
          <button role="tab" aria-selected={ui.tab === 'git'} className={'uwb-tab' + (ui.tab === 'git' ? ' on' : '')} onClick={() => props.ui.set({ tab: 'git' })}><Icon name="git" size={14} />{t('review')}</button>
        </div>
      </div>
      {ui.tab === 'tree' ? (
        <div className="uwb-body">
          <div className="uwb-tree" style={{ width: treeW }}>
            <WorkspaceSearch sessionId={sid} cwd={effectiveCwd} onOpen={setFile} />
            <FileTree sessionId={sid} cwd={effectiveCwd} onOpen={setFile} selectedPath={file?.path ?? null} />
          </div>
          <ResizeHandle className="uwb-tree-resize" label={t('resizeTree')} value={treeW} direction={1} min={TREE_MIN} max={Math.min(TREE_MAX, ui.width - 160)} onChange={setTreeW} />
          <div className="uwb-view"><FileViewer sessionId={sid} cwd={effectiveCwd} file={file} /></div>
        </div>
      ) : (
        <GitReview key={`${sid}:${effectiveCwd ?? ''}`} sessionId={sid} cwd={effectiveCwd} />
      )}
    </div>
  )
}

function WorkbenchToggle(props: { ui: ReturnType<typeof createUiStore> }): ReactNode {
  const { t } = useI18n()
  const open = useSyncExternalStore(props.ui.subscribe, () => props.ui.getSnapshot().open)
  return (
    <button
      type="button"
      className={'uwb-openbtn' + (open ? ' on' : '')}
      aria-pressed={open}
      onClick={() => props.ui.set({ open: !open })}
      title={open ? t('closeFilesReview') : t('openFilesReview')}
    >
      <span>{t('filesReview')}</span><Icon name="files" size={12} />
    </button>
  )
}

export function apply(ctx: Context): void {
  const ui = createUiStore()
  const owner = createRuntimeOwner()
  owner.rebind(ctx)
  claimRuntime(owner)

  ctx.effect(() => {
    let rootDiv: HTMLDivElement | undefined
    let root: Root | undefined
    let styleDisposer: () => void = () => undefined
    let slotDisposer: (() => void) | undefined

    const cleanup = (): void => {
      slotDisposer?.()
      slotDisposer = undefined
      root?.unmount()
      root = undefined
      rootDiv?.remove()
      rootDiv = undefined
      styleDisposer()
      styleDisposer = () => undefined
      document.documentElement.style.setProperty('--uwb-width', '0px')
      document.documentElement.style.removeProperty('--uwb-top')
    }
    owner.setCleanup(cleanup)
    if (owner.disposed) return

    styleDisposer = installWorkbenchStyle()
    rootDiv = document.createElement('div')
    rootDiv.setAttribute('data-uwb-root', '')
    document.body.appendChild(rootDiv)
    root = createRoot(rootDiv)
    root.render(<I18nProvider><Workbench ctx={ctx} ui={ui} /></I18nProvider>)
    slotDisposer = ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register(
      { name: 'conversation.session.header.utilities', id: 'ui-workbench', order: 1000 },
      () => <I18nProvider><WorkbenchToggle ui={ui} /></I18nProvider>,
    ))
    return () => owner.dispose()
  }, 'dsh-ui-workbench: mount')
}
