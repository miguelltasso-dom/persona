/**
 * M9 / D-117 (Bolt): the LIVE VIEW of a persona that works on the PC, as the phone gets it (`followComputerRun`). The producer on the PC (the computer-use loop's observe port) hands over what the persona's
 * window looks like; this module is the part between that and the wire, and it is only RULES:
 *  - the LATEST frame wins: a slow phone never gets a queue of old pictures, it gets the newest when it asks;
 *  - at most 2 frames a second and at most 150 KB a frame (a frame over the cap is asked to shrink, a few times, and dropped if it still does not fit);
 *  - the producer says whether a frame is MASKED (password fields covered BEFORE the picture leaves the PC) and whether ANOTHER window is in front: an unmasked frame never goes out, and a covered window sends
 *    the state `janela-coberta` and NO picture (the phone shows "{Persona} está esperando a janela voltar.");
 *  - who may watch is asked again every second (`canWatch`): the device revoked, the permission gone, the persona no longer in the list of who may ask her — the stream ends at once, fail CLOSED;
 *  - nothing but the allow-listed fields leaves (no window title, no process name): the title lives in the replay, never in the picture.
 */

/** What the producer hands over for one moment of the persona's window. */
export interface Capture {
  /** The picture of the persona's window ONLY (never the whole desktop), already compressed. */
  readonly jpeg: Uint8Array
  readonly w: number
  readonly h: number
  /** The persona's cursor, normalised 0..1 over the picture. */
  readonly cursor?: { readonly x: number; readonly y: number }
  readonly step: number
  readonly of: number
  readonly paused?: 'humano' | 'celular'
  /** Password fields (and windows marked sensitive) are covered in this picture. A picture where this is not `true` never leaves the PC. */
  readonly masked: boolean
  /** Another window is in front of the persona's: there is no picture of hers to show. */
  readonly covered: boolean
  /** Window title and other attribution: kept for the producer's own use, NEVER copied to the wire. */
  readonly title?: string
}

/** What goes to the phone. */
export type WatchItem =
  | { readonly type: 'frame'; readonly seq: number; readonly runId: string; readonly at: number; readonly w: number; readonly h: number; readonly jpeg: Uint8Array; readonly cursor?: { readonly x: number; readonly y: number }; readonly step: number; readonly of: number; readonly paused?: 'humano' | 'celular' }
  | { readonly type: 'state'; readonly status: 'janela-coberta' | 'terminou' | 'sem-acesso' }

/** At most this many frames a second. */
export const WATCH_MAX_FPS = 2
/** At most this many bytes a frame. */
export const WATCH_MAX_BYTES = 150_000
/** How often "who may watch" is asked again (a revocation ends the stream within this). */
export const WATCH_RECHECK_MS = 1_000
/** How many times a frame over the cap is asked to shrink before it is dropped. */
export const WATCH_SHRINK_TRIES = 3

const TIMEOUT = Symbol('timeout')

/** A slot that keeps ONLY the newest value: `put` replaces what nobody took, `take` waits for one. */
export class LatestSlot<T> {
  private value: T | undefined
  private has = false
  private closed = false
  private waiter: ((value: T | undefined) => void) | undefined

  /** @param value - The newest thing; an older one nobody took is gone. */
  put(value: T): void {
    if (this.closed) return
    const waiter = this.waiter
    if (waiter !== undefined) { this.waiter = undefined; waiter(value); return }
    this.value = value
    this.has = true
  }

  /** Nothing more will come (`take` then answers `undefined`). */
  close(): void {
    this.closed = true
    const waiter = this.waiter
    this.waiter = undefined
    waiter?.(undefined)
  }

  /**
   * The newest value nobody took yet, waiting for one if there is none.
   * @param ms - How long to wait at most.
   * @returns The value, `undefined` when the slot is closed, or the timeout marker.
   */
  take(ms: number): Promise<T | undefined | typeof TIMEOUT> {
    if (this.has) { const value = this.value; this.has = false; this.value = undefined; return Promise.resolve(value) }
    if (this.closed) return Promise.resolve(undefined)
    return new Promise((resolve) => {
      const timer = setTimeout(() => { if (this.waiter === deliver) this.waiter = undefined; resolve(TIMEOUT) }, ms)
      const deliver = (value: T | undefined): void => { clearTimeout(timer); resolve(value) }
      this.waiter = deliver
    })
  }
}

/** What watching needs. */
export interface WatchOptions {
  readonly runId: string
  /** The newest-frame slot the producer fills. */
  readonly slot: LatestSlot<Capture>
  /** Whether THIS caller may watch THIS run right now (the device is live, the permission is on, the member is in the list or is the owner). Asked at the start and every second. */
  readonly canWatch: () => boolean
  readonly now?: () => number
  /** Asks the producer for a smaller picture (lower quality or size); returns the new bytes. */
  readonly shrink?: (capture: Capture, attempt: number) => Uint8Array
  /** Called when the stream ends, however it ends (the producer stops capturing). */
  readonly onEnd?: () => void
  readonly maxFps?: number
  readonly maxBytes?: number
  readonly recheckMs?: number
}

/**
 * The stream of the live view for one watcher.
 * @param options - The run, the slot the producer fills and the permission check.
 * @returns The items for the phone: pictures, and the states that explain why there is none.
 */
export async function* watchRun(options: WatchOptions): AsyncGenerator<WatchItem> {
  const now = options.now ?? Date.now
  const minGap = 1_000 / (options.maxFps ?? WATCH_MAX_FPS)
  const maxBytes = options.maxBytes ?? WATCH_MAX_BYTES
  const recheck = options.recheckMs ?? WATCH_RECHECK_MS
  let seq = 0
  let lastSent = Number.NEGATIVE_INFINITY
  let coveredNow = false
  try {
    if (!options.canWatch()) { yield { type: 'state', status: 'sem-acesso' }; return }
    for (;;) {
      const got = await options.slot.take(recheck)
      if (!options.canWatch()) { yield { type: 'state', status: 'sem-acesso' }; return } // asked again every turn of the loop, at least once a second
      if (got === TIMEOUT) continue
      if (got === undefined) { yield { type: 'state', status: 'terminou' }; return }
      if (got.covered) {
        if (!coveredNow) { coveredNow = true; yield { type: 'state', status: 'janela-coberta' } } // said once, and NO picture
        continue
      }
      coveredNow = false
      if (!got.masked) continue // an unmasked picture never leaves the PC
      const at = now()
      if (at - lastSent < minGap) continue
      let jpeg = got.jpeg
      for (let attempt = 1; jpeg.length > maxBytes && attempt <= WATCH_SHRINK_TRIES && options.shrink !== undefined; attempt += 1) jpeg = options.shrink(got, attempt)
      if (jpeg.length > maxBytes) continue
      lastSent = at
      seq += 1
      yield {
        type: 'frame', seq, runId: options.runId, at, w: got.w, h: got.h, jpeg, step: got.step, of: got.of,
        ...(got.cursor === undefined ? {} : { cursor: { x: got.cursor.x, y: got.cursor.y } }), ...(got.paused === undefined ? {} : { paused: got.paused }),
      }
    }
  } finally {
    options.onEnd?.()
  }
}
