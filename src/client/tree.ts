import type { FsEntry, GitFileEntry } from './api.ts'

export interface FsTreeEntry {
  name: string
  dir: boolean
  path: string
}

export interface GitTreeEntry {
  name: string
  dir: boolean
  path: string | null
  code: string | null
  children: GitTreeEntry[] | null
}

function sortTree<T extends { name: string; dir: boolean; children?: T[] | null }>(entries: T[]): T[] {
  entries.sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  for (const entry of entries) {
    if (entry.children !== undefined && entry.children !== null) sortTree(entry.children)
  }
  return entries
}

export function buildDirTree(files: FsEntry[], rootPath: string): FsTreeEntry[] {
  return sortTree(files.map((file) => ({
    name: file.name,
    dir: file.dir,
    path: rootPath.replace(/[\\/]+$/, '') + '/' + file.name,
  })))
}

export function buildGitTree(files: GitFileEntry[]): GitTreeEntry[] {
  const root: GitTreeEntry = { name: '', dir: true, path: null, code: null, children: [] }
  for (const file of files) {
    const parts = file.path.split(/[\\/]/).filter((part) => part !== '')
    let node: GitTreeEntry = root
    parts.forEach((name, index) => {
      const isLeaf = index === parts.length - 1
      const children = node.children!
      let child = children.find((candidate) => candidate.name === name && candidate.dir === !isLeaf)
      if (child === undefined) {
        child = isLeaf
          ? { name, dir: false, path: file.path, code: file.code, children: null }
          : { name, dir: true, path: null, code: null, children: [] }
        children.push(child)
      }
      node = child
    })
  }
  return sortTree(root.children ?? [])
}
