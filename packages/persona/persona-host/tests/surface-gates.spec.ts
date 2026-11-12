import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { expect, it } from 'vitest'
import { RemoteFault, RemoteGuard } from '../src/remote-guard.ts'
import { FEATURE_OFF_REASON, FEATURE_OFF_TEXT, SURFACE_NAMES, SURFACES, SURFACE_REMOTES, resolveSurfaces, surfaceOfRemote, surfaceOn, surfaceRefuses, surfacesBootLine, type Surface } from '../src/surface-gates.ts'
import { bindHostFile } from './host-harness.ts'

/**
 * D-113 (Tally): the five surfaces under construction are OFF in the product and ON under Vitest; Config > env > default; `PERSONA_HOST_FLAGS=production` (or `Config.flagDefaults`) makes the default OFF
 * inside Vitest; `PERSONA_SURFACE_<NAME>=1` turns one on. The environment is injected (nothing here reads or sets the real one).
 */
const ALL = ['invite', 'station', 'channels', 'skillImport', 'sharedBrowser'] as const

it('the names and the variables are the ones D-113 decided', () => {
  expect(SURFACE_NAMES).toEqual(ALL)
  expect(SURFACES).toEqual({
    invite: 'PERSONA_SURFACE_INVITE',
    station: 'PERSONA_SURFACE_STATION',
    channels: 'PERSONA_SURFACE_CHANNELS',
    skillImport: 'PERSONA_SURFACE_SKILL_IMPORT',
    sharedBrowser: 'PERSONA_SURFACE_SHARED_BROWSER',
  })
  expect(FEATURE_OFF_REASON).toBe('feature-off')
  expect(FEATURE_OFF_TEXT).toBe('Isto ainda não está disponível nesta versão.')
})

it('the product default: invite, station, channels and skillImport are OFF; sharedBrowser is ON (Keel 09:21: its P0-01 closed)', () => {
  const view = resolveSurfaces({}, {})
  expect(view.defaults).toBe('production')
  for (const name of ALL) expect(surfaceOn(view, name), name).toBe(name === 'sharedBrowser')
  for (const off of ['0', 'false', 'off', 'no']) expect(resolveSurfaces({}, { PERSONA_SURFACE_SHARED_BROWSER: off }).sharedBrowser, off).toBe(false)
  expect(resolveSurfaces({ surfaces: { sharedBrowser: false } }, {}).sharedBrowser, 'Config false').toBe(false)
  expect(resolveSurfaces({ surfaces: { sharedBrowser: false } }, { PERSONA_SURFACE_SHARED_BROWSER: '1' }).sharedBrowser, 'Config beats env').toBe(false)
})

it('under Vitest the default is ON (the suites keep proving the code)', () => {
  const view = resolveSurfaces({}, { VITEST: 'true' })
  expect(view.defaults).toBe('test')
  for (const name of ALL) expect(surfaceOn(view, name), name).toBe(true)
})

it('PERSONA_HOST_FLAGS=production (env) or Config.flagDefaults proves the product default inside Vitest: the four under construction OFF, sharedBrowser ON', () => {
  for (const view of [resolveSurfaces({}, { VITEST: 'true', PERSONA_HOST_FLAGS: 'production' }), resolveSurfaces({ flagDefaults: 'production' }, { VITEST: 'true' })]) {
    expect(view.defaults).toBe('production')
    for (const name of ALL) expect(surfaceOn(view, name), name).toBe(name === 'sharedBrowser')
  }
})

it('PERSONA_SURFACE_<NAME>=1 turns ONE on and leaves the others as the default; =0 (false/off/no) turns one off under Vitest; any other value keeps the default', () => {
  const on = resolveSurfaces({}, { PERSONA_SURFACE_STATION: '1' })
  expect(ALL.filter(name => on[name])).toEqual(['station', 'sharedBrowser'])
  const production = resolveSurfaces({}, { VITEST: 'true', PERSONA_HOST_FLAGS: 'production', PERSONA_SURFACE_SKILL_IMPORT: '1' })
  expect(ALL.filter(name => production[name])).toEqual(['skillImport', 'sharedBrowser'])
  for (const off of ['0', 'false', 'OFF', ' no ']) {
    const view = resolveSurfaces({}, { VITEST: 'true', PERSONA_SURFACE_INVITE: off })
    expect(view.invite, off).toBe(false)
    expect(view.station, off).toBe(true)
  }
  expect(resolveSurfaces({}, { VITEST: 'true', PERSONA_SURFACE_CHANNELS: 'maybe' }).channels).toBe(true)
  expect(resolveSurfaces({}, { PERSONA_SURFACE_CHANNELS: 'maybe' }).channels).toBe(false)
})

it('the order is Config.surfaces[name] > env > default', () => {
  const view = resolveSurfaces({ surfaces: { station: false, sharedBrowser: true } }, { VITEST: 'true', PERSONA_SURFACE_STATION: '1', PERSONA_SURFACE_SHARED_BROWSER: '0' })
  expect(view.station, 'Config false beats env 1').toBe(false)
  expect(view.sharedBrowser, 'Config true beats env 0').toBe(true)
  expect(view.invite, 'the others keep the default').toBe(true)
  const product = resolveSurfaces({ surfaces: { invite: true } }, {})
  expect(ALL.filter(name => product[name])).toEqual(['invite', 'sharedBrowser'])
})

it('the boot line names the five and the default, with no secret', () => {
  expect(surfacesBootLine(resolveSurfaces({}, {}))).toBe('[persona-host] surfaces invite=0 station=0 channels=0 skillImport=0 sharedBrowser=1 defaults=production')
  expect(surfacesBootLine(resolveSurfaces({}, { VITEST: 'true', PERSONA_SURFACE_STATION: '0' }))).toBe('[persona-host] surfaces invite=1 station=0 channels=1 skillImport=1 sharedBrowser=1 defaults=test')
})

const { host } = bindHostFile()

it('the host keeps what it resolved at boot as `this.surfaces` (ON here: the suites run under Vitest)', () => {
  const h = host()
  expect(h.surfaces.defaults).toBe('test')
  for (const name of ALL) expect(surfaceOn(h.surfaces, name), name).toBe(true)
})

/* ---- the refusal in the funnel (D-113) ---- */


it('the table is the one the owners approved, by surface', () => {
  const by = (surface: string): string[] => Object.entries(SURFACE_REMOTES).filter(([, value]) => value === surface).map(([name]) => name).sort()
  expect(by('station')).toEqual(['issueStationCode', 'pairStation', 'setStationRunning', 'stationView'])
  expect(by('skillImport')).toEqual(['approveSkillUpdate', 'importSkills', 'previewSkillImport', 'refreshSkill'])
  expect(by('channels')).toEqual([
    'ackChannelRead', 'getChannelHeader', 'getChannelHere', 'getChannelLayout', 'getChannelSuggestions', 'getChannelUnread', 'getEquipeLayout', 'getMessageOrigins', 'listMentionOptions', 'updateChannelLayout',
  ]) // + the Casa da Equipe (12/11, Keel's order 09:41: the host of the Casa behind `channels`)
  expect(by('invite')).toEqual([
    'acceptInvite', 'cancelJoinRequest', 'connectRemoteTeam', 'createInviteLink', 'decideJoinRequest', 'getJoinStatus', 'getPersonaSheetStatus', 'getPresence', 'getRemoteTeamAvailability',
    'getRemoteTeamState', 'joinTeamFromLink', 'listJoinRequests', 'listRemoteMembers', 'previewInvite', 'reviewPersonaSheet', 'revokeMember', 'syncRemoteTeam',
  ])
  expect(by('sharedBrowser')).toEqual(['browserView','closeBrowserProfile','createBrowserProfile','grantBrowserProfile','releaseBrowserProfile','renameBrowserProfile','revokeBrowserProfile','takeBrowserProfile'])
  expect(surfaceOfRemote('pairStation')).toBe('station')
  expect(surfaceOfRemote('listTasks')).toBeUndefined()
  expect(surfaceOfRemote('toString'), 'a name of Object.prototype is no Remote of a surface').toBeUndefined()
})

it('an OFF surface refuses its calls in the funnel with `feature-off` and the person\'s sentence; an ON one and a core call pass', () => {
  const off = resolveSurfaces({}, {})
  const guard = new RemoteGuard({ surfaceOff: method => surfaceRefuses(off, method) })
  let refusal: unknown
  try { guard.admit('pairStation', [{ workspaceId: 'ws', projectId: 'pp', code: 'AAAA-BBBB' }]) } catch (error) { refusal = error }
  expect(refusal).toBeInstanceOf(RemoteFault)
  expect(refusal).toMatchObject({ code: 'forbidden', message: 'Isto ainda não está disponível nesta versão.', details: { reason: 'feature-off' } })
  expect(() => guard.admit('listTasks', [{ workspaceId: 'ws', projectId: 'pp' }]), 'a core call is never refused by a surface').not.toThrow()
  const on = resolveSurfaces({ surfaces: { station: true } }, {})
  const open = new RemoteGuard({ surfaceOff: method => surfaceRefuses(on, method) })
  expect(() => open.admit('pairStation', [{ workspaceId: 'ws', projectId: 'pp', code: 'AAAA-BBBB' }])).not.toThrow()
  expect(() => open.admit('importSkills', [{ workspaceId: 'ws', projectId: 'pp' }]), 'the other surfaces stay OFF').toThrow()
})

it('the refusal comes BEFORE the rest of the funnel: not even a payload too big or a rate limit is answered first (nothing runs, nothing is counted)', () => {
  const off = resolveSurfaces({}, {})
  const guard = new RemoteGuard({ surfaceOff: method => surfaceRefuses(off, method), writeRateMax: 1 })
  const huge = [{ workspaceId: 'ws', projectId: 'pp', pad: 'x'.repeat(300_000) }]
  for (let i = 0; i < 3; i += 1) {
    expect(() => guard.admit('setStationRunning', huge)).toThrow(/Isto ainda não está disponível/u)
  }
})

it('DRIFT CHECK: every Remote of a surface is in the table, and every name of the table is a real Remote', () => {
  const h = host()
  const remotes = remoteMethods(h).map(item => item.method)
  const missing = SURFACE_REMOTES
  const stale = Object.keys(missing).filter(name => !remotes.includes(name))
  expect(stale, 'in the table but not a Remote: a rename left the surface open').toEqual([])
  // What each surface's names look like. The invites of the LOCAL branch stay on (only their remote branch is gated, inside).
  const looks: ReadonlyArray<readonly [Surface, RegExp]> = [
    ['invite', /Invite|RemoteTeam|RemoteMember|JoinRequest|JoinStatus|JoinTeam|Presence|PersonaSheet|revokeMember/u],
    ['station', /Station/u],
    ['skillImport', /SkillImport|^importSkills$|^refreshSkill$|^approveSkillUpdate$/u],
    ['channels', /ChannelLayout|EquipeLayout|ChannelHeader|MentionOptions/u],
    ['sharedBrowser', /BrowserProfile|^browserView$/u],
  ]
  const localInvites = new Set(['issueInvite', 'listInvites', 'redeemInvite', 'revokeInvite'])
  const loose = remotes.flatMap(name => looks
    .filter(([surface, pattern]) => pattern.test(name) && !localInvites.has(name) && surfaceOfRemote(name) !== surface)
    .map(([surface]) => `${name} looks like ${surface} and is not in the table`))
  expect(loose).toEqual([])
})

it('the host in the PRODUCT default refuses a surface call before anything happens, and keeps answering the core', () => {
  const h = host()
  const before = h.surfaces
  Object.assign(h, { surfaces: resolveSurfaces({}, {}) })
  try {
    for (const call of [() => h.pairStation({ workspaceId: 'ws', projectId: 'pp', code: 'AAAA-BBBB' }), () => h.stationView({ workspaceId: 'ws', projectId: 'pp' }), () => h.previewSkillImport({ workspaceId: 'ws', projectId: 'pp', url: 'https://example.com/x' } as never)]) {
      expect(call).toThrow(/Isto ainda não está disponível/u)
    }
    expect(() => h.ping()).not.toThrow()
  } finally {
    Object.assign(h, { surfaces: before })
  }
})
