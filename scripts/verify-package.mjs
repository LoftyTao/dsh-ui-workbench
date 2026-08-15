import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const [packageText, patchText] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'),
])

const manifest = JSON.parse(packageText)

if (!patchText.includes(`name: '${manifest.name}'`)) {
  throw new Error(`cordis.patch.yml must mount the published package name (${manifest.name})`)
}

const expectedFiles = new Set([
  'LICENSE',
  'README.md',
  'README.en.md',
  'bin/dsh-ui-workbench.mjs',
  'cordis.patch.yml',
  'lib/client.js',
  'lib/index.js',
  'lib/invariant.js',
  'lib/types/client/api.d.ts',
  'lib/types/client/i18n.d.ts',
  'lib/types/client/index.d.ts',
  'lib/types/context-types.d.ts',
  'lib/types/fs.d.ts',
  'lib/types/git.d.ts',
  'lib/types/invariant.d.ts',
  'lib/types/client/tree.d.ts',
  'lib/types/config.d.ts',
  'lib/types/index.d.ts',
  'lib/types/wire.d.ts',
  'package.json',
])
const packedCommand = process.platform === 'win32'
  ? [process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm pack --json --dry-run --ignore-scripts']]
  : ['npm', ['pack', '--json', '--dry-run', '--ignore-scripts']]
const packedOutput = execFileSync(packedCommand[0], packedCommand[1], { encoding: 'utf8' })
// npm runs `prepare` during `npm pack`; tsdown writes progress logs before the
// JSON payload, so parse the final JSON array rather than assuming stdout is
// JSON-only.
const jsonStart = packedOutput.lastIndexOf('\n[')
const packed = JSON.parse((jsonStart === -1 ? packedOutput : packedOutput.slice(jsonStart + 1)).trim())
const packedFiles = new Set(packed[0]?.files?.map((file) => file.path) ?? [])
const unexpected = [...packedFiles].filter((path) => !expectedFiles.has(path))
const missing = [...expectedFiles].filter((path) => !packedFiles.has(path))
if (unexpected.length > 0 || missing.length > 0) {
  throw new Error(`published files differ from the core allowlist (unexpected: ${unexpected.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'})`)
}
