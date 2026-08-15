import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

function runModule(source) {
  const output = execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    source,
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  return JSON.parse(output.trim().split(/\r?\n/).at(-1) ?? '')
}

test('Function Plugin loader contract is published', async () => {
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'))
  const patch = await readFile(resolve(repositoryRoot, 'cordis.patch.yml'), 'utf8')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.exports['./invariant'].default, './lib/invariant.js')
  assert.match(patch, /name: 'dsh-ui-workbench'/)

  const entry = pathToFileURL(resolve(repositoryRoot, 'lib/index.js')).href
  const result = runModule(`import { Config, inject, name } from ${JSON.stringify(entry)}; console.log(JSON.stringify({ name, inject, config: Config({}) }))`)
  assert.equal(result.name, 'dsh-ui-workbench')
  assert.deepEqual(result.inject, ['webServer', 'sessions'])
  assert.deepEqual(result.config, {})
})
