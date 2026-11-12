/**
 * Item 17 (colheita): a shared browser profile has ONE driver at a time. The turn is a lease: it lasts two minutes past
 * the last command, ends with the run, and the person's own control is the same turn taken from a persona ("Assumir
 * controle"). A command from a run that no longer holds the turn is not sent — it looks at the page and answers with it,
 * so an approved "send" never lands in another conversation.
 *
 * Pure: the caller passes the clock and keeps the returned turn. No I/O, no storage.
 */

/** Who is driving. */
export interface TurnHolder {
  readonly kind: 'persona' | 'person'
  /** Persona id, or the person's id (`owner` on a single-owner machine). */
  readonly id: string
}

/** The lease. */
export interface Turn {
  readonly holder: TurnHolder
  /** When this holder took (or last renewed) the turn. */
  readonly since: number
  /** When it lapses without another command. */
  readonly until: number
}

/** A persona's turn lapses after this much idle time; the person's too. */
export const TURN_IDLE_MS = 2 * 60_000
/** How long another persona waits before it is told who holds the profile. */
export const TURN_WAIT_MS = 60_000

/** What a caller asks for. */
export interface TakeRequest {
  readonly holder: TurnHolder
  /** A persona needs a grant on this profile; the person always may. */
  readonly granted?: boolean
}

/** The answer to {@link takeTurn}. */
export type TakeOutcome =
  | { readonly ok: true; readonly turn: Turn }
  | { readonly ok: false; readonly reason: 'busy'; readonly holder: TurnHolder; readonly since: number }
  | { readonly ok: false; readonly reason: 'no-grant' }

/**
 * The live holder, or `undefined` when the turn is free or lapsed.
 * @param turn - The stored turn.
 * @param now - Clock.
 */
export function turnHolder(turn: Turn | undefined, now: number): TurnHolder | undefined {
  if (turn === undefined || now >= turn.until) return undefined
  return turn.holder
}

/** True when this holder may send a command right now. */
export function holdsTurn(turn: Turn | undefined, holder: TurnHolder, now: number): boolean {
  const live = turnHolder(turn, now)
  return live !== undefined && live.kind === holder.kind && live.id === holder.id
}

/**
 * Take or renew the turn.
 * - the same holder renews it;
 * - a free (or lapsed) turn is taken;
 * - a persona never takes it from a live holder, and never without a grant;
 * - the person takes it from a persona, never from another person.
 * @param turn - The stored turn.
 * @param request - Who asks and whether it may.
 * @param now - Clock.
 */
export function takeTurn(turn: Turn | undefined, request: TakeRequest, now: number): TakeOutcome {
  const live = turnHolder(turn, now)
  const same = live !== undefined && live.kind === request.holder.kind && live.id === request.holder.id
  if (live !== undefined && !same) {
    if (request.holder.kind === 'persona' || live.kind === 'person') {
      return { ok: false, reason: 'busy', holder: live, since: turn?.since ?? now }
    }
  }
  if (request.holder.kind === 'persona' && request.granted !== true) return { ok: false, reason: 'no-grant' }
  return { ok: true, turn: { holder: request.holder, since: same ? (turn?.since ?? now) : now, until: now + TURN_IDLE_MS } }
}

/**
 * End the turn early (the run finished, or the person pressed "Devolver"). Only the holder can.
 * @param turn - The stored turn.
 * @param holder - Who releases.
 * @param now - Clock.
 * @returns The turn to store (`undefined` = free).
 */
export function releaseTurn(turn: Turn | undefined, holder: TurnHolder, now: number): Turn | undefined {
  return holdsTurn(turn, holder, now) ? undefined : turn
}
