/**
 * P1-10 (Carbon, colheita-s1), Item 24: the dedicated station is a gate every turn passes, not a screen that talks to nobody. Before, `admitTurn` and
 * `noteTurnEnded` had no caller in production: "Desligar" did not stop a single turn, the RAM floor never ran and Windows was never held awake.
 *
 * The policy (Keel, 12/11 04:33):
 *  - the default is ON: a machine nobody configured accepts every turn and measures nothing;
 *  - "Desligada" is the person's explicit choice and holds on ANY machine: no turn starts;
 *  - the RAM floor and "stay awake while there is work" apply only when this machine is the PAIRED station;
 *  - a refusal is a calm "sem vaga": the turn does not run, the Task is `blocked` with an honest line and runs again by itself when the station is turned on
 *    or there is memory again. Never an error in the person's face.
 *
 * The gate asks at the one place every turn goes through (`Orchestration.resolveFor`) and follows each runner's `running` / `idle` events to tell the station
 * when the work is over. Pure enough to test with a fake station, a fake clock and a fake timer.
 */

import type { Runner } from '@deepseek-ai/dsh-persona-engine'
import type { Station } from './station.ts'

/** Why the station did not take the turn. */
export type StationBusyReason = 'desligada' | 'sem-memoria'

const LINES: Readonly<Record<StationBusyReason, string>> = {
  desligada: 'O computador dedicado está desligado. Ligue-o em Configurações › Conexões e a equipe volta ao trabalho.',
  'sem-memoria': 'O computador dedicado está sem memória livre agora. A equipe volta ao trabalho sozinha quando houver espaço.',
}

/** Raised before a turn starts when the station does not take it. The message is the sentence the person reads (the same road as the real-turn cap). */
export class StationBusyError extends Error {
  readonly code = 'station_busy' as const
  readonly reason: StationBusyReason

  /** @param reason - Why the station did not take the turn. */
  constructor(reason: StationBusyReason) {
    super(LINES[reason])
    this.name = 'StationBusyError'
    this.reason = reason
  }

  /** The engine stores `String(error)` as the delivery failure shown to the person: no class name, just the sentence. */
  override toString(): string {
    return this.message
  }
}

/**
 * @param error - Caught value.
 * @returns true for a refusal by the station.
 */
export function isStationBusyError(error: unknown): error is StationBusyError {
  return error instanceof StationBusyError
}

/** A Task the station stopped, to run again. */
export interface StationWaitRow {
  readonly projectId: string
  readonly ticketId: string
  readonly assignmentId: string
}

/** What the gate needs from the host. */
export interface StationGateDeps {
  /** Run again the Tasks the station stopped (`Orchestration.resumeStationWaiting`). */
  readonly resume: () => Promise<unknown>
  /** How long to wait before looking for memory again; default 30 s. */
  readonly retryMs?: number
  /** How long an admitted turn may take to start before the awake request is let go; default 60 s. */
  readonly startMs?: number
  /** Timer seam; default `setTimeout` (unref'd, so it never keeps the host alive). */
  readonly schedule?: (run: () => void, ms: number) => unknown
  /** Cancels what `schedule` returned. */
  readonly cancel?: (handle: unknown) => void
}

/** The gate between the turns of the host and the dedicated station. */
export class StationGate {
  private readonly station: Station
  private readonly deps: StationGateDeps
  private readonly following = new WeakSet<object>()
  private readonly working = new Set<object>()
  private readonly waiting = new Map<string, StationWaitRow>()
  private retry: unknown
  private start: unknown

  /**
   * @param station - The dedicated station of this machine.
   * @param deps - What to run to resume the stopped Tasks, and the timers.
   */
  constructor(station: Station, deps: StationGateDeps) {
    this.station = station
    this.deps = deps
  }

  /**
   * Ask for a slot before a turn starts.
   * @throws StationBusyError when the station is off, or this is the paired station and the RAM floor does not fit one more turn.
   */
  admit(): void {
    if (!this.station.isRunning()) throw new StationBusyError('desligada')
    // An ordinary computer: nothing is measured and nothing is held.
    if (!this.station.isPaired()) return
    const answer = this.station.admitTurn()
    if (!answer.ok) {
      this.armRetry()
      throw new StationBusyError('sem-memoria')
    }
    // Windows is held awake now; if this turn never starts (the resolve failed after the gate), the request is let go instead of leaking.
    this.armStart()
  }

  /**
   * Follow a runner: its turns tell the station when work starts and ends. Idempotent.
   * @param runner - The runner a turn is about to use.
   */
  track(runner: Runner): void {
    if (this.following.has(runner)) return
    this.following.add(runner)
    runner.onEvent((event) => {
      if (event.type === 'running') {
        this.working.add(runner)
        return
      }
      if (event.type === 'idle' || event.type === 'error') {
        this.working.delete(runner)
        this.station.noteTurnEnded(this.working.size)
      }
    })
  }

  /**
   * The runner is gone (evicted, disposed): it no longer counts as work.
   * @param runner - The runner dropped.
   */
  forget(runner: Runner): void {
    if (this.working.delete(runner)) this.station.noteTurnEnded(this.working.size)
  }

  /**
   * Remember a Task the station stopped, so it runs again by itself.
   * @param row - The Task and its Assignment.
   */
  waitFor(row: StationWaitRow): void {
    this.waiting.set(`${row.projectId}:${row.ticketId}`, row)
    // A Task stopped by the switch waits for the switch; one stopped by memory looks again (armed at the refusal).
    if (this.station.isRunning()) this.armRetry()
  }

  /** @returns The Tasks the station stopped, oldest first, and forgets them (the caller runs them again; a Task refused again comes back through {@link waitFor}). */
  takeWaiting(): StationWaitRow[] {
    const rows = [...this.waiting.values()]
    this.waiting.clear()
    return rows
  }

  /** @returns How many Tasks wait for the station. */
  waitingCount(): number {
    return this.waiting.size
  }

  /** The person turned the station on: run again what it stopped, now. */
  resumeNow(): void {
    this.disarm('retry')
    if (this.waiting.size === 0) return
    void this.deps.resume().catch((error: unknown) => { void error })
  }

  private armRetry(): void {
    if (this.retry !== undefined) return
    this.retry = this.timer(() => {
      this.retry = undefined
      // Off stays off until the switch (the `resumeNow` of "Ligar"); only memory is looked for again by the clock.
      if (this.station.isRunning() && this.waiting.size > 0) void this.deps.resume().catch((error: unknown) => { void error })
    }, this.deps.retryMs ?? 30_000)
  }

  private armStart(): void {
    this.disarm('start')
    this.start = this.timer(() => {
      this.start = undefined
      this.station.noteTurnEnded(this.working.size)
    }, this.deps.startMs ?? 60_000)
  }

  private disarm(which: 'retry' | 'start'): void {
    const handle = which === 'retry' ? this.retry : this.start
    if (handle === undefined) return
    if (which === 'retry') this.retry = undefined
    else this.start = undefined
    ;(this.deps.cancel ?? ((value: unknown) => { clearTimeout(value as NodeJS.Timeout) }))(handle)
  }

  private timer(run: () => void, ms: number): unknown {
    if (this.deps.schedule !== undefined) return this.deps.schedule(run, ms)
    const handle = setTimeout(run, ms)
    handle.unref()
    return handle
  }
}
