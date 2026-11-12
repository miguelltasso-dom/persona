/**
 * One in-memory host per file. Wipe rows between `it`s. File-path hosts stay isolated.
 * Timeout 20 s is for SQLite open under shuffle load — not a wall-clock assertion.
 */

import { Context } from '@deepseek-ai/cordis'
import { afterAll, afterEach, beforeAll, it as baseIt } from 'vitest'
import { backgroundWorkOf } from '../src/background-work.ts'
import { CofreSecretVault } from '../src/cofre-secrets.ts'
import PersonaHost from '../src/index.ts'
import type { HostRunnerFactory } from '../src/runner.ts'

/** Justified: fork pool + SQLite under `--sequence.shuffle` (seed 17 hit 26 s). Not a wall-clock assertion. */
export const HOST_TEST_TIMEOUT_MS = 60_000

/** Justified: `git init` + worktree on a loaded Windows box. */
export const HOST_GIT_TIMEOUT_MS = 45_000

/**
 * `it` with the justified host timeout. `vi.setConfig` is too late — Vitest
 * binds 5 s at collection, which is why shuffle timed out opening SQLite.
 * @param name - Title.
 * @param fn - Body.
 * @param timeout - Override (git specs use {@link HOST_GIT_TIMEOUT_MS}).
 */
export function it(name: string, fn: () => unknown, timeout: number = HOST_TEST_TIMEOUT_MS): void {
  baseIt(name, fn, timeout)
}

const CLOCK = '2026-11-03T15:00:00.000Z'

/**
 * Shared host + optional file-backed hosts for resume tests.
 * @param clock - Injected ISO clock (no wall time).
 */
export function bindHostFile(clock: string = CLOCK): {
  host: (databasePath?: string, nextClock?: string) => PersonaHost
} {
  let shared: { ctx: Context; host: PersonaHost; factory: HostRunnerFactory } | undefined
  const extras: Context[] = []

  beforeAll(() => {
    const ctx = new Context()
    const created = new PersonaHost(ctx)
    created.orchestration.now = () => clock
    shared = { ctx, host: created, factory: created.orchestration.runnerFactory }
  }, HOST_TEST_TIMEOUT_MS)

  afterEach(async () => {
    await Promise.all(extras.splice(0).map(ctx => ctx.fiber.dispose()))
    if (shared === undefined) return
    resetHost(shared.host, clock)
    shared.host.orchestration.runnerFactory = shared.factory
  }, HOST_TEST_TIMEOUT_MS)

  afterAll(async () => {
    if (shared === undefined) return
    await shared.ctx.fiber.dispose()
    shared = undefined
  }, HOST_TEST_TIMEOUT_MS)

  return {
    host(databasePath = '', nextClock = clock): PersonaHost {
      if (databasePath !== '') {
        const ctx = new Context()
        extras.push(ctx)
        const created = new PersonaHost(ctx, { databasePath })
        created.orchestration.now = () => nextClock
        return created
      }
      if (shared === undefined) throw new Error('shared host is not open')
      shared.host.orchestration.now = () => nextClock
      return shared.host
    },
  }
}

/**
 * Drop application rows and live orchestration state. Schema stays.
 * @param host - Open host.
 * @param clock - Clock to restore.
 */
export function resetHost(host: PersonaHost, clock: string = CLOCK): void {
  const db = host.store.db
  // PRAGMA foreign_keys is a no-op inside a transaction.
  db.exec('PRAGMA foreign_keys = OFF')
  const rows = db.prepare(
    `SELECT name FROM sqlite_master
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
       AND name NOT LIKE '%_fts_%'`,
  ).all() as Array<{ name: string }>
  host.store.tx((tx) => {
    for (const row of rows) tx.exec(`DELETE FROM "${row.name}"`)
  })
  db.exec('PRAGMA foreign_keys = ON')
  host.orchestration.runtimes.clear()
  host.orchestration.work = Promise.resolve()
  // Item 12: the background book is per host and outlives the runtimes; a Task left detached by one test must not mark the next test's
  // ticket (ids repeat after the wipe) as background. The clock is the host's, as in `driveTicket` (the book takes its clock when created).
  backgroundWorkOf(host.orchestration, { nowMs: () => Date.parse(host.orchestration.now()) }).reset()
  host.orchestration.cancelled.clear()
  host.orchestration.warmRunners.clear()
  host.orchestration.usedContext.clear()
  host.orchestration.stages.length = 0
  host.orchestration.liveText = undefined
  host.orchestration.liveQuestion = undefined
  host.orchestration.scripted = true
  host.orchestration.now = () => clock
  Reflect.deleteProperty(host.orchestration, 'outboxDeliver')
  host.orchestration.lastErrors.length = 0
  host.sessionMemberId = undefined
  host.lastErrors.length = 0
  host.scheduler.dispose()
  host.scheduler.armed.clear()
  host.scheduler.lastReadyMs = 0
  host.connections.reset()
  host.remoteGuard.reset()
  host.forgetSubjectListCache()
  host.boards.goals.clear()
  host.external.reset()
  host.external.secrets = new CofreSecretVault(host.vault, host.product)
}
