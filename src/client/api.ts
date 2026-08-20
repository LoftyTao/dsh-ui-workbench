/**
 * Client-side API over the host half's /sidebar/api/* JSON routes.
 */
export interface FsEntry {
  name: string
  type: 'file' | 'directory' | 'other'
  dir: boolean
}

export interface GitFileEntry {
  code: string
  path: string
}

export interface FsSearchEntry {
  name: string
  path: string
  relative: string
}

interface ApiError {
  code: string
  message: string
}

interface ApiEnvelope {
  ok: boolean
  error?: ApiError
}

async function post<T extends ApiEnvelope>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  })
  return (await res.json()) as T
}

export async function sessionCwd(sessionId: string): Promise<string | null> {
  const r = await post<ApiEnvelope & { cwd?: string }>('/sidebar/api/cwd', { sessionId })
  if (!r.ok || typeof r.cwd !== 'string') return null
  return r.cwd
}

export async function listDir(sessionId: string, cwd: string | null, path?: string): Promise<{ path: string; entries: FsEntry[] }> {
  const r = await post<ApiEnvelope & { path?: string; entries?: FsEntry[] }>('/sidebar/api/list-dir', { sessionId, cwd, path })
  if (!r.ok || !Array.isArray(r.entries)) return { path: path ?? '', entries: [] }
  return { path: r.path ?? (path ?? ''), entries: r.entries }
}

export async function readFile(sessionId: string, cwd: string | null, path: string, offset = 0): Promise<{ path: string; content: string; truncated: boolean; nextOffset: number }> {
  const r = await post<ApiEnvelope & { path?: string; content?: string; truncated?: boolean; nextOffset?: number }>('/sidebar/api/read-file', { sessionId, cwd, path, offset })
  if (!r.ok) {
    const error = new Error(r.error?.message ?? 'read failed') as Error & { code?: string }
    error.code = r.error?.code
    throw error
  }
  return { path: r.path ?? path, content: r.content ?? '', truncated: r.truncated ?? false, nextOffset: r.nextOffset ?? offset }
}

export async function searchFiles(sessionId: string, cwd: string | null, query: string): Promise<{ entries: FsSearchEntry[]; truncated: boolean }> {
  const r = await post<ApiEnvelope & { entries?: FsSearchEntry[]; truncated?: boolean }>('/sidebar/api/search-files', { sessionId, cwd, query })
  if (!r.ok) throw new Error(r.error?.message ?? 'search failed')
  return { entries: Array.isArray(r.entries) ? r.entries : [], truncated: r.truncated === true }
}

export interface TypstPage {
  width: number
  height: number
  content: string
}

export async function renderTypst(sessionId: string, cwd: string | null, path: string, revision?: string): Promise<{ pages: TypstPage[]; shared: string; diagnostics: string; revision: string; unchanged: boolean }> {
  const r = await post<ApiEnvelope & { pages?: unknown[]; shared?: string; diagnostics?: string; revision?: string; unchanged?: boolean }>('/sidebar/api/typst/render', { sessionId, cwd, path, revision })
  if (!r.ok) {
    const error = new Error(r.error?.message ?? 'Typst rendering failed') as Error & { code?: string }
    error.code = r.error?.code
    throw error
  }
  return {
    pages: Array.isArray(r.pages) ? r.pages.filter((page): page is TypstPage => {
      const value = page as Partial<TypstPage>
      return typeof value.width === 'number' && typeof value.height === 'number' && typeof value.content === 'string'
    }) : [],
    shared: r.shared ?? '',
    diagnostics: r.diagnostics ?? '',
    revision: r.revision ?? '',
    unchanged: r.unchanged === true,
  }
}

export async function gitBranch(sessionId: string, cwd: string | null): Promise<string> {
  const r = await post<ApiEnvelope & { branch?: string }>('/sidebar/api/git/branch', { sessionId, cwd })
  return r.branch ?? ''
}

export async function gitRepository(sessionId: string, cwd: string | null): Promise<boolean> {
  const r = await post<ApiEnvelope & { initialized?: boolean }>('/sidebar/api/git/repository', { sessionId, cwd })
  if (!r.ok) throw new Error(r.error?.message ?? 'git check failed')
  return r.initialized === true
}

export async function gitInit(sessionId: string, cwd: string | null): Promise<void> {
  const r = await post<ApiEnvelope & { initialized?: boolean }>('/sidebar/api/git/init', { sessionId, cwd })
  if (!r.ok || r.initialized !== true) throw new Error(r.error?.message ?? 'git init failed')
}

export async function gitBranches(sessionId: string, cwd: string | null): Promise<string[]> {
  const r = await post<ApiEnvelope & { branches?: string[] }>('/sidebar/api/git/branches', { sessionId, cwd })
  return Array.isArray(r.branches) ? r.branches : []
}

export async function gitStatusFiles(sessionId: string, cwd: string | null): Promise<GitFileEntry[]> {
  const r = await post<ApiEnvelope & { files?: GitFileEntry[] }>('/sidebar/api/git/status', { sessionId, cwd })
  return Array.isArray(r.files) ? r.files : []
}

export async function gitLastCommitFiles(sessionId: string, cwd: string | null, ref: string): Promise<GitFileEntry[]> {
  const r = await post<ApiEnvelope & { files?: GitFileEntry[] }>('/sidebar/api/git/last-commit', { sessionId, cwd, ref })
  return Array.isArray(r.files) ? r.files : []
}

export async function gitDiffFile(sessionId: string, cwd: string | null, file: string, full = false): Promise<string> {
  const r = await post<ApiEnvelope & { diff?: string }>('/sidebar/api/git/diff-file', { sessionId, cwd, file, full })
  return r.diff ?? ''
}

export async function gitLastFileDiff(sessionId: string, cwd: string | null, file: string, ref: string, full = false): Promise<string> {
  const r = await post<ApiEnvelope & { diff?: string }>('/sidebar/api/git/last-file-diff', { sessionId, cwd, file, ref, full })
  return r.diff ?? ''
}
