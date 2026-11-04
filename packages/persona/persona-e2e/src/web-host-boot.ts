/** Classify Persona web host boot failures (lock queue vs host process). */

export const BUILD_LOCK_WAIT_LINE = /\[with-lock\] waiting for "([^"]+)"/i
export const BUILD_LOCK_READY = /\[with-lock\] ready line seen/i
export const BUILD_LOCK_SCRIPT_TIMEOUT = /\[with-lock\] timed out waiting for/i

export class BuildLockContentionError extends Error {
  readonly lockHolder: string | undefined

  constructor(message: string, lockHolder?: string) {
    super(message)
    this.name = 'BuildLockContentionError'
    this.lockHolder = lockHolder
  }
}

export class WebHostBootTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebHostBootTimeoutError'
  }
}

/**
 * @param output - accumulated stdout/stderr from with-lock + host child.
 */
export function lockHolderFromOutput(output: string): string | undefined {
  const re = /\[with-lock\] waiting for "([^"]+)"/gi
  let holder: string | undefined
  for (const m of output.matchAll(re)) {
    holder = m[1]
  }
  return holder
}

/**
 * True when the harness never reached host argv — still queued on `.maestri/locks/build.lock`.
 */
export function outputIndicatesLockQueueOnly(output: string): boolean {
  if (BUILD_LOCK_READY.test(output)) return false
  if (/dsh web:\s+https?:\/\//.test(output)) return false
  return BUILD_LOCK_WAIT_LINE.test(output) || BUILD_LOCK_SCRIPT_TIMEOUT.test(output)
}

/**
 * @param error - boot failure from {@link startWebHost}.
 */
export function isBuildLockBootFailure(error: unknown): error is BuildLockContentionError {
  return error instanceof BuildLockContentionError
}

export function tailOutput(output: string, max = 2400): string {
  return output.length <= max ? output : output.slice(-max)
}

/**
 * @param output - process log.
 * @param exitCode - child exit code when set.
 */
export function webHostBootFailure(output: string, exitCode: number | null): Error {
  if (exitCode === 75 || BUILD_LOCK_SCRIPT_TIMEOUT.test(output)) {
    const holder = lockHolderFromOutput(output)
    return new BuildLockContentionError(
      `build lock queue timed out${holder === undefined ? '' : ` (holder: ${holder})`} — Rivet/builder packaging still owns the lock; not a Persona runtime defect. Retry when the lock is free or set PERSONA_HOST_NO_LOCK=1 with fresh artifacts.\n${tailOutput(output)}`,
      holder,
    )
  }
  if (outputIndicatesLockQueueOnly(output)) {
    const holder = lockHolderFromOutput(output)
    return new BuildLockContentionError(
      `build lock contention: host process never started while waiting for "${holder ?? 'another builder'}". This is harness lock queueing, not "app failed to boot".\n${tailOutput(output)}`,
      holder,
    )
  }
  return new WebHostBootTimeoutError(
    `timed out waiting for dsh web URL (host boot after lock released)\n${tailOutput(output)}`,
  )
}

/** Default ms to wait in the lock queue before failing with {@link BuildLockContentionError}. */
export function lockQueueTimeoutMs(): number {
  const raw = process.env.PERSONA_LOCK_WAIT_MS
  if (raw === undefined || raw === '') return 12 * 60_000
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 12 * 60_000
}

/** Ms to wait for `dsh web:` after the lock is released (or when using PERSONA_HOST_NO_LOCK). */
export function hostBootTimeoutMs(): number {
  const raw = process.env.PERSONA_HOST_BOOT_MS
  if (raw === undefined || raw === '') return 240_000
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 240_000
}
