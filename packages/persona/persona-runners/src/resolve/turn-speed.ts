/**
 * Item 9c "fast só em conversa ao vivo" (Tally, 11/11).
 *
 * A faster tier of the same model exists on some CLIs (Codex on a ChatGPT sign-in) and it spends the plan's window at a multiple of the normal rate (the vendor's own
 * figure: about 2.5x). That is worth it when a person is WAITING for the answer, never in work nobody is watching (a Task, a review, a routine, a turn that moved to the
 * background): there it only burns the window the person pays for. So the rule is a function of what the turn is, not of what the persona prefers:
 *
 *   fast  <=>  the persona asked for it AND the engine has it (Codex) AND the turn is a live conversation (`talk`) AND it is not background work AND the sign-in is a subscription.
 *
 * A persona that never asked gets NOTHING added (no argument, no behaviour change). A persona that asked but whose turn does not qualify gets the explicit standard setting:
 * a Codex thread keeps its tier across turns, so leaving the option out would let a background Task inherit the fast tier of the conversation it resumed.
 *
 * Pure, no I/O, no model. Default OFF: nothing in the product sets `requested` yet; this is the guard it will pass through. The runner pool already separates a
 * `talk` session from a `task` one (the purpose is in its key), so a session opened at one speed is never handed to a turn of the other.
 */

export type TurnSpeed = 'standard' | 'fast'

/** The turns that wait for a person (a live answer). Everything else, Tasks included, is work nobody waits on. */
const LIVE_PURPOSES: ReadonlySet<string> = new Set(['talk'])

export interface TurnSpeedInput {
  /** The engine: only `codex` has a faster tier today. */
  readonly cli: string
  /** What the persona asked for (`undefined` = never asked). */
  readonly requested: TurnSpeed | undefined
  /** The runner purpose (`talk` = live conversation; `task` and anything else = work). */
  readonly purpose: string
  /** The turn belongs to background work (a routine, a Task that moved to the background, a mission). */
  readonly background?: boolean
  /** The sign-in: a faster tier is a subscription feature; with a key the product never asks for it. Default `subscription`. */
  readonly account?: 'subscription' | 'api'
}

/** @returns The speed THIS turn may run at. */
export function speedForTurn(input: TurnSpeedInput): TurnSpeed {
  if (input.requested !== 'fast') return 'standard'
  if (input.cli !== 'codex') return 'standard'
  if (input.account === 'api') return 'standard'
  if (input.background === true) return 'standard'
  return LIVE_PURPOSES.has(input.purpose) ? 'fast' : 'standard'
}

/**
 * The speed to write into the spec of a runner of this purpose: `undefined` when the persona never asked (nothing is carried, nothing changes), else what the turn may use.
 * @param spec - The persona's engine choice (`speed` is what she asked for).
 * @param purpose - The runner purpose the spec is derived for.
 */
export function decidedSpeed(spec: { readonly cli: string; readonly speed?: TurnSpeed | undefined }, purpose: string): TurnSpeed | undefined {
  if (spec.speed !== 'fast' || spec.cli !== 'codex') return undefined
  return speedForTurn({ cli: spec.cli, requested: spec.speed, purpose })
}

/**
 * The launch arguments that put a session at an already DECIDED speed.
 * @param cli - The engine.
 * @param decided - {@link decidedSpeed}: `undefined` = the persona never asked (no argument at all).
 */
export function speedArgsOf(cli: string, decided: TurnSpeed | undefined): string[] {
  if (cli !== 'codex' || decided === undefined) return []
  return decided === 'fast'
    ? ['-c', 'service_tier="fast"', '-c', 'features.fast_mode=true']
    : ['-c', 'features.fast_mode=false']
}

/**
 * Decide and translate in one step (what a caller with the raw facts uses).
 * @param input - The facts of the turn.
 * @returns `[]` when the persona never asked or the engine has no faster tier; otherwise the explicit tier (fast or standard).
 */
export function speedLaunchArgs(input: TurnSpeedInput): string[] {
  if (input.requested !== 'fast') return []
  return speedArgsOf(input.cli, speedForTurn(input))
}
