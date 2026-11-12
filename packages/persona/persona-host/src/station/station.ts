/**
 * COLHEITA 24 (Carbon §1.3, modo c): the dedicated station as one object — the pairing book, the Windows-awake request, the RAM
 * admission and what Tailscale looks like from here. The host and the screen read one {@link StationView}; a turn asks
 * {@link Station.admitTurn} before it starts and {@link Station.noteTurnEnded} when it finishes, so Windows is only held awake
 * while there is work.
 */

import { admit, RAM_FLOOR_BYTES, RAM_PER_CLI_BYTES, type Admission, type WarmCli } from './admission.ts'
import { PairingBook } from './pairing.ts'
import { PowerKeeper } from './power.ts'
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
  /** Turns waiting for a slot; default 0. */
  readonly queue?: () => number
  /** Tailscale reader; default {@link readTailscale}. */
  readonly tailscale?: () => Promise<TailscaleStatus>
  /** Whether the station accepts turns; default true. */
  readonly active?: () => boolean
}

/** The dedicated station of this machine. */
export class Station {
  /** The one-time pairing codes. */
  readonly pairing: PairingBook
  private readonly deps: StationDeps
  private readonly power: PowerKeeper
  private on = true
  private paired = false

  /** @param deps - Machine readings and the two books. */
  constructor(deps: StationDeps = {}) {
    this.deps = deps
    this.pairing = deps.pairing ?? new PairingBook()
    this.power = deps.power ?? new PowerKeeper()
    this.on = deps.active?.() ?? true
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
  redeem(code: string): 'ok' | 'invalido' | 'expirado' | 'usado' {
    const result = this.pairing.redeem(code)
    if (result === 'ok') this.paired = true
    return result
  }

  /** Turn the station on or off (off stops accepting turns and lets Windows sleep). */
  setRunning(on: boolean): void {
    this.on = on
    if (!on) this.power.release()
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
    if (result.ok) this.power.hold()
    return result
  }

  /**
   * A turn finished: when nothing is left, Windows may sleep again.
   * @param remaining - Turns still running or queued.
   */
  noteTurnEnded(remaining: number): void {
    if (remaining <= 0) this.power.release()
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
      tailscale: await (this.deps.tailscale ?? readTailscale)(),
    }
  }
}
