#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const packageName = 'dsh-ui-workbench'
const packageSpec = 'github:LoftyTao/dsh-ui-workbench#v0.1.0'

function usage() {
  console.log(`Usage: npx -y ${packageName} setup [--profile <name>]

Installs ${packageName} into a DeepSeek Harness profile.
The default profile is "web".`)
}

function fail(message) {
  console.error(`dsh-ui-workbench: ${message}`)
  process.exitCode = 1
}

const args = process.argv.slice(2)
const command = args.shift()
if (command === undefined || command === '--help' || command === '-h') {
  usage()
} else if (command !== 'setup' && command !== 'install') {
  fail(`unknown command "${command}"`)
  usage()
} else {
  let profile = 'web'
  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--profile') {
      const value = args.shift()
      if (value === undefined || value.startsWith('-')) {
        fail('--profile requires a profile name')
        break
      }
      profile = value
    } else if (arg === '--help' || arg === '-h') {
      usage()
      break
    } else {
      fail(`unknown option "${arg}"`)
      break
    }
  }

  if (process.exitCode !== 1) {
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
    const result = spawnSync(npx, [
      '--yes',
      '--package', '@deepseek-ai/dsh',
      'dsh', 'plugin', '--profile', profile, 'add', packageSpec,
    ], { stdio: 'inherit' })
    if (result.error !== undefined) fail(`could not start npx: ${result.error.message}`)
    else process.exitCode = result.status ?? 1
  }
}
