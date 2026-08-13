/**
 * Filesystem operations for the workbench: directory listing and text read,
 * scoped defensively (a caller path is resolved, then only regular files are
 * read as UTF-8 text).
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export interface FsEntry {
  name: string
  type: 'file' | 'directory' | 'other'
  dir: boolean
}

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

export async function readTextFile(path: string, maxBytes = 500_000): Promise<{ content: string; truncated: boolean }> {
  const s = await stat(path)
  if (!s.isFile()) {
    const error = new Error('not a regular file') as Error & { code?: string }
    error.code = 'NOT_FILE'
    throw error
  }
  const buf = await readFile(path)
  const text = buf.toString('utf8')
  return { content: text.slice(0, maxBytes), truncated: text.length > maxBytes }
}
