import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { test } from 'node:test'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

test('Browser aggregate replaces root, slot, and style in one window', () => {
  const entry = pathToFileURL(resolve(repositoryRoot, 'lib/client.js')).href
  const output = execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `
      let client
      const body = { children: [], appendChild(node) { if (!this.children.includes(node)) this.children.push(node); node.isConnected = true }, }
      const head = { children: [], appendChild(node) { if (!this.children.includes(node)) this.children.push(node); node.isConnected = true }, querySelectorAll() { return this.children } }
      const detach = (node) => {
        for (const parent of [body, head]) {
          const index = parent.children.indexOf(node)
          if (index >= 0) parent.children.splice(index, 1)
        }
        node.isConnected = false
      }
      const documentElement = { style: { setProperty() {}, removeProperty() {} } }
      const document = {
        body,
        head,
        documentElement,
        createElement() {
          const node = { dataset: {}, isConnected: false, setAttribute() {}, remove() { detach(node) } }
          return node
        },
      }
      globalThis.document = document
      globalThis.Element = class Element {}
      globalThis.Element.prototype.matches = () => false
      globalThis.window = { __ModuleLoader__: { load(payload) {
        const react = {
          Fragment: Symbol.for('react.fragment'),
          createContext: () => ({}),
          useContext: () => null,
          useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
          useEffect: () => {},
          useMemo: (factory) => factory(),
          useRef: (current) => ({ current }),
          useCallback: (fn) => fn,
          useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
        }
        const jsx = (type, props) => ({ type, props })
        const roots = []
        const require = (id) => {
          if (id === 'react') return react
          if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
          if (id === 'react-dom/client') return { createRoot(node) {
            const root = { node, unmounted: false, render() {}, unmount() { root.unmounted = true } }
            roots.push(root)
            return root
          } }
          throw new Error('unexpected client dependency: ' + id)
        }
        client = payload.factory(require)
        client.__roots = roots
      } } }
      await import(${JSON.stringify(entry)})
      const slots = new Set()
      function mount(label) {
        const disposers = []
        const ctx = {
          sessions: { list: { getSnapshot() { return { byId: {}, current: undefined } }, subscribe() { return () => {} } } },
          slots: {
            register(options) {
              const registration = { label, options }
              slots.add(registration)
              return () => slots.delete(registration)
            },
            inject(_key, callback) {
              const dispose = callback()
              return () => dispose()
            },
          },
          effect(effect) { const dispose = effect(); if (dispose) disposers.push(dispose) },
        }
        client.apply(ctx)
        return { disposers }
      }
      const first = mount('first')
      const second = mount('second')
      for (const dispose of first.disposers.reverse()) dispose()
      const duringReload = { roots: body.children.length, styles: head.children.length, slots: slots.size, rootCount: client.__roots.length }
      for (const dispose of second.disposers.reverse()) dispose()
      console.log(JSON.stringify({ inject: client.inject, duringReload, afterDispose: { roots: body.children.length, styles: head.children.length, slots: slots.size } }))
    `,
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  const result = JSON.parse(output.trim().split(/\r?\n/).at(-1) ?? '')

  assert.deepEqual(result.inject, ['slots', 'sessions'])
  assert.deepEqual(result.duringReload, { roots: 1, styles: 1, slots: 1, rootCount: 2 })
  assert.deepEqual(result.afterDispose, { roots: 0, styles: 0, slots: 0 })
})

test('Browser bundle embeds disposal-managed style and runtime ownership', async () => {
  const bundle = await readFile(resolve(repositoryRoot, 'lib/client.js'), 'utf8')
  assert.match(bundle, /function installStyle\(\)/)
  assert.match(bundle, /pluginCssOwner/)
  assert.match(bundle, /styleDisposer = installStyle\(\)/)
  assert.match(bundle, /owner\.dispose\(\)/)
})

test('Browser bundle keeps syntax colors and layered diff highlights', async () => {
  const bundle = await readFile(resolve(repositoryRoot, 'lib/client.js'), 'utf8')
  assert.match(bundle, /uwb-highlight/)
  assert.match(bundle, /uwb-diff-inline-add/)
  assert.match(bundle, /uwb-diff-inline-del/)
  assert.match(bundle, /uwb-diff-add-line-bg/)
  assert.match(bundle, /inlineDiffRanges/)
  assert.match(bundle, /data-uwb-color-scheme/)
  assert.match(bundle, /theme\/change/)
  assert.match(bundle, /MutationObserver/)
  assert.match(bundle, /shiki-token-comment/)
  assert.match(bundle, /--uwb-diff-add-line-bg: var\(--uwb-diff-add-bg\)/)
  assert.match(bundle, /--uwb-diff-add-inline-bg: color-mix\(in srgb, var\(--uwb-diff-add-bg\) 70%, var\(--dsw-alias-state-success-secondary, var\(--uwb-diff-add-text\)\) 30%\)/)
  assert.match(bundle, /--uwb-diff-del-line-bg: var\(--uwb-diff-del-bg\)/)
  assert.match(bundle, /--uwb-diff-del-inline-bg: color-mix\(in srgb, var\(--uwb-diff-del-bg\) 70%, var\(--dsw-alias-state-error-secondary, var\(--uwb-diff-del-text\)\) 30%\)/)
})

test('client metadata keeps theme optional for no-restart HMR', async () => {
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'))
  assert.deepEqual(manifest.dsh.client.inject, [
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-slots',
  ])
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-client-ui-theme'], undefined)
})

test('Browser runtime handoff disposes the old owner and preserves state', () => {
  const entry = pathToFileURL(resolve(repositoryRoot, 'src/client/runtime.ts')).href
  const output = execFileSync(process.execPath, [
    '--experimental-strip-types',
    '--input-type=module',
    '--eval',
    `
      import {
        claimRuntime,
        createRuntimeOwner,
        createUiStore,
        getFileState,
        getGitReviewState,
        getTreeWidth,
        runtimeBounds,
        setFileState,
        setGitReviewState,
        setTreeWidth,
      } from ${JSON.stringify(entry)}
      let oldDisposed = 0
      let newDisposed = 0
      const first = createRuntimeOwner()
      first.rebind({ id: 'first' })
      first.setCleanup(() => { oldDisposed += 1 })
      claimRuntime(first)
      const firstUi = createUiStore()
      firstUi.set({ open: true, tab: 'git', width: 913 })
      setFileState('session-1', { name: 'README.md', dir: false, path: '/workspace/README.md' })
      setTreeWidth('session-1', 377)
      setGitReviewState('session-1:/workspace', {
        viewMode: 'last', ref: 'main', diffLayout: 'split', contextMode: 'all',
        filter: 'src', sidebarWidth: 301, sel: { path: 'src/index.ts', source: 'last' },
      })
      const second = createRuntimeOwner()
      second.rebind({ id: 'second' })
      second.setCleanup(() => { newDisposed += 1 })
      claimRuntime(second)
      const secondUi = createUiStore()
      const snapshot = {
        oldDisposed,
        newContext: second.context.id,
        ui: secondUi.getSnapshot(),
        file: getFileState('session-1'),
        treeWidth: getTreeWidth('session-1'),
        git: getGitReviewState('session-1:/workspace'),
        bounds: runtimeBounds,
      }
      first.dispose()
      second.dispose()
      second.dispose()
      console.log(JSON.stringify({ snapshot, newDisposed }))
    `,
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  const result = JSON.parse(output.trim().split(/\r?\n/).at(-1) ?? '')

  assert.equal(result.snapshot.oldDisposed, 1)
  assert.equal(result.snapshot.newContext, 'second')
  assert.deepEqual(result.snapshot.ui, { open: true, tab: 'git', width: 913 })
  assert.deepEqual(result.snapshot.file, { name: 'README.md', dir: false, path: '/workspace/README.md' })
  assert.equal(result.snapshot.treeWidth, 377)
  assert.deepEqual(result.snapshot.git, {
    viewMode: 'last', ref: 'main', diffLayout: 'split', contextMode: 'all',
    filter: 'src', sidebarWidth: 301, sel: { path: 'src/index.ts', source: 'last' },
  })
  assert.deepEqual(result.snapshot.bounds, { defaultWidth: 720, minWidth: 320, maxWidth: 1400, treeMin: 120, treeMax: 480 })
  assert.equal(result.newDisposed, 1)
})
