/**
 * D-113: a surface that is under construction is OFF in the product, and "off" means OFF — the remote-team host does not touch the network, does not poll, does not open the
 * live socket and does not resume a team stored by an earlier build, and the persona-sheet guard enforces nothing. A team state is seeded as the previous build would have left
 * it; the network is a spy. The same seed with the surface ON proves the spy sees what the host would have done.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openRemoteTeamHarness, type RemoteTeamHarness } from './remote-team-harness.ts'

const scope = { workspaceId: 'ws', projectId: 'pp' }
const STORED = {
  workspaceId: 'ws', projectId: 'pp', edgeUrl: 'http://127.0.0.1:9', actorId: 'ana', role: 'owner', channelIds: ['geral'], status: 'connected', cursors: {}, errorCode: '',
}
let desk: RemoteTeamHarness | undefined
let network: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.stubEnv('PERSONA_VAULT_TEST_CIPHER', '1')
  network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in this spec'))
})
afterEach(async () => {
  await desk?.dispose()
  desk = undefined
  network.mockRestore()
  vi.unstubAllEnvs()
})

/** A host whose remote-team host has the surface switch set by the spec and a team stored by an earlier build. */
function open(on: boolean, pollMs: number): RemoteTeamHarness {
  const harness = openRemoteTeamHarness('', pollMs, true)
  desk = harness
  const { h } = harness
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  ;(h.remoteTeam.options as { enabled?: () => boolean }).enabled = () => on
  h.remoteTeam.options.screens.put('pp', 'remote_team', 'connection', STORED)
  return harness
}

const timer = (h: RemoteTeamHarness): unknown => Reflect.get(h.h.remoteTeam, 'timer')
const lives = (h: RemoteTeamHarness): number => (Reflect.get(h.h.remoteTeam, 'lives') as Map<string, unknown>).size

it('with the surface ON the host resumes the stored team, polls and tries the network (the control: the spy sees it)', async () => {
  const harness = open(true, 20)
  harness.h.remoteTeam.resume(scope)
  expect(timer(harness)).toBeDefined() // the poll is armed
  await vi.waitFor(() => { expect(network).toHaveBeenCalled() }, { timeout: 2000 })
})

it('with the surface OFF nothing resumes, nothing polls, nothing opens a socket and not one byte goes to the network', async () => {
  const harness = open(false, 20)
  harness.h.remoteTeam.resume(scope) // what the boot does for every stored team
  expect(timer(harness)).toBeUndefined() // no poll
  expect(lives(harness)).toBe(0) // no live socket
  expect(await harness.h.remoteTeam.sync(scope)).toBeUndefined() // the exchange does not even start
  await new Promise(resolve => setTimeout(resolve, 200)) // several poll periods
  expect(network).not.toHaveBeenCalled()
})

it('with the surface OFF the persona-sheet guard enforces nothing: a team stored by an earlier build is not a team (solo)', async () => {
  const harness = open(false, 0)
  // the guard asks the remote-team host whether this project is a team it owns: with the surface off the answer is "no team"
  expect(harness.h.personaSheets.deps.team('ws', 'pp')).toBeUndefined()
  ;(harness.h.remoteTeam.options as { enabled?: () => boolean }).enabled = () => true
  expect(harness.h.personaSheets.deps.team('ws', 'pp')).toEqual({ actorId: 'ana' }) // the control: ON, the same stored team is enforced
})
