import { createHighlighter, type BundledLanguage, type Highlighter } from 'shiki'

export type SyntaxLanguage = BundledLanguage

const LANGUAGES = [
  'bash', 'css', 'dockerfile', 'go', 'html', 'java', 'javascript', 'jsx', 'json', 'jsonc',
  'markdown', 'mdx', 'powershell', 'python', 'rust', 'sass', 'scss', 'sql', 'svelte',
  'tsx', 'typst', 'typescript', 'vue', 'xml', 'yaml',
] as const

let highlighter: Highlighter | null = null
let pending: Promise<Highlighter | null> | null = null
let revision = 0
const listeners = new Set<() => void>()

export function ensureSyntaxHighlighter(): Promise<Highlighter | null> {
  if (highlighter !== null) return Promise.resolve(highlighter)
  pending ??= createHighlighter({
    langs: [...LANGUAGES],
    themes: ['github-light', 'github-dark'],
  }).then((value) => {
    highlighter = value
    revision += 1
    listeners.forEach((listener) => listener())
    return value
  }).catch(() => null)
  return pending
}

export function getSyntaxHighlighter(): Highlighter | null {
  return highlighter
}

export function getSyntaxRevision(): number {
  return revision
}

export function subscribeSyntax(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
