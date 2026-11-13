/**
 * COLHEITA 24 (Carbon §1.3, modo c): the dedicated station as one object — the pairing book, the Windows-awake request, the RAM
 * admission and what Tailscale looks like from here. The host and the screen read one {@link StationView}; a turn asks
 * {@link Station.admitTurn} before it starts and {@link Station.noteTurnEnded} when it finishes, so Windows is only held awake
 * while there is work.
 */

import { admit, RAM_FLOOR_BYTES, RAM_PER_CLI_BYTES, type Admission, type WarmCli } from './admission.ts'
import { PairingBook, type PairingRefusal } from './pairing.ts'
import { PowerKeeper } from './power.ts'
import type { StationState } from './station-store.ts'
import { readTailscale, type TailscaleStatus } from './tailscale.ts'
import type { StationPairingCode, StationView } from '../types.ts'

/** What the station needs from the machine. */
export interface StationDeps {
  readonly pairing?: PairingBook
  readonly power?: PowerKeeper
  /** Free memory; default `os.freemem`. */
  readonly freeBytes?: () => number
  /** Warm CLIs alive; default none. */
  readonly running?: () => readonly WarmCli[]
  /** M4: the resident runners the screen shows (all, the working ones, and the ceiling). */
  readonly warm?: () => { readonly resident: number; readonly busy: number; readonly cap: number }
  /** Turns waiting for a slot; default 0. */
  readonly queue?: () => number
  /** Tailscale reader; default {@link readTailscale}. */
  readonly tailscale?: () => Promise<TailscaleStatus>
  /** Whether the station accepts turns; default true. */
  readonly active?: () => boolean
  /** P1-10: what the machine remembered from the last launch (paired, turned off); default not paired, on. */
  readonly initial?: StationState
  /** P1-10: called when the pairing or the on/off switch changes, so it survives a restart. */
  readonly persist?: (state: StationState) => void
}

/** The dedicated station of this machine. */
export class Station {
  /** The one-time pairing codes. */
  readonly pairing: PairingBook
  private readonly deps: StationDeps
  private readonly power: PowerKeeper
  private on = true
  private paired = false
  /** M4: turns admitted and not yet ended, as the gate last said. */
  private turns = 0
  /** M4: cards the station could still move on its own (doing, waiting for a slot, scheduled retry), as the host last said. */
  private readonly openWork = new Map<string, number>()

  /** @param deps - Machine readings and the two books. */
  private crashes: number | undefined
  private lastStartAt: number | undefined
  private lastExit: 'clean' | undefined
  private pausedBy: 'queda' | undefined
  private team: StationState['team'] | undefined

  constructor(deps: StationDeps = {}) {
    this.deps = deps
    this.pairing = deps.pairing ?? new PairingBook()
    this.power = deps.power ?? new PowerKeeper()
    this.on = deps.active?.() ?? deps.initial?.running ?? true
    this.paired = deps.initial?.paired ?? false
    this.crashes = deps.initial?.crashes
    this.lastStartAt = deps.initial?.lastStartAt
    this.lastExit = deps.initial?.lastExit
    this.pausedBy = deps.initial?.pausedBy
    this.team = deps.initial?.team
  }

  /** @returns Whether this machine is the paired dedicated station (the RAM floor and the awake request apply only then). */
  isPaired(): boolean {
    return this.paired
  }

  /** @returns Whether the person left the station on (the default). */
  isRunning(): boolean {
    return this.on
  }

  private snapshot(): StationState {
    return {
      paired: this.paired,
      running: this.on,
      ...(this.crashes === undefined ? {} : { crashes: this.crashes }),
      ...(this.lastStartAt === undefined ? {} : { lastStartAt: this.lastStartAt }),
      ...(this.lastExit === undefined ? {} : { lastExit: this.lastExit }),
      ...(this.pausedBy === undefined ? {} : { pausedBy: this.pausedBy }),
      ...(this.team === undefined ? {} : { team: this.team }),
    }
  }

  private remember(): void {
    this.deps.persist?.(this.snapshot())
  }

  /** Issue the code the person reads on their own PC. */
  issueCode(): StationPairingCode {
    return this.pairing.issue()
  }

  /**
   * Redeem the code typed on this station.
   * @param code - What was typed.
   * @returns `ok` when the station is now paired.
   */
  redeem(code: string): 'ok' | PairingRefusal {
    const result = this.pairing.redeem(code)
    if (result === 'ok') {
      this.paired = true
      this.remember()
    }
    return result
  }

  /**
   * Turn the station on or off (off stops accepting turns and lets Windows sleep).
   * @param on - The new state.
   * @param options - `remember: false` for the host going away (quit / pause): that is NOT the person's switch, so nothing is written and the next launch finds the
   * station as they left it (a restart must never turn the team off).
   */
  setRunning(on: boolean, options: { readonly remember?: boolean } = {}): void {
    this.on = on
    if (on && options.remember !== false) {
      this.pausedBy = undefined
      this.crashes = undefined
      this.lastExit = undefined
    }
    if (!on) this.power.release()
    else this.syncPower()
    if (options.remember !== false) this.remember()
  }

  /** Record a clean shutdown exit so the next launch resets the crash streak. */
  markCleanExit(): void {
    this.lastExit = 'clean'
    this.remember()
  }

  /**
   * M4 (Keel 12/11 14:44): the host tells how many cards still have work the station can do by itself. The paired, running station stays awake while
   * a turn runs OR any card is open; it lets Windows sleep when only cards waiting for the person remain.
   * @param count - Open cards: doing, waiting for a slot ("sem vaga") or with a retry scheduled.
   * @param source - Who counts (the board and the gate each report their own number; the station adds them).
   */
  noteOpenWork(count: number, source?: string): void {
    this.openWork.set(source ?? 'board', Math.max(0, count))
    this.syncPower()
  }

  private openCards(): number {
    let total = 0
    for (const count of this.openWork.values()) total += count
    return total
  }

  private syncPower(): void {
    if (!this.on || !this.paired) return
    if (this.turns > 0 || this.openCards() > 0) this.power.hold()
    else this.power.release()
  }

  /**
   * Ask for a slot before a turn starts: admission by RAM, and Windows held awake.
   * @returns Whether the turn fits (and which idle CLIs to close first).
   */
  admitTurn(): Admission {
    if (!this.on) return { ok: false, reason: 'sem-vaga', evict: [] }
    const freeBytes = (this.deps.freeBytes ?? (() => 0))()
    const running = this.deps.running?.() ?? []
    const result = admit({ freeBytes, running, now: Date.now() })
    if (result.ok) {
      this.turns = Math.max(this.turns, 1)
      this.power.hold()
    }
    return result
  }

  /**
   * A turn finished: when nothing is left, Windows may sleep again.
   * @param remaining - Turns still running or queued.
   */
  noteTurnEnded(remaining: number): void {
    this.turns = Math.max(0, remaining)
    // Open cards keep Windows awake after the last turn ended (backoff, retry, the 30 s wait for memory).
    if (remaining <= 0 && this.openCards() === 0) this.power.release()
  }

  /** The screen's data. */
  async view(): Promise<StationView> {
    const freeBytes = (this.deps.freeBytes ?? (() => 0))()
    return {
      paired: this.paired,
      power: this.power.state(),
      running: this.on,
      ram: { freeBytes, floorBytes: RAM_FLOOR_BYTES, perCliBytes: RAM_PER_CLI_BYTES },
      queue: this.deps.queue?.() ?? 0,
      clis: this.deps.running?.().length ?? 0,
      ...(this.deps.warm === undefined ? {} : { warm: this.deps.warm() }),
      tailscale: await (this.deps.tailscale ?? readTailscale)(),
      ...(this.crashes !== undefined && this.crashes > 0 ? { crashes: this.crashes } : {}),
      ...(this.pausedBy === undefined ? {} : { pausedBy: this.pausedBy }),
    }
  }
}
