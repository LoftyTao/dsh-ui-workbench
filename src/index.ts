/**
 * dsh-ui-workbench host half: the /sidebar/api/* JSON routes (session cwd
 * resolution, directory listing, file read, git review). Every operation is
 * conversation-scoped: requests carry a sessionId and the session's
 * authoritative cwd comes only from the session store.
 *
 * The workbench panel lives entirely in the browser; this half only serves
 * the file/git data. The official tool-details panel is untouched — the client
 * half builds its own side panel and pushes the app shell with a CSS margin
 * (see src/client), so this plugin never occupies the `details` slot.
 */
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { Config } from './config.ts'
import type { Config as WorkbenchConfig } from './config.ts'
import type { Context } from './context-types.ts'
import { listDirectory, readTextFile, searchFiles } from './fs.ts'
import * as git from './git.ts'
import { assertWorkbenchInvariant, HOST_INJECT, PLUGIN_NAME } from './invariant.ts'
import { renderTypst } from './typst.ts'
import { readJsonBody, requireString, WorkbenchError, writeError, writeJson } from './wire.ts'

export { Config }
export type { WorkbenchConfig }
export { renderTypst }

export const name = PLUGIN_NAME

export const inject = HOST_INJECT

/** Resolve an existing session's workspace once, canonicalizing symlinks. */
async function workspaceRootOf(ctx: Context, sessionId: string): Promise<string> {
  const headerCwd = ctx.sessions.get(sessionId)?.header.cwd
  if (headerCwd === undefined || headerCwd === '') {
    throw new WorkbenchError(404, 'workspace-not-found', 'session workspace was not found')
  }
  try {
    const root = await realpath(headerCwd)
    if (!(await stat(root)).isDirectory()) throw new Error('not a directory')
    return root
  } catch {
    throw new WorkbenchError(404, 'workspace-not-found', 'session workspace was not found')
  }
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../') && !isAbsolute(rel)
}

/** Resolve an existing path and reject lexical or symlink escapes. */
async function existingChildPath(root: string, child: string): Promise<string> {
  if (!isAbsolute(child)) throw new WorkbenchError(400, 'bad-request', 'path must be absolute')
  const lexicalPath = resolve(child)
  if (!isInside(root, lexicalPath)) {
    throw new WorkbenchError(400, 'bad-request', 'path must be inside the workspace')
  }
  try {
    const resolvedPath = await realpath(lexicalPath)
    if (!isInside(root, resolvedPath)) throw new WorkbenchError(400, 'bad-request', 'path must be inside the workspace')
    return resolvedPath
  } catch (error) {
    if (error instanceof WorkbenchError) throw error
    throw new WorkbenchError(404, 'not-found', 'path was not found')
  }
}

/** Git also needs deleted paths, which no longer have a real filesystem entry. */
async function gitFilePath(root: string, file: string): Promise<string> {
  if (isAbsolute(file)) throw new WorkbenchError(400, 'bad-request', 'file must be relative')
  const lexicalPath = resolve(root, file)
  if (!isInside(root, lexicalPath)) throw new WorkbenchError(400, 'bad-request', 'file must be inside the workspace')
  try {
    const resolvedPath = await realpath(lexicalPath)
    if (!isInside(root, resolvedPath)) throw new WorkbenchError(400, 'bad-request', 'file must be inside the workspace')
    return relative(root, resolvedPath).split(sep).join('/')
  } catch (error) {
    if (error instanceof WorkbenchError) throw error
    return relative(root, lexicalPath).split(sep).join('/')
  }
}

interface HandlerArgs {
  sessionId: string
  path?: string
  file?: string
  ref?: string
  query?: string
  revision?: string
  full?: boolean
  offset?: number
}

export function apply(ctx: Context, _config: WorkbenchConfig): void {
  async function handle(
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
    fn: (args: HandlerArgs) => Promise<unknown>,
  ): Promise<void> {
    try {
      const body = await readJsonBody(req)
      const sessionId = requireString(body.sessionId, 'sessionId')
      const args: HandlerArgs = {
        sessionId,
        path: typeof body.path === 'string' ? body.path : undefined,
        file: typeof body.file === 'string' ? body.file : undefined,
        ref: typeof body.ref === 'string' ? body.ref : undefined,
        query: typeof body.query === 'string' ? body.query : undefined,
        revision: typeof body.revision === 'string' ? body.revision : undefined,
        full: body.full === true,
        offset: typeof body.offset === 'number' && Number.isSafeInteger(body.offset) && body.offset >= 0 ? body.offset : undefined,
      }
      const value = await fn(args)
      writeJson(res, 200, { ok: true, ...(value as Record<string, unknown>) })
    } catch (error) {
      writeError(res, error)
    }
  }

  const routes: Array<{ method: string; path: string; handler: (args: HandlerArgs) => Promise<unknown> }> = [
    {
      method: 'cwd',
      path: '/sidebar/api/cwd',
      handler: async (args) => ({ cwd: await workspaceRootOf(ctx, args.sessionId) }),
    },
    {
      method: 'listDir',
      path: '/sidebar/api/list-dir',
      handler: async (args) => {
        const root = await workspaceRootOf(ctx, args.sessionId)
        const target = args.path !== undefined && args.path !== '' ? await existingChildPath(root, args.path) : root
        return { path: target, entries: await listDirectory(target) }
      },
    },
    {
      method: 'readFile',
      path: '/sidebar/api/read-file',
      handler: async (args) => {
        const root = await workspaceRootOf(ctx, args.sessionId)
        const target = await existingChildPath(root, requireString(args.path, 'path'))
        const { content, truncated, nextOffset } = await readTextFile(target, args.offset ?? 0)
        return { path: target, content, truncated, nextOffset }
      },
    },
    {
      method: 'searchFiles',
      path: '/sidebar/api/search-files',
      handler: async (args) => searchFiles(
        await workspaceRootOf(ctx, args.sessionId),
        requireString(args.query, 'query'),
      ),
    },
    {
      method: 'renderTypst',
      path: '/sidebar/api/typst/render',
      handler: async (args) => {
        const root = await workspaceRootOf(ctx, args.sessionId)
        const target = await existingChildPath(root, requireString(args.path, 'path'))
        const preview = await renderTypst(root, target)
        return args.revision === preview.revision
          ? { unchanged: true, revision: preview.revision }
          : { ...preview, unchanged: false }
      },
    },
    {
      method: 'gitRepository',
      path: '/sidebar/api/git/repository',
      handler: async (args) => ({ initialized: await git.isRepository(await workspaceRootOf(ctx, args.sessionId)) }),
    },
    {
      method: 'gitInit',
      path: '/sidebar/api/git/init',
      handler: async (args) => {
        await git.initRepository(await workspaceRootOf(ctx, args.sessionId))
        return { initialized: true }
      },
    },
    {
      method: 'gitBranch',
      path: '/sidebar/api/git/branch',
      handler: async (args) => ({ branch: await git.branch(await workspaceRootOf(ctx, args.sessionId)) }),
    },
    {
      method: 'gitBranches',
      path: '/sidebar/api/git/branches',
      handler: async (args) => ({ branches: await git.branches(await workspaceRootOf(ctx, args.sessionId)) }),
    },
    {
      method: 'gitStatusFiles',
      path: '/sidebar/api/git/status',
      handler: async (args) => ({ files: await git.statusFiles(await workspaceRootOf(ctx, args.sessionId)) }),
    },
    {
      method: 'gitLastCommitFiles',
      path: '/sidebar/api/git/last-commit',
      handler: async (args) => ({
        files: await git.lastCommitFiles(await workspaceRootOf(ctx, args.sessionId), args.ref || 'HEAD'),
      }),
    },
    {
      method: 'gitDiffFile',
      path: '/sidebar/api/git/diff-file',
      handler: async (args) => {
        const root = await workspaceRootOf(ctx, args.sessionId)
        return { diff: await git.diffFile(root, await gitFilePath(root, requireString(args.file, 'file')), args.full) }
      },
    },
    {
      method: 'gitLastFileDiff',
      path: '/sidebar/api/git/last-file-diff',
      handler: async (args) => {
        const root = await workspaceRootOf(ctx, args.sessionId)
        return { diff: await git.lastFileDiff(root, await gitFilePath(root, requireString(args.file, 'file')), args.ref || 'HEAD', args.full) }
      },
    },
  ]

  assertWorkbenchInvariant({ name, inject, routes: routes.map((route) => route.path) })

  for (const route of routes) {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: route.path,
      handler: (req, res) => {
        if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } }); return }
        void handle(req, res, route.handler)
      },
    }), `dsh-ui-workbench: ${route.method}`)
  }
}
