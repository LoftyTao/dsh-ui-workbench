import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

test('git status expands untracked folders into file entries and U status', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'dsh-ui-workbench-'))
  try {
    await mkdir(join(fixture, 'src', 'client'), { recursive: true })
    await writeFile(join(fixture, 'src', 'index.js'), 'export {}\n')
    await writeFile(join(fixture, 'src', 'client', 'index.tsx'), 'export {}\n')
    execFileSync('git', ['-C', fixture, 'init', '--quiet'], { stdio: 'ignore' })

    const gitModule = pathToFileURL(resolve(repositoryRoot, 'src/git.ts')).href
    const output = execFileSync(process.execPath, [
      '--experimental-strip-types',
      '--input-type=module',
      '--eval',
      `import { statusFiles } from ${JSON.stringify(gitModule)}; console.log(JSON.stringify(await statusFiles(${JSON.stringify(fixture)})))`,
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    const files = JSON.parse(output.trim().split(/\r?\n/).at(-1) ?? '')

    assert.deepEqual(files.map((entry) => entry.path), ['src/client/index.tsx', 'src/index.js'])
    assert.deepEqual(files.map((entry) => entry.code), ['U', 'U'])
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('git status exposes single-letter Git abbreviations for tracked edits', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'dsh-ui-workbench-'))
  try {
    await writeFile(join(fixture, 'tracked.txt'), 'before\n')
    execFileSync('git', ['-C', fixture, 'init', '--quiet'], { stdio: 'ignore' })
    execFileSync('git', ['-C', fixture, 'add', 'tracked.txt'], { stdio: 'ignore' })
    execFileSync('git', ['-C', fixture, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init', '--quiet'], { stdio: 'ignore' })
    await writeFile(join(fixture, 'tracked.txt'), 'after\n')
    await writeFile(join(fixture, 'staged.txt'), 'staged\n')
    execFileSync('git', ['-C', fixture, 'add', 'staged.txt'], { stdio: 'ignore' })

    const gitModule = pathToFileURL(resolve(repositoryRoot, 'src/git.ts')).href
    const output = execFileSync(process.execPath, [
      '--experimental-strip-types',
      '--input-type=module',
      '--eval',
      `import { statusFiles } from ${JSON.stringify(gitModule)}; console.log(JSON.stringify(await statusFiles(${JSON.stringify(fixture)})))`,
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    const files = JSON.parse(output.trim().split(/\r?\n/).at(-1) ?? '')

    assert.deepEqual(files, [
      { code: 'A', path: 'staged.txt' },
      { code: 'M', path: 'tracked.txt' },
    ])
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('git output keeps UTF-8 characters intact across data chunks', () => {
  const gitModule = pathToFileURL(resolve(repositoryRoot, 'src/git.ts')).href
  const output = execFileSync(process.execPath, [
    '--experimental-strip-types',
    '--input-type=module',
    '--eval',
    `import { decodeGitChunks } from ${JSON.stringify(gitModule)}; const bytes = Buffer.from('发布文件集合', 'utf8'); const parts = []; for (let i = 0; i < bytes.length; i += 1) parts.push(bytes.subarray(i, i + 1)); console.log(JSON.stringify(decodeGitChunks(parts)))`,
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  assert.equal(output.trim().split(/\r?\n/).at(-1), '"发布文件集合"')
})
