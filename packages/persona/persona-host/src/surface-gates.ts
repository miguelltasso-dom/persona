/**
 * D-113 (Atlas/Keel, 12/11): what is still being built is OFF in the product's host. Five surfaces carry a key in the HOST, resolved once at boot like `flags.ts`, with the inverse default:
 *   OFF in the installed app, ON under Vitest (the suites keep proving the code). Order of authority for each surface:
 *   1. the plugin `Config.surfaces[name]` (`true` or `false`);
 *   2. the environment (`PERSONA_SURFACE_<NAME>=1` turns it on, `=0` — also `false`/`off`/`no` — off; any other value keeps the default);
 *   3. the default: `production` = OFF, `test` (Vitest) = ON. `PERSONA_HOST_FLAGS=production` (or `Config.flagDefaults: 'production'`) makes the default OFF even under Vitest, to prove the product's default.
 * EXCEPTION (Keel 09:21): `sharedBrowser` is ON by default in the product too (its P0-01 closed); `PERSONA_SURFACE_SHARED_BROWSER=0` or `Config.surfaces.sharedBrowser = false` turns it off.
 * An OFF surface is OFF for real: the host REFUSES its calls (`feature-off`, in the funnel of the ACL: see `RemoteGuard`), opens no socket, polls nothing, holds Windows awake for nothing and applies
 * no channel fence. The owners of each surface consume it as `if (this.surfaces.station)`.
 */

import { flagDefaultsOf, type FlagDefaults } from './flags.ts'

/** The surfaces under construction, with the variable that turns each one on. */
export const SURFACES = {
  /** Item 23: invites, entry approval, presence, remote sync / WebSocket. */
  invite: 'PERSONA_SURFACE_INVITE',
  /** Item 24: the dedicated station, pairing, wake-lock, admission. */
  station: 'PERSONA_SURFACE_STATION',
  /** Item 22: teams, categories, the channel fence, `@equipe` by sector. */
  channels: 'PERSONA_SURFACE_CHANNELS',
  /** Item 26.10: preview and import a skill from a repository. */
  skillImport: 'PERSONA_SURFACE_SKILL_IMPORT',
  /** Item 17 shared between personas: ON by default in the product since its P0-01 closed (the variable turns it OFF with `0`). */
  sharedBrowser: 'PERSONA_SURFACE_SHARED_BROWSER',
} as const

export type Surface = keyof typeof SURFACES

/** Every surface name, in a fixed order (the boot line and the drift check read it). */
export const SURFACE_NAMES = Object.keys(SURFACES) as readonly Surface[]

/** What the host resolved at boot: one switch per surface and the default that decided the ones nobody set. */
export interface SurfacesView {
  readonly invite: boolean
  readonly station: boolean
  readonly channels: boolean
  readonly skillImport: boolean
  readonly sharedBrowser: boolean
  /** Which default decided the ones nobody set: `production` (the installed app: OFF) or `test` (Vitest, unless overridden: ON). */
  readonly defaults: FlagDefaults
}

/** The stable id the client keys on (`RemoteFault.details.reason`), never a sentence. */
export const FEATURE_OFF_REASON = 'feature-off' as const

/** The sentence a person reads when they reach an OFF surface. */
export const FEATURE_OFF_TEXT = 'Isto ainda não está disponível nesta versão.'

const OFF = new Set(['0', 'false', 'off', 'no'])

type Env = Readonly<Record<string, string | undefined>>

/**
 * Resolve the five surfaces once.
 * @param config - The plugin `Config` slice that names them (`surfaces`) and `flagDefaults: 'production'`.
 * @param env - The environment (tests inject one).
 * @returns The resolved switches and the default that applied.
 */
export function resolveSurfaces(
  config: { readonly surfaces?: Partial<Record<Surface, boolean>>; readonly flagDefaults?: 'production' },
  env: Env = process.env,
): SurfacesView {
  const defaults = flagDefaultsOf(config.flagDefaults, env)
  const one = (name: Surface): boolean => {
    const configured = config.surfaces?.[name]
    if (configured !== undefined) return configured
    const raw = (env[SURFACES[name]] ?? '').trim().toLowerCase()
    if (OFF.has(raw)) return false
    if (raw === '1') return true
    if (name === 'sharedBrowser') return true // Keel 09:21: ON in the product (P0-01 closed); only an explicit 0 / Config false turns it off
    return defaults === 'test'
  }
  return {
    invite: one('invite'),
    station: one('station'),
    channels: one('channels'),
    skillImport: one('skillImport'),
    sharedBrowser: one('sharedBrowser'),
    defaults,
  }
}

/**
 * @param view - What the host resolved at boot.
 * @param name - Which surface.
 * @returns Whether the surface is ON.
 */
export function surfaceOn(view: SurfacesView, name: Surface): boolean {
  return view[name]
}

/**
 * The Remote calls each surface owns (D-113), approved by their owners. An OFF surface REFUSES these in the funnel of the ACL (`RemoteGuard.admit`) before anything runs. `issueInvite`, `listInvites`,
 * `redeemInvite` and `revokeInvite` are NOT here: only their REMOTE branch belongs to `invite` (the host refuses it inside, `requireSurface`); the local invite stays.
 */
export const SURFACE_REMOTES: Readonly<Record<string, Surface>> = {
  // invite (item 23, Bolt)
  connectRemoteTeam: 'invite', acceptInvite: 'invite', joinTeamFromLink: 'invite', previewInvite: 'invite', createInviteLink: 'invite',
  listJoinRequests: 'invite', decideJoinRequest: 'invite', getJoinStatus: 'invite', cancelJoinRequest: 'invite', getPresence: 'invite',
  listRemoteMembers: 'invite', revokeMember: 'invite', syncRemoteTeam: 'invite', getRemoteTeamState: 'invite', getRemoteTeamAvailability: 'invite',
  getPersonaSheetStatus: 'invite', reviewPersonaSheet: 'invite',
  // channels (item 22, Flint)
  getChannelLayout: 'channels', getChannelHeader: 'channels', getEquipeLayout: 'channels', updateChannelLayout: 'channels', listMentionOptions: 'channels',
  // skillImport (item 26.10, Flint)
  previewSkillImport: 'skillImport', importSkills: 'skillImport', refreshSkill: 'skillImport', approveSkillUpdate: 'skillImport',
  // station (item 24, Prism)
  stationView: 'station', issueStationCode: 'station', pairStation: 'station', setStationRunning: 'station',
  // sharedBrowser (item 17, Forge): ON by default; off = refused here
  browserView: 'sharedBrowser', createBrowserProfile: 'sharedBrowser', renameBrowserProfile: 'sharedBrowser', grantBrowserProfile: 'sharedBrowser', revokeBrowserProfile: 'sharedBrowser', takeBrowserProfile: 'sharedBrowser', releaseBrowserProfile: 'sharedBrowser', closeBrowserProfile: 'sharedBrowser',
}

/**
 * @param method - A Remote name.
 * @returns The surface that owns it, or undefined when it belongs to none.
 */
export function surfaceOfRemote(method: string): Surface | undefined {
  return Object.hasOwn(SURFACE_REMOTES, method) ? SURFACE_REMOTES[method] : undefined
}

/**
 * @param view - What the host resolved at boot.
 * @param method - A Remote name.
 * @returns Whether the call must be refused: it belongs to a surface that is OFF.
 */
export function surfaceRefuses(view: SurfacesView, method: string): boolean {
  const surface = surfaceOfRemote(method)
  return surface !== undefined && !view[surface]
}

/** The boot line the installed app writes to its log: the five surfaces as they resolved, so a verifier can read them without any env. */
export function surfacesBootLine(view: SurfacesView): string {
  const bit = (on: boolean): string => on ? '1' : '0'
  return `[persona-host] surfaces ${SURFACE_NAMES.map(name => `${name}=${bit(view[name])}`).join(' ')} defaults=${view.defaults}`
}
