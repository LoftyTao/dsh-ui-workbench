import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

test('Typst renderer caches SVG pages and uses the bundled font path', { skip: process.platform === 'win32' }, async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'dsh-typst-test-'))
  try {
    const input = join(fixture, 'main.typ')
    const compiler = join(fixture, 'typst-fixture.mjs')
    await writeFile(input, '= Test')
    await writeFile(compiler, `#!/usr/bin/env node
import { access, writeFile } from 'node:fs/promises'
const marker = new URL('./compiler-ran', import.meta.url)
try { await access(marker); process.exit(23) } catch {}
await writeFile(marker, '')
const output = process.argv.at(-1)
const deps = process.argv[process.argv.indexOf('--deps') + 1]
const fontReady = (process.env.TYPST_FONT_PATHS ?? '').includes('fonts')
await writeFile(output.replace('{p}', '1'), fontReady ? '<svg id="font-ready"/>' : '<svg id="font-missing"/>')
await writeFile(deps, JSON.stringify({ inputs: ['main.typ'] }))
`)
    await chmod(compiler, 0o755)

    const moduleUrl = pathToFileURL(resolve(repositoryRoot, 'lib/index.js')).href
    const previous = process.env.DSH_TYPST_BIN
    process.env.DSH_TYPST_BIN = compiler
    try {
      const { renderTypst } = await import(moduleUrl)
      const result = await renderTypst(fixture, input)
      assert.equal(result.pages.length, 1)
      assert.ok(result.pages[0].width > 0)
      assert.ok(result.pages[0].height > 0)
      assert.match(result.pages[0].content, /class="tsel/)
      assert.match(result.pages[0].content, />Test</)
      assert.match(result.shared, /<defs/)
      assert.match(result.revision, /^[a-f0-9]{16}$/)
      assert.deepEqual(await renderTypst(fixture, input), result)
    } finally {
      if (previous === undefined) delete process.env.DSH_TYPST_BIN
      else process.env.DSH_TYPST_BIN = previous
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})
