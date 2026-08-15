/**
 * Browser runtime state and ownership shared across bundle evaluations.
 *
 * The DSH client loader may evaluate a replacement aggregate in the same
 * window. Keep the small amount of user-facing state on globalThis so the
 * replacement can claim the runtime without losing the current panel view.
 */

export interface UiState {
  open: boolean
  tab: 'tree' | 'git'
  width: number
}

export interface PersistedFile {
  name: string
  dir: boolean
  path: string
}

export interface PersistedGitSelection {
  path: string
  source: 'work' | 'last'
}

export interface PersistedGitReview {
  viewMode: 'work' | 'last'
  ref: string
  diffLayout: 'split' | 'unified'
  contextMode: 'all' | 'changes'
  filter: string
  sidebarWidth: number
  sel: PersistedGitSelection | null
}

export interface WorkbenchPersistentState {
  version: 1
  ui: UiState
  fileBySession: Record<string, PersistedFile | null>
  treeWidthBySession: Record<string, number>
  gitByKey: Record<string, PersistedGitReview>
}

export interface RuntimeOwner {
  readonly context: unknown
  readonly disposed: boolean
  rebind(context: unknown): void
  setCleanup(cleanup: () => void): void
  dispose(): void
}

interface RuntimeRegistry {
  state: WorkbenchPersistentState
  active?: RuntimeOwner
}

const GLOBAL_KEY = Symbol.for('dsh-ui-workbench/runtime')
const DEFAULT_WIDTH = 720
const DEFAULT_TREE_WIDTH = 220
const MIN_WIDTH = 320
const MAX_WIDTH = 1400
const TREE_MIN = 120
const TREE_MAX = 480

function createState(): WorkbenchPersistentState {
  return {
    version: 1,
    ui: { open: false, tab: 'tree', width: DEFAULT_WIDTH },
    fileBySession: {},
    treeWidthBySession: {},
    gitByKey: {},
  }
}

function isRegistry(value: unknown): value is RuntimeRegistry {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as Partial<RuntimeRegistry>
  return candidate.state?.version === 1 && candidate.state.ui !== undefined
}

function registry(): RuntimeRegistry {
  const globalObject = globalThis as unknown as Record<PropertyKey, unknown>
  const existing = globalObject[GLOBAL_KEY]
  if (isRegistry(existing)) return existing
  const created: RuntimeRegistry = { state: createState() }
  globalObject[GLOBAL_KEY] = created
  return created
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function copyFile(file: PersistedFile | null): PersistedFile | null {
  return file === null ? null : { name: file.name, dir: file.dir, path: file.path }
}

function copySelection(selection: PersistedGitSelection | null): PersistedGitSelection | null {
  return selection === null ? null : { path: selection.path, source: selection.source }
}

function copyGitReview(review: PersistedGitReview): PersistedGitReview {
  return { ...review, sel: copySelection(review.sel) }
}

/** Claim the browser runtime and dispose the previous aggregate owner. */
export function claimRuntime(owner: RuntimeOwner): void {
  const current = registry().active
  if (current !== undefined && current !== owner) current.dispose()
  registry().active = owner
}

/** Create an idempotent runtime owner for one Browser aggregate instance. */
export function createRuntimeOwner(): RuntimeOwner {
  let context: unknown
  let cleanup: () => void = () => undefined
  let disposed = false

  const owner: RuntimeOwner = {
    get context() { return context },
    get disposed() { return disposed },
    rebind(nextContext: unknown) {
      if (disposed) return
      context = nextContext
    },
    setCleanup(nextCleanup: () => void) {
      if (disposed) {
        nextCleanup()
        return
      }
      cleanup = nextCleanup
    },
    dispose() {
      if (disposed) return
      disposed = true
      const currentCleanup = cleanup
      cleanup = () => undefined
      currentCleanup()
      const global = registry()
      if (global.active === owner) delete global.active
    },
  }
  return owner
}

/** Create a UI store backed by state that survives module replacement. */
export function createUiStore(): {
  getSnapshot: () => UiState
  subscribe: (listener: () => void) => () => void
  set: (patch: Partial<UiState>) => void
} {
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => registry().state.ui,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(patch) {
      const state = registry().state
      const next = { ...state.ui, ...patch }
      if (next.open === state.ui.open && next.tab === state.ui.tab && next.width === state.ui.width) return
      state.ui = next
      for (const listener of listeners) listener()
    },
  }
}

export function getFileState(sessionId: string): PersistedFile | null {
  return copyFile(registry().state.fileBySession[sessionId] ?? null)
}

export function setFileState(sessionId: string, file: PersistedFile | null): void {
  registry().state.fileBySession[sessionId] = copyFile(file)
}

export function getTreeWidth(sessionId: string): number {
  return clamp(registry().state.treeWidthBySession[sessionId] ?? DEFAULT_TREE_WIDTH, TREE_MIN, TREE_MAX)
}

export function setTreeWidth(sessionId: string, width: number): void {
  registry().state.treeWidthBySession[sessionId] = clamp(width, TREE_MIN, TREE_MAX)
}

export function getGitReviewState(key: string): PersistedGitReview | null {
  const review = registry().state.gitByKey[key]
  return review === undefined ? null : copyGitReview(review)
}

export function setGitReviewState(key: string, review: PersistedGitReview): void {
  registry().state.gitByKey[key] = copyGitReview(review)
}

/** Keep state defaults and bounds in one exported invariant for tests. */
export const runtimeBounds = Object.freeze({
  defaultWidth: DEFAULT_WIDTH,
  minWidth: MIN_WIDTH,
  maxWidth: MAX_WIDTH,
  treeMin: TREE_MIN,
  treeMax: TREE_MAX,
})
