import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler'
import { WorkbenchError } from './wire.ts'

const execFileAsync = promisify(execFile)
const MAX_SVG_BYTES = 32 * 1024 * 1024
const BUNDLED_FONT_DIR = fileURLToPath(new URL('../fonts/', import.meta.url))
const previewCache = new Map<string, { dependencies: string[]; signature: string; preview: TypstPreview }>()
const compilers = new Map<string, NodeCompiler>()

export interface TypstPreview {
  pages: TypstPage[]
  shared: string
  diagnostics: string
  revision: string
}

export interface TypstPage {
  width: number
  height: number
  content: string
}

function splitSvgPages(svg: string): { shared: string; pages: TypstPage[] } {
  const rootEnd = svg.indexOf('>') + 1
  const pagePattern = /<g\b[^>]*\bclass="[^"]*\btypst-page\b[^"]*"[^>]*>/g
  const starts = [...svg.matchAll(pagePattern)]
  const firstStart = starts[0]?.index
  if (rootEnd === 0 || firstStart === undefined) throw new WorkbenchError(500, 'typst-no-pages', 'Typst produced no SVG pages')
  const pages = starts.map((match) => {
    const start = match.index
    const tags = /<\/?g\b[^>]*>/g
    tags.lastIndex = start
    let depth = 0
    let end = -1
    for (let tag = tags.exec(svg); tag !== null; tag = tags.exec(svg)) {
      if (tag[0].startsWith('</')) depth -= 1
      else if (!tag[0].endsWith('/>')) depth += 1
      if (depth === 0) { end = tags.lastIndex; break }
    }
    if (end < 0) throw new WorkbenchError(500, 'typst-invalid-svg', 'Typst produced an invalid SVG page')
    const opening = match[0]
    const width = Number(/\bdata-page-width="([\d.]+)"/.exec(opening)?.[1])
    const height = Number(/\bdata-page-height="([\d.]+)"/.exec(opening)?.[1])
    if (!Number.isFinite(width) || !Number.isFinite(height)) throw new WorkbenchError(500, 'typst-invalid-page-size', 'Typst produced an invalid SVG page size')
    const content = svg.slice(start, end).replace(/\btransform="[^"]*"/, 'transform="translate(0, 0)"')
    return { width, height, content }
  })
  return { shared: svg.slice(rootEnd, firstStart), pages }
}

function typstFontPaths(): string[] {
  const configured = (process.env.TYPST_FONT_PATHS ?? '').split(delimiter).filter(Boolean)
  return [BUNDLED_FONT_DIR, ...configured.filter((path) => path !== BUNDLED_FONT_DIR)]
}

function compilerFor(root: string, fontPaths: string[]): NodeCompiler {
  const key = `${root}\n${fontPaths.join(delimiter)}`
  let compiler = compilers.get(key)
  if (compiler === undefined) {
    compiler = NodeCompiler.create({ workspace: root, fontArgs: [{ fontPaths }] })
    compilers.set(key, compiler)
  }
  return compiler
}

async function dependencySignature(paths: string[]): Promise<string> {
  return (await Promise.all(paths.map(async (path) => {
    try {
      const info = await stat(path)
      return `${path}:${info.size}:${info.mtimeMs}`
    } catch {
      return `${path}:missing`
    }
  }))).join('\n')
}

/** Compile inside the session workspace so Typst imports cannot escape its root. */
export async function renderTypst(root: string, input: string): Promise<TypstPreview> {
  if (!input.toLowerCase().endsWith('.typ')) {
    throw new WorkbenchError(400, 'not-typst', 'only .typ files can be rendered')
  }

  const fontPaths = typstFontPaths()
  const cacheKey = `${input}\n${fontPaths.join(delimiter)}`
  const cached = previewCache.get(cacheKey)
  if (cached !== undefined && await dependencySignature(cached.dependencies) === cached.signature) return cached.preview

  const outputDir = await mkdtemp(join(tmpdir(), 'dsh-typst-'))
  const output = join(outputDir, 'dependency-page-{p}.svg')
  const dependencyOutput = join(outputDir, 'dependencies.json')
  try {
    try {
      await execFileAsync(process.env.DSH_TYPST_BIN || 'typst', [
        'compile', '--root', root, '--format', 'svg', '--deps', dependencyOutput, input, output,
      ], {
        cwd: root,
        env: { ...process.env, TYPST_FONT_PATHS: fontPaths.join(delimiter) },
        timeout: 30_000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      })
    } catch (error) {
      const cause = error as NodeJS.ErrnoException & { stderr?: string; killed?: boolean }
      if (cause.code === 'ENOENT') {
        throw new WorkbenchError(503, 'typst-not-installed', 'Typst CLI was not found on the Harness host')
      }
      const diagnostics = typeof cause.stderr === 'string' && cause.stderr.trim() !== ''
        ? cause.stderr.trim()
        : cause.killed ? 'Typst compilation timed out' : cause.message
      throw new WorkbenchError(422, 'typst-compile-failed', diagnostics)
    }

    let svg: string
    try {
      svg = compilerFor(root, fontPaths).svg({ mainFilePath: input, resetRead: true })
    } catch (error) {
      throw new WorkbenchError(422, 'typst-render-failed', error instanceof Error ? error.message : String(error))
    }
    if (svg === '') throw new WorkbenchError(500, 'typst-no-output', 'Typst produced no SVG document')
    if (Buffer.byteLength(svg) > MAX_SVG_BYTES) throw new WorkbenchError(413, 'typst-output-too-large', 'Typst preview is limited to 32 MB')
    const dependencyData = JSON.parse(await readFile(dependencyOutput, 'utf8')) as { inputs?: unknown }
    const reportedDependencies = Array.isArray(dependencyData.inputs)
      ? dependencyData.inputs.filter((path): path is string => typeof path === 'string').map((path) => resolve(root, path))
      : []
    const dependencies = reportedDependencies.length > 0 ? reportedDependencies : [input]
    const signature = await dependencySignature(dependencies)
    const preview = { ...splitSvgPages(svg), diagnostics: '', revision: createHash('sha256').update(signature).digest('hex').slice(0, 16) }
    previewCache.set(cacheKey, { dependencies, signature, preview })
    return preview
  } finally {
    await rm(outputDir, { recursive: true, force: true })
  }
}
