/**
 * Structural types for the cordis services this plugin consumes. A
 * third-party plugin resolves outside the DSH monorepo, so the upstream
 * `declare module 'cordis'` augmentations do not reach this Context. The
 * members below mirror the actual runtime shapes this plugin touches.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from 'cordis'

export interface WorkbenchWebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

export interface WorkbenchWebServer {
  register(route: WorkbenchWebRoute): () => void
}

export interface WorkbenchSessionHeader {
  cwd?: string
}

/** Host-side session store face (`ctx.sessions.get(id)` returns the live session). */
export interface WorkbenchSessionStore {
  get(id: string): { header: WorkbenchSessionHeader } | undefined
}

/** Client-side session list row (cwd for the explorer root). */
export interface WorkbenchSessionSummary {
  id: string
  cwd?: string
}

/** Client session list snapshot face. */
export interface WorkbenchSessionList {
  current: string | undefined
  byId: Record<string, WorkbenchSessionSummary>
}

/** Client sessions service face (list feed only). */
export interface WorkbenchSessionsClient {
  list: {
    getSnapshot(): WorkbenchSessionList
    subscribe(fn: () => void): () => void
  }
}

declare module 'cordis' {
  interface Context {
    webServer: WorkbenchWebServer
    sessions: WorkbenchSessionStore & Partial<WorkbenchSessionsClient>
    slots: {
      register(options: Record<string, unknown>, component: unknown): () => void
      inject(key: string, callback: () => () => void): () => void
    }
    effect(fn: () => void | (() => void), label?: string): void
  }
}

export type { Context }
