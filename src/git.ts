/**
 * Git operations for the workbench review panel. Everything spawns the
 * system `git` binary per request with `-C <cwd>` and `--no-pager`, and
 * porcelain-parseable `--porcelain` output so parsing never depends on
 * locale or color config.
 */
import { spawn } from 'node:child_process'

function runGit(cwd: string, args: string[], timeoutMs = 30_000, acceptedCodes: readonly number[] = [0]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn('git', ['-C', cwd, '--no-pager', '-c', 'color.ui=false', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`git ${args[0] ?? ''} timed out`))
    }, timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new Error(`cannot run git: ${error.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== null && acceptedCodes.includes(code)) resolve(stdout)
      else reject(new Error(stderr.trim() || `git exited with ${String(code)}`))
    })
  })
}

async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const out = await runGit(cwd, ['rev-parse', '--is-inside-work-tree'])
    return out.trim() === 'true'
  } catch {
    return false
  }
}

export interface GitFileEntry {
  code: string
  path: string
}

export async function branch(cwd: string): Promise<string> {
  try {
    const out = await runGit(cwd, ['branch', '--show-current'])
    return out.trim()
  } catch {
    return ''
  }
}

export async function branches(cwd: string): Promise<string[]> {
  try {
    const out = await runGit(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])
    return out.split('\n').filter((s) => s !== '')
  } catch {
    return []
  }
}

/** Working-tree changed files (index + worktree, untracked included). */
export async function statusFiles(cwd: string): Promise<GitFileEntry[]> {
  if (!(await isGitRepo(cwd))) return []
  const out = await runGit(cwd, ['status', '--porcelain=v1', '--untracked-files=normal'])
  const files: GitFileEntry[] = []
  for (const line of out.split('\n')) {
    if (line === '') continue
    const code = line.slice(0, 2)
    let path = line.slice(3)
    if (code[0] === 'R' || code[0] === 'C') {
      const arrow = path.indexOf(' -> ')
      if (arrow !== -1) path = path.slice(arrow + 4)
    }
    path = path.trim()
    if (path !== '') files.push({ code: code.trim() || '?', path })
  }
  return files
}

/** Files changed by one commit/ref (default HEAD). */
export async function lastCommitFiles(cwd: string, ref = 'HEAD'): Promise<GitFileEntry[]> {
  if (!(await isGitRepo(cwd))) return []
  const out = await runGit(cwd, ['diff-tree', '--no-commit-id', '--name-status', '-r', ref])
  const files: GitFileEntry[] = []
  for (const line of out.split('\n')) {
    if (line === '') continue
    const parts = line.split('\t')
    const code = parts[0] ?? ''
    let path = parts[1] ?? ''
    if (code[0] === 'R' && parts.length >= 3) path = parts[2] ?? ''
    path = path.trim()
    if (path !== '') files.push({ code: code[0] ?? '?', path })
  }
  return files
}

/** Complete working-tree diff for one file (index + worktree + untracked). */
export async function diffFile(cwd: string, file: string): Promise<string> {
  const untracked = await runGit(cwd, ['ls-files', '--others', '--exclude-standard', '--', file])
  if (untracked.split('\n').some((path) => path.trim() === file)) {
    // `git diff --no-index` returns 1 when differences exist. Git recognizes
    // /dev/null as the empty side on every supported platform, including Git
    // for Windows, and emits a normal new-file patch for the review parser.
    return runGit(cwd, ['diff', '--no-index', '--no-ext-diff', '--no-color', '-U3', '--', '/dev/null', file], 30_000, [0, 1])
  }

  try {
    await runGit(cwd, ['rev-parse', '--verify', 'HEAD'])
    return runGit(cwd, ['diff', 'HEAD', '--no-ext-diff', '--no-color', '-U3', '--', file])
  } catch {
    // An unborn repository has no HEAD. `--cached` still shows newly staged
    // files; fall back to the ordinary worktree diff when the index is empty.
    const staged = await runGit(cwd, ['diff', '--cached', '--no-ext-diff', '--no-color', '-U3', '--', file])
    if (staged !== '') return staged
    return runGit(cwd, ['diff', '--no-ext-diff', '--no-color', '-U3', '--', file])
  }
}

/** Diff introduced by one commit/ref for one file. */
export async function lastFileDiff(cwd: string, file: string, ref = 'HEAD'): Promise<string> {
  return runGit(cwd, ['show', '--no-ext-diff', '--no-color', '--format=', ref, '--', file])
}
