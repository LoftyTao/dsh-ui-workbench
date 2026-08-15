import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
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

test('review tree preserves folders and changed files below them', () => {
  const treeModule = pathToFileURL(resolve(repositoryRoot, 'src/client/tree.ts')).href
  const tree = runTypeScriptModule(`
    import { buildGitTree } from ${JSON.stringify(treeModule)}
    console.log(JSON.stringify(buildGitTree([
      { code: 'U', path: 'src/index.js' },
      { code: 'U', path: 'src/client/index.tsx' },
      { code: 'M', path: 'README.md' },
    ])))
  `)
  assert.deepEqual(tree.map((entry) => entry.name), ['src', 'README.md'])
  assert.equal(tree[0].dir, true)
  assert.deepEqual(tree[0].children.map((entry) => entry.name), ['client', 'index.js'])
  assert.equal(tree[0].children[0].children[0].path, 'src/client/index.tsx')
})
