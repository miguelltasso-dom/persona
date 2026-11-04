import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { join } from 'node:path'
import { REPO_ROOT } from './paths.ts'

export interface LockedLaunchOptions {
  label: string
  /** When set, with-lock releases the build lock after this regex matches stdout/stderr. */
  releaseOn?: string
  command: string
  args: string[]
  env?: NodeJS.ProcessEnv
  cwd?: string
}

export interface LockedLaunchHandle {
  readonly child: ChildProcess
  readonly output: { append(chunk: string): void; text(): string }
  stop(): Promise<void>
}

/**
 * Spawn without nested with-lock (caller already holds the build lock).
 */
export function launchDirect(options: Omit<LockedLaunchOptions, 'label' | 'releaseOn'>): LockedLaunchHandle {
  const chunks: string[] = []
  const output = {
    append(chunk: string): void { chunks.push(chunk) },
    text(): string { return chunks.join('') },
  }
  const spawnOptions: SpawnOptions = {
    cwd: options.cwd ?? REPO_ROOT,
    env: options.env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: options.command.endsWith('.cmd') || options.command.endsWith('.bat'),
  }
  const child = spawn(options.command, options.args, spawnOptions)
  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => { output.append(chunk) })
  child.stderr?.on('data', (chunk: string) => { output.append(chunk) })
  return {
    child,
    output,
    stop: async () => {
      if (child.pid === undefined) return
      const { killProcessTree } = await import('./process-tree.ts')
      await killProcessTree(child.pid)
    },
  }
}

const WITH_LOCK = join(REPO_ROOT, 'scripts', 'persona', 'with-lock.mjs')

/**
 * Spawn a long-running app under the shared build lock (optionally releasing early).
 * @param options - lock label, release regex, and inner command.
 */
export function launchUnderLock(options: LockedLaunchOptions): LockedLaunchHandle {
  const chunks: string[] = []
  const output = {
    append(chunk: string): void { chunks.push(chunk) },
    text(): string { return chunks.join('') },
  }

  const lockArgs = [WITH_LOCK, options.label]
  if (options.releaseOn !== undefined) lockArgs.push('--release-on', options.releaseOn)
  lockArgs.push('--', options.command, ...options.args)

  const spawnOptions: SpawnOptions = {
    cwd: options.cwd ?? REPO_ROOT,
    env: options.env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false,
  }

  const child = spawn(process.execPath, lockArgs, spawnOptions)
  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => { output.append(chunk) })
  child.stderr?.on('data', (chunk: string) => { output.append(chunk) })

  return {
    child,
    output,
    stop: async () => {
      if (child.pid === undefined) return
      const { killProcessTree } = await import('./process-tree.ts')
      await killProcessTree(child.pid)
    },
  }
}
