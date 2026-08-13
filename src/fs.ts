/**
 * Filesystem operations for the workbench: directory listing and text read,
 * scoped defensively (a caller path is resolved, then only regular files are
 * read as UTF-8 text).
 */
import { open, readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

export interface FsEntry {
  name: string
  type: 'file' | 'directory' | 'other'
  dir: boolean
}

export interface FsSearchEntry {
  name: string
  path: string
  relative: string
}

const SEARCH_IGNORED_DIRS = new Set([
  '.git', 'node_modules',
])

export async function listDirectory(root: string): Promise<FsEntry[]> {
  const names = await readdir(root)
  const entries: FsEntry[] = []
  for (const name of names) {
    const full = join(root, name)
    try {
      const s = await stat(full)
      const type: FsEntry['type'] = s.isDirectory() ? 'directory' : s.isFile() ? 'file' : 'other'
      entries.push({ name, type, dir: type === 'directory' })
    } catch {
      entries.push({ name, type: 'other', dir: false })
    }
  }
  entries.sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return entries
}

export async function readTextFile(path: string, offset = 0, maxBytes = 128_000): Promise<{ content: string; truncated: boolean; nextOffset: number }> {
  const s = await stat(path)
  if (!s.isFile()) {
    const error = new Error('not a regular file') as Error & { code?: string }
    error.code = 'NOT_FILE'
    throw error
  }
  const handle = await open(path, 'r')
  try {
    const remaining = Math.max(0, s.size - offset)
    const requested = Math.min(maxBytes, remaining)
    const buffer = Buffer.allocUnsafe(requested)
    const { bytesRead } = await handle.read(buffer, 0, requested, offset)
    let consumed = bytesRead
    let content = ''
    while (consumed >= 0) {
      try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, consumed))
        break
      } catch {
        consumed -= 1
      }
    }
    if (consumed <= 0 && bytesRead > 0) {
      content = buffer.subarray(0, bytesRead).toString('utf8')
      consumed = bytesRead
    }
    const nextOffset = offset + consumed
    return { content, truncated: nextOffset < s.size, nextOffset }
  } finally {
    await handle.close()
  }
}

/** Search file names below a workspace without eagerly walking dependency/build trees. */
export async function searchFiles(
  root: string,
  query: string,
  limit = 80,
  maxVisited = 20_000,
): Promise<{ entries: FsSearchEntry[]; truncated: boolean }> {
  const needle = query.trim().toLocaleLowerCase()
  if (needle === '') return { entries: [], truncated: false }

  const queue = [root]
  const entries: FsSearchEntry[] = []
  let visited = 0
  let limitReached = false
  while (queue.length > 0 && entries.length < limit && visited < maxVisited) {
    const dir = queue.shift()
    if (dir === undefined) break
    let children
    try {
      children = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    children.sort((a, b) => a.name.localeCompare(b.name))
    for (const child of children) {
      visited += 1
      if (visited >= maxVisited) break
      const full = join(dir, child.name)
      if (child.isDirectory()) {
        if (!SEARCH_IGNORED_DIRS.has(child.name)) queue.push(full)
        continue
      }
      if (!child.isFile()) continue
      const rel = relative(root, full)
      if (child.name.toLocaleLowerCase().includes(needle) || rel.toLocaleLowerCase().includes(needle)) {
        entries.push({ name: child.name, path: full, relative: rel })
        if (entries.length >= limit) { limitReached = true; break }
      }
    }
  }
  return { entries, truncated: limitReached || queue.length > 0 || visited >= maxVisited }
}
