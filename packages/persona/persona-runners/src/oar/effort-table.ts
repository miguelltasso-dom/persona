/**
 * EFF-1: the STATIC table of reasoning-effort levels per engine, for when the engine does not answer its model list (the screen then marks the origin as `static`, never as the engine's own word).
 * Read from the CLIs themselves, zero model (05/11): Claude takes `low | medium | high | xhigh | max` (`--effort`, proven on 2.1.318); Codex 0.166.0 lists `low | medium | high | xhigh | max | ultra`
 * across its models (some models stop earlier: `gpt-5.5` has no `max`/`ultra`; the engine's own per-model menu, when it answers, always wins over this table). The levels go to the CLI as the
 * persona chose them; an engine that refuses a level for a model is handled by the adapter (the call runs at the engine's default and the usage says `effortDropped`).
 */

/** Where a menu of levels came from. */
export type EffortOrigin = 'engine' | 'static'

/** The levels each engine accepts, widest to the union over its models. */
export const STATIC_EFFORT_LEVELS: Readonly<Record<'claude' | 'codex', readonly string[]>> = {
  claude: ['low', 'medium', 'high', 'xhigh', 'max'],
  codex: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
}

/**
 * The levels to offer for an engine.
 * @param cli - Engine id (anything but `claude`/`codex` has no effort menu).
 * @param engineLevels - What the engine said for the chosen model (`effortLevels` of its model list), if it answered.
 * @returns The levels and where they came from; `undefined` when the engine has no effort choice.
 */
export function effortLevelsFor(cli: string, engineLevels?: readonly string[]): { readonly levels: readonly string[]; readonly origin: EffortOrigin } | undefined {
  if (engineLevels !== undefined && engineLevels.length > 0) return { levels: engineLevels, origin: 'engine' }
  if (cli !== 'claude' && cli !== 'codex') return undefined
  return { levels: STATIC_EFFORT_LEVELS[cli], origin: 'static' }
}
