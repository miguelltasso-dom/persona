/** Resolve the private-history executable without requiring the user to install developer tools. */
import { execFile } from 'node:child_process'
import { delimiter, resolve } from 'node:path'

/** Executable selected for private history and task drafts. */
export interface GitResolution {
  readonly executable: string
  readonly source: 'path' | 'bundled'
}

/** Caller-owned environment and optional app resource. */
export interface GitResolutionOptions {
  readonly env?: NodeJS.ProcessEnv
  /** Absolute path to the packaged cmd/git.exe; omitted on hosts without bundled Git. */
  readonly bundledExecutable?: string
  /** Deadline for each read-only version probe; defaults to 3000 ms. */
  readonly timeoutMs?: number
}

/** Read-only subprocess port; true means the executable returned a Git version. */
export type GitVersionProbe = (executable: string, env: NodeJS.ProcessEnv, timeoutMs: number) => Promise<boolean>

/** The task draft cannot be prepared with either an installed or bundled executable. */
export class GitUnavailableError extends Error {
  readonly code = 'workspace_component_unavailable'
  constructor() {
    super('Não conseguimos preparar o rascunho. Reabra ou reinstale a Persona e tente de novo.')
    this.name = 'GitUnavailableError'
  }
}

function probeGitVersion(executable: string, env: NodeJS.ProcessEnv, timeoutMs: number): Promise<boolean> {
  return new Promise((resolveProbe) => {
    execFile(executable, ['--version'], { env, timeout: timeoutMs, maxBuffer: 4096, windowsHide: true, shell: false },
      (error, stdout) => { resolveProbe(error === null && /^git version \d/u.test(stdout.trim())) })
  })
}

/**
 * Prefer a working PATH installation, then the explicit packaged resource. No prompt or shell is used.
 * @param options - Environment, bundled executable and probe deadline.
 * @param probe - Read-only version execution port.
 * @returns Absolute executable path; throws an actionable error when no candidate works.
 */
export async function resolveGitExecutable(
  options: GitResolutionOptions = {}, probe: GitVersionProbe = probeGitVersion,
): Promise<GitResolution> {
  const env = options.env ?? process.env
  const timeoutMs = options.timeoutMs ?? 3000
  const pathKey = Object.keys(env).sort().find(key => process.platform === 'win32' ? key.toLowerCase() === 'path' : key === 'PATH')
  const directories = (pathKey === undefined ? '' : env[pathKey] ?? '').split(delimiter)
  const name = process.platform === 'win32' ? 'git.exe' : 'git'
  const attempted = new Set<string>()
  for (const directory of directories) {
    if (directory === '') continue
    const executable = resolve(directory.replace(/^"(.*)"$/u, '$1'), name)
    if (attempted.has(executable)) continue
    attempted.add(executable)
    if (await probe(executable, env, timeoutMs)) return { executable, source: 'path' }
  }
  if (options.bundledExecutable !== undefined) {
    const executable = resolve(options.bundledExecutable)
    if (!attempted.has(executable) && await probe(executable, env, timeoutMs)) return { executable, source: 'bundled' }
  }
  throw new GitUnavailableError()
}
