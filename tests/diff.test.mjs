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

test('diff parser drops patch metadata and labels hidden lines', () => {
  const diffModule = pathToFileURL(resolve(repositoryRoot, 'src/client/diff.ts')).href
  const rows = runTypeScriptModule(`
    import { inlineDiffRanges, parseDiff, pairDiffRows } from ${JSON.stringify(diffModule)}
    const rows = parseDiff([
      'diff --git a/README.md b/README.md',
      'index 1111111..2222222 100644',
      '--- a/README.md',
      '+++ b/README.md',
      '@@ -1,3 +1,3 @@',
      ' keep',
      '-old line',
      '+new line',
      '@@ -12,3 +12,3 @@',
      ' keep later',
      '-old later',
      '+++ added text',
      '\\\\ No newline at end of file',
    ].join('\\n'))
    console.log(JSON.stringify({
      rows,
      split: pairDiffRows(rows),
      inline: inlineDiffRanges('const value = 1', 'const value = 2'),
    }))
  `)

  assert.deepEqual(rows.rows.map((row) => row.cls), ['ctx', 'del', 'add', 'gap', 'ctx', 'del', 'add'])
  assert.equal(rows.rows[3].count, 9)
  assert.equal(rows.rows[6].text, '++ added text')
  assert.deepEqual(rows.inline, {
    old: [{ start: 14, end: 15 }],
    neu: [{ start: 14, end: 15 }],
  })
  assert.deepEqual(rows.rows[1].inline, [{ start: 0, end: 3 }])
  assert.deepEqual(rows.split[2], {
    kind: 'wide',
    oldLine: '',
    newLine: '',
    oldText: '',
    newText: '',
    oldClass: 'gap',
    newClass: 'gap',
    gapCount: 9,
  })
})

test('inline ranges realign shared text around a Chinese replacement', () => {
  const diffModule = pathToFileURL(resolve(repositoryRoot, 'src/client/diff.ts')).href
  const result = runTypeScriptModule(`
    import { inlineDiffRanges } from ${JSON.stringify(diffModule)}
    console.log(JSON.stringify(inlineDiffRanges('##我是标题', '##标题时')))
  `)

  assert.deepEqual(result, {
    old: [{ start: 2, end: 4 }],
    neu: [{ start: 4, end: 5 }],
  })
})

test('single-sided line changes do not receive inline ranges', () => {
  const diffModule = pathToFileURL(resolve(repositoryRoot, 'src/client/diff.ts')).href
  const result = runTypeScriptModule(`
    import { inlineDiffRanges, parseDiff } from ${JSON.stringify(diffModule)}
    const rows = parseDiff([
      '@@ -1,2 +1,2 @@',
      '-removed line',
      ' context',
      '@@ -4,1 +4,2 @@',
      ' context',
      '+added line',
    ].join('\\n'))
    console.log(JSON.stringify({
      removed: inlineDiffRanges('removed line', ''),
      added: inlineDiffRanges('', 'added line'),
      rows: rows.filter((row) => row.cls === 'del' || row.cls === 'add').map((row) => row.inline),
    }))
  `)

  assert.deepEqual(result, {
    removed: { old: [], neu: [] },
    added: { old: [], neu: [] },
    rows: [[], []],
  })
})
