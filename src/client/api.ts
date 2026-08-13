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

export async function readFile(sessionId: string, cwd: string | null, path: string): Promise<{ path: string; content: string; truncated: boolean }> {
  const r = await post<ApiEnvelope & { path?: string; content?: string; truncated?: boolean }>('/sidebar/api/read-file', { sessionId, cwd, path })
  if (!r.ok) {
    const error = new Error(r.error?.message ?? 'read failed') as Error & { code?: string }
    error.code = r.error?.code
    throw error
  }
  return { path: r.path ?? path, content: r.content ?? '', truncated: r.truncated ?? false }
}

export async function gitBranch(sessionId: string, cwd: string | null): Promise<string> {
  const r = await post<ApiEnvelope & { branch?: string }>('/sidebar/api/git/branch', { sessionId, cwd })
  return r.branch ?? ''
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

export async function gitDiffFile(sessionId: string, cwd: string | null, file: string): Promise<string> {
  const r = await post<ApiEnvelope & { diff?: string }>('/sidebar/api/git/diff-file', { sessionId, cwd, file })
  return r.diff ?? ''
}

export async function gitLastFileDiff(sessionId: string, cwd: string | null, file: string, ref: string): Promise<string> {
  const r = await post<ApiEnvelope & { diff?: string }>('/sidebar/api/git/last-file-diff', { sessionId, cwd, file, ref })
  return r.diff ?? ''
}
