import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

function runTypeScriptModule(source) {
  const output = execFileSync(process.execPath, [
    '--experimental-strip-types',
    '--input-type=module',
    '--eval',
    source,
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  return JSON.parse(output.trim().split(/\r?\n/).at(-1) ?? '')
}

test('theme adapter reads the resolved DSH appearance and forwards changes', () => {
  const themeModule = pathToFileURL(resolve(repositoryRoot, 'src/client/theme.ts')).href
  const result = runTypeScriptModule(`
    import { getThemeColorScheme, subscribeTheme } from ${JSON.stringify(themeModule)}
    let handler
    let disposed = 0
    const ctx = {
      theme: { getTheme() { return { active: { colorScheme: 'dark' } } } },
      on(event, listener) { if (event !== 'theme/change') throw new Error('unexpected event'); handler = listener; return () => { disposed += 1 } },
    }
    let updates = 0
    const off = subscribeTheme(ctx, () => { updates += 1 })
    handler?.()
    off()
    console.log(JSON.stringify({ scheme: getThemeColorScheme(ctx), updates, disposed }))
  `)
  assert.deepEqual(result, { scheme: 'dark', updates: 1, disposed: 1 })
})

test('theme adapter falls back to the DSH document marker', () => {
  const themeModule = pathToFileURL(resolve(repositoryRoot, 'src/client/theme.ts')).href
  const result = runTypeScriptModule(`
    import { getThemeColorScheme } from ${JSON.stringify(themeModule)}
    globalThis.document = {
      documentElement: { style: {} },
      body: { hasAttribute(name) { return name === 'data-ds-dark-theme' } },
    }
    console.log(JSON.stringify(getThemeColorScheme({})))
  `)
  assert.equal(result, 'dark')
})

test('theme adapter observes DSH DOM theme changes without the optional service', () => {
  const themeModule = pathToFileURL(resolve(repositoryRoot, 'src/client/theme.ts')).href
  const result = runTypeScriptModule(`
    import { getThemeColorScheme, subscribeTheme } from ${JSON.stringify(themeModule)}
    let mutation
    let disconnected = 0
    const body = { dark: false, hasAttribute(name) { return name === 'data-ds-dark-theme' && this.dark } }
    globalThis.document = {
      documentElement: { style: { colorScheme: 'light' } },
      body,
    }
    globalThis.MutationObserver = class MutationObserver {
      constructor(listener) { mutation = listener }
      observe() {}
      disconnect() { disconnected += 1 }
    }
    let updates = 0
    const off = subscribeTheme({}, () => { updates += 1 })
    body.dark = true
    document.documentElement.style.colorScheme = 'dark'
    mutation?.()
    off()
    console.log(JSON.stringify({ scheme: getThemeColorScheme({}), updates, disconnected }))
  `)
  assert.deepEqual(result, { scheme: 'dark', updates: 1, disconnected: 1 })
})

test('workbench theme aliases inherit DSH tokens from the body', () => {
  const css = readFileSync(resolve(repositoryRoot, 'src/client/workbench.css'), 'utf8')
  assert.doesNotMatch(css, /:root\s*\{[\s\S]*?--uwb-bg\s*:/)
  assert.match(css, /\.uwb-root\s*\{[\s\S]*?--uwb-bg\s*:/)
})
