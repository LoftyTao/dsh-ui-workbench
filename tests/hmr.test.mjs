import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

test('Host route registrations dispose and rebind cleanly during HMR', () => {
  const entry = pathToFileURL(resolve(repositoryRoot, 'lib/index.js')).href
  const output = execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `
      import { apply, inject, name } from ${JSON.stringify(entry)}
      const active = new Map()
      function mount(label) {
        const disposers = []
        const ctx = {
          sessions: { get() { return undefined } },
          webServer: { register(route) {
            active.set(route.path, { route, label })
            return () => { if (active.get(route.path)?.route === route) active.delete(route.path) }
          } },
          effect(effect) { const dispose = effect(); if (dispose) disposers.push(dispose) },
        }
        apply(ctx, {})
        return { disposers }
      }
      const first = mount('first')
      const firstRoute = active.get('/sidebar/api/cwd').route
      const firstRoutes = [...active.keys()]
      for (const dispose of first.disposers.reverse()) dispose()
      const second = mount('second')
      const secondRoute = active.get('/sidebar/api/cwd').route
      const secondRoutes = [...active.keys()]
      const labels = [...active.values()].map((entry) => entry.label)
      for (const dispose of second.disposers.reverse()) dispose()
      console.log(JSON.stringify({ name, inject, firstRoutes, secondRoutes, replaced: firstRoute !== secondRoute, labels, remaining: active.size }))
    `,
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  const result = JSON.parse(output.trim().split(/\r?\n/).at(-1) ?? '')

  assert.equal(result.name, 'dsh-ui-workbench')
  assert.deepEqual(result.inject, ['webServer', 'sessions'])
  assert.equal(result.firstRoutes.length, 12)
  assert.equal(result.secondRoutes.length, 12)
  assert.ok(result.secondRoutes.every((path) => path.startsWith('/sidebar/api/')))
  assert.equal(result.replaced, true)
  assert.deepEqual(result.labels, Array.from({ length: 12 }, () => 'second'))
  assert.equal(result.remaining, 0)
})
