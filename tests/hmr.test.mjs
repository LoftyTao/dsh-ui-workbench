import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

test('Host route registrations dispose cleanly during HMR', () => {
  const entry = pathToFileURL(resolve(repositoryRoot, 'lib/index.js')).href
  const output = execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `
      import { apply, inject, name } from ${JSON.stringify(entry)}
      const active = new Set()
      const disposers = []
      const ctx = {
        sessions: { get() { return undefined } },
        webServer: { register(route) { active.add(route); return () => active.delete(route) } },
        effect(effect) { const dispose = effect(); if (dispose) disposers.push(dispose) },
      }
      apply(ctx, {})
      const routes = [...active].map((route) => route.path)
      for (const dispose of disposers.reverse()) dispose()
      console.log(JSON.stringify({ name, inject, routes, remaining: active.size }))
    `,
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  const result = JSON.parse(output.trim().split(/\r?\n/).at(-1) ?? '')

  assert.equal(result.name, 'dsh-ui-workbench')
  assert.deepEqual(result.inject, ['webServer', 'sessions'])
  assert.equal(result.routes.length, 12)
  assert.ok(result.routes.every((path) => path.startsWith('/sidebar/api/')))
  assert.equal(result.remaining, 0)
})
