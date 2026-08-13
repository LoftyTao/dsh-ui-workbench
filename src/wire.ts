/**
 * JSON wire helpers for the /sidebar/api/* routes: request body parse,
 * response serialization, and error handling.
 */
import type { ServerResponse } from 'node:http'

export class WorkbenchError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export function readJsonBody(req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => { raw += chunk })
    req.on('end', () => {
      if (raw === '') { resolve({}); return }
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>)
      } catch {
        reject(new WorkbenchError(400, 'bad-json', 'invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

export function writeJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

export function writeError(res: ServerResponse, error: unknown): void {
  if (error instanceof WorkbenchError) {
    writeJson(res, error.status, { ok: false, error: { code: error.code, message: error.message } })
    return
  }
  const message = error instanceof Error ? error.message : String(error)
  writeJson(res, 500, { ok: false, error: { code: 'internal', message } })
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new WorkbenchError(400, 'bad-request', `missing string field "${field}"`)
  }
  return value
}
