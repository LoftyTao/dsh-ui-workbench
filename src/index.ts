/**
 * dsh-ui-workbench host half: the /sidebar/api/* JSON routes (session cwd
 * resolution, directory listing, file read, git review). Every operation is
 * conversation-scoped: requests carry a sessionId and the session's
 * authoritative cwd comes from the session store; a missing cwd falls back to
 * a client-supplied absolute path or the process cwd.
 *
 * The workbench panel lives entirely in the browser; this half only serves
 * the file/git data. The official tool-details panel is untouched — the client
 * half builds its own side panel and pushes the app shell with a CSS margin
 * (see src/client), so this plugin never occupies the `details` slot.
 */
import { isAbsolute, join } from 'node:path'
import type { Context } from './context-types.ts'
import { listDirectory, readTextFile, searchFiles } from './fs.ts'
import * as git from './git.ts'
import { readJsonBody, requireString, WorkbenchError, writeError, writeJson } from './wire.ts'

export const name = 'dsh-ui-workbench'

export const inject = ['webServer', 'sessions']

/** Resolve a session's authoritative cwd: live session header wins, then a
 *  client-supplied absolute path, then the process cwd. */
function sessionCwdOf(ctx: Context, sessionId: string, clientCwd?: string): string {
  const headerCwd = ctx.sessions.get(sessionId)?.header.cwd
  if (headerCwd !== undefined && headerCwd !== '') return headerCwd
  if (clientCwd !== undefined && clientCwd !== '') {
    if (!isAbsolute(clientCwd)) throw new WorkbenchError(400, 'bad-request', 'cwd must be absolute')
    return clientCwd
  }
  return process.cwd()
}

function childPath(root: string, child: string): string {
  if (!isAbsolute(child)) throw new WorkbenchError(400, 'bad-request', 'path must be absolute')
  const rel = child.startsWith(root) ? child.slice(root.length).replace(/^[\\/]+/, '') : child
  return join(root, rel)
}

interface HandlerArgs {
  sessionId: string
  cwd?: string
  path?: string
  file?: string
  ref?: string
  query?: string
  full?: boolean
  offset?: number
}

export function apply(ctx: Context): void {
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
        cwd: typeof body.cwd === 'string' ? body.cwd : undefined,
        path: typeof body.path === 'string' ? body.path : undefined,
        file: typeof body.file === 'string' ? body.file : undefined,
        ref: typeof body.ref === 'string' ? body.ref : undefined,
        query: typeof body.query === 'string' ? body.query : undefined,
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
      handler: async (args) => ({ cwd: sessionCwdOf(ctx, args.sessionId, args.cwd) }),
    },
    {
      method: 'listDir',
      path: '/sidebar/api/list-dir',
      handler: async (args) => {
        const root = sessionCwdOf(ctx, args.sessionId, args.cwd)
        const target = args.path !== undefined && args.path !== '' ? childPath(root, args.path) : root
        return { path: target, entries: await listDirectory(target) }
      },
    },
    {
      method: 'readFile',
      path: '/sidebar/api/read-file',
      handler: async (args) => {
        const root = sessionCwdOf(ctx, args.sessionId, args.cwd)
        const target = childPath(root, requireString(args.path, 'path'))
        const { content, truncated, nextOffset } = await readTextFile(target, args.offset ?? 0)
        return { path: target, content, truncated, nextOffset }
      },
    },
    {
      method: 'searchFiles',
      path: '/sidebar/api/search-files',
      handler: async (args) => searchFiles(
        sessionCwdOf(ctx, args.sessionId, args.cwd),
        requireString(args.query, 'query'),
      ),
    },
    {
      method: 'gitRepository',
      path: '/sidebar/api/git/repository',
      handler: async (args) => ({ initialized: await git.isRepository(sessionCwdOf(ctx, args.sessionId, args.cwd)) }),
    },
    {
      method: 'gitInit',
      path: '/sidebar/api/git/init',
      handler: async (args) => {
        await git.initRepository(sessionCwdOf(ctx, args.sessionId, args.cwd))
        return { initialized: true }
      },
    },
    {
      method: 'gitBranch',
      path: '/sidebar/api/git/branch',
      handler: async (args) => ({ branch: await git.branch(sessionCwdOf(ctx, args.sessionId, args.cwd)) }),
    },
    {
      method: 'gitBranches',
      path: '/sidebar/api/git/branches',
      handler: async (args) => ({ branches: await git.branches(sessionCwdOf(ctx, args.sessionId, args.cwd)) }),
    },
    {
      method: 'gitStatusFiles',
      path: '/sidebar/api/git/status',
      handler: async (args) => ({ files: await git.statusFiles(sessionCwdOf(ctx, args.sessionId, args.cwd)) }),
    },
    {
      method: 'gitLastCommitFiles',
      path: '/sidebar/api/git/last-commit',
      handler: async (args) => ({
        files: await git.lastCommitFiles(sessionCwdOf(ctx, args.sessionId, args.cwd), args.ref || 'HEAD'),
      }),
    },
    {
      method: 'gitDiffFile',
      path: '/sidebar/api/git/diff-file',
      handler: async (args) => ({
        diff: await git.diffFile(sessionCwdOf(ctx, args.sessionId, args.cwd), requireString(args.file, 'file'), args.full),
      }),
    },
    {
      method: 'gitLastFileDiff',
      path: '/sidebar/api/git/last-file-diff',
      handler: async (args) => ({
        diff: await git.lastFileDiff(sessionCwdOf(ctx, args.sessionId, args.cwd), requireString(args.file, 'file'), args.ref || 'HEAD', args.full),
      }),
    },
  ]

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
