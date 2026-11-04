/**
 * Lifecycle for `coord-real-cli.ts`: cancel/dispose every session, global
 * timeout, and process-tree kill on error or signal. No real CLI here.
 */

import { spawnSync } from 'node:child_process'

/** Per-turn cap so a hung `claude -p` cannot leak a session. */
export const COORD_REAL_TURN_MS = 45_000

/** Whole-script cap (two rounds). */
export const COORD_REAL_TOTAL_MS = 8 * 60_000

/** Handle a turn-level runner returns from `start`. */
export interface CoordRealHandle {
  runId: string
}

/** Minimal runner surface the CLI script uses. */
export interface CoordRealRunner<H extends CoordRealHandle = CoordRealHandle, E = unknown, I = never> {
  start(input: I): Promise<H>
  stream(handle: H): AsyncIterable<E>
  cancel(handle: H): Promise<void>
  dispose?(): Promise<void>
}

/** Process hooks used by {@link installProcessGuards}. */
export interface ProcessGuardTarget {
  on(event: string, listener: () => void): void
  off(event: string, listener: () => void): void
}

/** Thrown when {@link withTimeout} expires. */
export class CoordRealTimeoutError extends Error {
  /**
   * @param ms - Budget that elapsed.
   */
  constructor(readonly ms: number) {
    super(`coord-real-cli timed out after ${String(ms)}ms`)
    this.name = 'CoordRealTimeoutError'
  }
}

/**
 * argv for killing a PID and its children.
 * @param pid - Root process id.
 * @param platform - Host OS.
 */
export function treeKillArgs(
  pid: number,
  platform: NodeJS.Platform = process.platform,
): { command: string; args: readonly string[] } {
  if (platform === 'win32') return { command: 'taskkill', args: ['/PID', String(pid), '/T', '/F'] }
  return { command: 'kill', args: ['-TERM', `-${String(pid)}`] }
}

/**
 * Kill `pid` and every child. Windows uses `taskkill /T /F`.
 * @param pid - Root process id.
 * @param exec - Injectable spawn (tests pass a spy; default is `spawnSync`).
 * @param platform - Host OS.
 * @returns Spawn status (`0` = the OS accepted the kill).
 */
export function killProcessTree(
  pid: number,
  exec: (command: string, args: readonly string[]) => { status: number | null } = (command, args) =>
    spawnSync(command, [...args], { stdio: 'ignore', windowsHide: true }),
  platform: NodeJS.Platform = process.platform,
): { status: number | null } {
  const { command, args } = treeKillArgs(pid, platform)
  return exec(command, args)
}

/**
 * Cancel a started turn. Swallows cancel errors so cleanup cannot throw.
 * @param runner - Turn runner that owns `handle`.
 * @param handle - Live turn from `start`.
 */
export async function finishSession<H extends CoordRealHandle>(
  runner: Pick<CoordRealRunner<H>, 'cancel'>,
  handle: H,
): Promise<void> {
  try {
    await runner.cancel(handle)
  } catch (cancelError: unknown) {
    void cancelError
  }
}

/**
 * Drop the runner and the process-wide warm pool.
 * @param runner - Optional live runner (`dispose` is optional on the contract).
 * @param disposePool - `disposeRunnerSessions` in production.
 */
export async function shutdownCoordRunner(
  runner: Pick<CoordRealRunner, 'dispose'> | undefined,
  disposePool: () => Promise<void>,
): Promise<void> {
  if (runner?.dispose !== undefined) {
    try {
      await runner.dispose()
    } catch (disposeError: unknown) {
      void disposeError
    }
  }
  try {
    await disposePool()
  } catch (poolError: unknown) {
    void poolError
  }
}

/**
 * Race `work` against `ms`. On expiry run `onTimeout` then throw.
 * @param ms - Budget.
 * @param work - In-flight promise.
 * @param onTimeout - Cleanup (cancel / dispose / tree kill).
 * @returns The work value when it finishes first.
 */
export async function withTimeout<T>(
  ms: number,
  work: Promise<T>,
  onTimeout: () => Promise<void>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      resolve()
    }, ms)
  })
  const raced = await Promise.race([
    work.then(value => ({ ok: true as const, value })),
    timedOut.then(() => ({ ok: false as const })),
  ])
  if (timer !== undefined) clearTimeout(timer)
  if (raced.ok) return raced.value
  await onTimeout()
  throw new CoordRealTimeoutError(ms)
}

/**
 * `start` + collect, then always `cancel`. Per-turn timeout cancels first.
 * @param runner - Turn runner.
 * @param input - `start` payload.
 * @param collect - Stream fold (`collectTurnText` in the CLI).
 * @param turnMs - Per-turn budget.
 * @returns Collected assistant text.
 */
export async function runSessionTurn<H extends CoordRealHandle, E, I>(
  runner: CoordRealRunner<H, E, I>,
  input: I,
  collect: (events: AsyncIterable<E>) => Promise<string>,
  turnMs: number = COORD_REAL_TURN_MS,
): Promise<string> {
  const handle = await runner.start(input)
  try {
    return await withTimeout(turnMs, collect(runner.stream(handle)), async () => {
      await finishSession(runner, handle)
    })
  } finally {
    await finishSession(runner, handle)
  }
}

/**
 * SIGINT / SIGTERM / uncaughtException → shutdown then kill the process tree.
 * @param options.shutdown - Dispose runner + pool.
 * @param options.killTree - `killProcessTree(process.pid)` in production.
 * @param options.exit - `process.exit` after the tree kill (injectable).
 * @param options.on - Event target (default `process`).
 * @returns Disposer that removes the listeners.
 */
export function installProcessGuards(options: {
  shutdown: () => Promise<void>
  killTree: () => void
  exit?: (code: number) => void
  on?: ProcessGuardTarget
}): () => void {
  const target = options.on ?? process
  const exit = options.exit ?? ((code: number) => {
    process.exit(code)
  })
  let stopping = false
  const stop = (): void => {
    if (stopping) return
    stopping = true
    void options.shutdown().finally(() => {
      options.killTree()
      exit(1)
    })
  }
  target.on('SIGINT', stop)
  target.on('SIGTERM', stop)
  target.on('uncaughtException', stop)
  return () => {
    target.off('SIGINT', stop)
    target.off('SIGTERM', stop)
    target.off('uncaughtException', stop)
  }
}
