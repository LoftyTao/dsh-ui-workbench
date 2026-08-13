import { readFile } from 'node:fs/promises'

const [packageText, pluginText, patchText] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../dsh.plugin.json', import.meta.url), 'utf8'),
  readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'),
])

const manifest = JSON.parse(packageText)
const plugin = JSON.parse(pluginText)

if (plugin.version !== manifest.version) {
  throw new Error(`dsh.plugin.json version (${plugin.version}) must match package.json version (${manifest.version})`)
}
if (!patchText.includes(`name: '${manifest.name}'`)) {
  throw new Error(`cordis.patch.yml must mount the published package name (${manifest.name})`)
}
