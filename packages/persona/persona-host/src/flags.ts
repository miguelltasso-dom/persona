/**
 * TEAM-15 (Keel, D-090): the v1.1 behaviors of the host are ON in the real app. A switch is the person's (or the build's) to turn OFF, never a
 * thing a tester has to remember to turn on. Order of authority for each switch:
 *   1. the plugin `Config` when it names the switch (`true` or `false`);
 *   2. the environment (`PERSONA_TEAMWORK=0` turns it off — also `false`/`off`/`no` —, `=1` on; any other value keeps the default);
 *   3. the product default: ON.
 * Exception, in ONE place: under Vitest the default stays OFF (the in-process suites build a bare host and opt in explicitly, exactly like
 * `allowsScriptedReplies` and the in-memory database already depend on `VITEST`). A host process started by a verifier that inherited
 * `VITEST=true` must clear it (it must anyway: `VITEST` also makes the host scripted).
 * Override for suites that must prove the PRODUCTION default inside Vitest (team-day, the V11 gates): `PERSONA_HOST_FLAGS=production` in the
 * environment or `Config.flagDefaults: 'production'` makes the default ON even under `VITEST`. It changes only the default: a `Config` value
 * or a `PERSONA_<FLAG>=0` still wins, so the same suite can prove the opt-out.
 */

/** The v1.1 switches of the host, with the variable that overrides each. */
export const HOST_FLAGS = {
  /** D-090: the personas work as a team (hand work over, help, opinion, review, the morning brief, short titles, function routing). */
  teamwork: 'PERSONA_TEAMWORK',
  /** CV-8: "Toda a equipe", "Quem tiver algo a dizer" and several @menções answered as a block of typed lines. */
  fanout: 'PERSONA_FANOUT',
  /** HT-3: the persona starts the moment the person moves its card to "Fazendo". */
  startOnBoardMove: 'PERSONA_START_ON_BOARD',
  /** HT-0: the product tools (board, sprints, routines, hire, ask) offered to a persona's Task on a CLI. */
  productTools: 'PERSONA_PRODUCT_TOOLS',
} as const

export type HostFlag = keyof typeof HOST_FLAGS

const OFF = new Set(['0', 'false', 'off', 'no'])

/** The variable that asks for the production default inside Vitest. */
export const HOST_FLAGS_DEFAULTS_ENV = 'PERSONA_HOST_FLAGS'

/** Which default applies: the product's (`production`: ON) or the in-process suites' (`test`: OFF, only under Vitest). */
export type FlagDefaults = 'production' | 'test'

type Env = Readonly<Record<string, string | undefined>>

/**
 * @param flagDefaults - `Config.flagDefaults`: `'production'` asks for the product default even under Vitest.
 * @param env - The environment (tests inject one).
 * @returns The default in force: `test` only under Vitest and only when nobody asked for `production`.
 */
export function flagDefaultsOf(flagDefaults: 'production' | undefined, env: Env = process.env): FlagDefaults {
  if (flagDefaults === 'production' || (env[HOST_FLAGS_DEFAULTS_ENV] ?? '').trim().toLowerCase() === 'production') return 'production'
  return env.VITEST === 'true' ? 'test' : 'production'
}

/**
 * @param flag - Which switch.
 * @param configured - What the plugin `Config` says (`undefined` when it does not name the switch).
 * @param env - The environment (tests inject one).
 * @param flagDefaults - `Config.flagDefaults` (see {@link flagDefaultsOf}).
 * @returns Whether the behavior is on.
 */
export function resolveHostFlag(flag: HostFlag, configured: boolean | undefined, env: Env = process.env, flagDefaults?: 'production'): boolean {
  if (configured !== undefined) return configured
  const raw = (env[HOST_FLAGS[flag]] ?? '').trim().toLowerCase()
  if (OFF.has(raw)) return false
  if (raw === '1') return true
  return flagDefaultsOf(flagDefaults, env) === 'production'
}

/** What the host resolved at boot, for the diagnostics and the boot line (no secret in it). */
export interface HostFlagsView {
  readonly teamwork: boolean
  readonly fanout: boolean
  readonly startOnBoardMove: boolean
  readonly productTools: boolean
  /** Which default decided the ones nobody set: `production` (the installed app) or `test` (Vitest, unless overridden). */
  readonly defaults: FlagDefaults
}

/**
 * Resolve the four switches once.
 * @param config - The plugin `Config` slice that names them.
 * @param env - The environment (tests inject one).
 * @returns The resolved switches and the default that applied.
 */
export function resolveHostFlags(
  config: { readonly teamwork?: boolean; readonly fanout?: boolean; readonly startOnBoardMove?: boolean; readonly productTools?: boolean; readonly flagDefaults?: 'production' },
  env: Env = process.env,
): HostFlagsView {
  return {
    teamwork: resolveHostFlag('teamwork', config.teamwork, env, config.flagDefaults),
    fanout: resolveHostFlag('fanout', config.fanout, env, config.flagDefaults),
    startOnBoardMove: resolveHostFlag('startOnBoardMove', config.startOnBoardMove, env, config.flagDefaults),
    productTools: resolveHostFlag('productTools', config.productTools, env, config.flagDefaults),
    defaults: flagDefaultsOf(config.flagDefaults, env),
  }
}

/** The boot line the installed app writes to its log: the four switches as they resolved, so a verifier can read them without any env. */
export function flagsBootLine(view: HostFlagsView): string {
  const bit = (on: boolean): string => on ? '1' : '0'
  return `[persona-host] flags teamwork=${bit(view.teamwork)} fanout=${bit(view.fanout)} startOnBoardMove=${bit(view.startOnBoardMove)} productTools=${bit(view.productTools)} defaults=${view.defaults}`
}
