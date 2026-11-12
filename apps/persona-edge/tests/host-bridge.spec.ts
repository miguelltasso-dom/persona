/** Real local edge + two SQLite-backed host services; no model calls. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { unstable_dev, type Unstable_DevWorker } from 'wrangler'
import type PersonaHost from '../../../packages/persona/persona-host/src/index.ts'
import { openRemoteTeamHarness, type RemoteTeamHarness } from '../../../packages/persona/persona-host/tests/remote-team-harness.ts'
import { RemoteTeamHost } from '../../../packages/persona/persona-host/src/remote-team.ts'
import { deviceOf } from './host-device.ts'
import { newDevice, signedAs } from './signed-fetch.ts'

let edge: Unstable_DevWorker | undefined
const profiles: RemoteTeamHarness[] = []
const home = mkdtempSync(join(tmpdir(), 'persona-sync-bridge-'))
const scope = { workspaceId: 'bridge-workspace', projectId: 'shared' }
const GENERAL = 'geral:shared'
const STREAM = `project:shared:channel:${GENERAL}`

beforeAll(async () => {
  vi.stubEnv('PERSONA_VAULT_TEST_CIPHER', '1')
  vi.stubEnv('WRANGLER_SEND_METRICS', 'false')
  edge = await unstable_dev(fileURLToPath(new URL('../src/index.ts', import.meta.url)), {
    config: fileURLToPath(new URL('../wrangler.toml', import.meta.url)), persist: false, local: true, logLevel: 'error',
    experimental: { disableExperimentalWarning: true, forceLocal: true, disableDevRegistry: true, watch: false },
  })
}, 90_000)

afterAll(async () => {
  for (const profile of profiles) await profile.dispose()
  await edge?.stop()
  rmSync(home, { recursive: true, force: true })
  vi.unstubAllEnvs()
}, 60_000)

function host(actorId: string): RemoteTeamHarness {
  const profile = openRemoteTeamHarness(join(home, `${actorId}.db`))
  profiles.push(profile)
  const { h } = profile
  h.createWorkspace({ id: scope.workspaceId, name: actorId, personalProjectId: `personal-${actorId}` })
  h.createProject({ id: scope.projectId, workspaceId: scope.workspaceId, name: 'Compartilhado', description: '' })
  h.createMember({ ...scope, id: actorId, displayName: actorId, handle: actorId, role: 'owner' })
  h.createChannel({ ...scope, id: 'local', name: 'local', topic: '' })
  return profile
}

function say(h: PersonaHost, id: string, body: string, ownerId: string = GENERAL): void {
  h.postMessage({ ...scope, id, streamKind: 'channel', ownerId, actorId: 'alice', body,
    subjectId: 'sync-proof', occurredAt: new Date().toISOString() })
}

function channel(h: PersonaHost): readonly string[] {
  return h.listMessages({ ...scope, streamKind: 'channel', ownerId: GENERAL, actorId: 'bob', afterSeq: 0, limit: 40 })
    .events.map(event => event.body)
}

it('bridges a newly posted channel message, isolates DM/other channels, resumes cursors and persists revocation', async () => {
  if (edge === undefined) throw new Error('edge-not-started')
  const edgeUrl = `http://${edge.address}:${edge.port}`
  const { h: a, vault } = host('alice')
  const { h: b } = host('bob')
  await a.connectRemoteTeam({ ...scope, edgeUrl, channelIds: [GENERAL] })
  const invite = await a.issueInvite({ ...scope, inviteId: 'invite-bob', token: '', role: 'member' })
  expect(JSON.stringify(vault.vault.list())).not.toContain(invite.token)
  expect(JSON.stringify(a.store.db.prepare('SELECT body FROM screen_doc').all())).not.toContain(invite.token)
  await b.acceptInvite({ ...scope, edgeUrl, token: invite.token })
  expect(b.getRemoteTeamState(scope)?.role).toBe('member')
  // Following the link only ASKED: bob waits (offline, pending) until alice approves, and alice sees the security code to confirm with him.
  expect(b.getRemoteTeamState(scope)).toMatchObject({ status: 'offline', errorCode: 'PENDING_APPROVAL' })
  const waiting = await a.remoteTeam.joinRequests(scope)
  expect(waiting).toEqual([expect.objectContaining({ actorId: 'bob', securityCode: expect.stringMatching(/^[0-9a-f]{4}( [0-9a-f]{4}){4}$/u) })])
  await a.remoteTeam.approveJoinRequest(scope, waiting[0]?.id ?? '')
  const asBob = signedAs(fetch, await deviceOf(b, 'bob'))
  const asAlice = signedAs(fetch, await deviceOf(a, 'alice'))
  expect(await a.listRemoteMembers(scope)).toEqual(expect.arrayContaining([
    expect.objectContaining({ actorId: 'alice', displayName: 'alice', role: 'owner', status: 'active' }),
    expect.objectContaining({ actorId: 'bob', displayName: 'bob', role: 'member', inviteId: invite.id, status: 'active' }),
  ]))
  const deniedMembers = await signedAs(fetch, newDevice('stranger'))(`${edgeUrl}/w/${scope.workspaceId}/members?projectId=shared`)
  expect(deniedMembers.status).toBe(401) // a stranger is not even a member: the hub does not know that key
  const deniedProjectMembers = await asBob(`${edgeUrl}/w/${scope.workspaceId}/members?projectId=not-granted`)
  expect(deniedProjectMembers.status).toBe(403)
  const guestInvite = await a.issueInvite({ ...scope, inviteId: 'guest-proof', token: '', role: 'guest' })
  // The guest asks with a body that CLAIMS owner rights and private projects: the hub ignores every claim, and what the owner approves is only the invite's grant.
  const guestDevice = newDevice('guest-proof')
  const guestAsk = await signedAs(fetch, guestDevice)(`${edgeUrl}/w/${scope.workspaceId}/invites/${guestInvite.token}/request`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actorId: 'guest-proof', displayName: 'Convidada', keys: guestDevice.keys,
      workspaceRole: 'owner', projectIds: ['private-project'], dmIds: ['private-dm'] }),
  })
  expect(guestAsk.status).toBe(200)
  const guestRequest = (await guestAsk.json()) as { request: { id: string } }
  const guest = await a.remoteTeam.approveJoinRequest(scope, guestRequest.request.id)
  expect(guest).toMatchObject({ actor: { workspaceRole: 'guest', projectIds: ['shared'] } })
  expect(JSON.stringify(guest)).not.toContain('private-project')
  expect(JSON.stringify(guest)).not.toContain('private-dm')
  await expect(b.issueInvite({ ...scope, inviteId: 'escalate', token: '', role: 'member' })).rejects.toThrow('forbidden')
  await expect(b.connectRemoteTeam({ ...scope, edgeUrl, channelIds: [GENERAL, 'local'] }))
    .rejects.toThrow('remote-team-owner-required')
  const forbiddenChannel = await asBob(`${edgeUrl}/w/${scope.workspaceId}/sync/after?streamId=project:shared:channel:local`)
  expect(forbiddenChannel.status).toBe(403)
  expect(await forbiddenChannel.json()).toMatchObject({ code: 'CHANNEL_NOT_GRANTED' })

  say(a, 'new-a', 'Mensagem NOVA só do A')
  say(a, 'local-only', 'Canal não autorizado', 'local')
  a.createMember({ ...scope, id: 'local-friend', displayName: 'Só local', handle: 'local', role: 'member' })
  a.createDm({ ...scope, id: 'dm-private', participantA: 'alice', participantB: 'local-friend' })
  a.postMessage({ ...scope, id: 'dm-secret', streamKind: 'dm', ownerId: 'dm-private', actorId: 'alice',
    body: 'DM nunca sai', subjectId: 'private', occurredAt: new Date().toISOString() })
  await a.syncRemoteTeam(scope)
  expect(a.getRemoteTeamState(scope)).toMatchObject({ behindBy: 0 })
  expect(a.getRemoteTeamState(scope)?.syncedAt).toMatch(/^\d{4}-/u)
  const beforeEngine = b.orchestration.runtimes.size
  await b.syncRemoteTeam(scope)
  expect(channel(b)).toContain('Mensagem NOVA só do A')
  expect(b.events.has('local-only')).toBe(false)
  expect(b.events.has('dm-secret')).toBe(false)
  expect(b.orchestration.runtimes.size).toBe(beforeEngine)
  expect(b.listTasks(scope)).toEqual([])
  await b.syncRemoteTeam(scope)
  expect(channel(b).filter(body => body === 'Mensagem NOVA só do A')).toHaveLength(1)
  // bob holds everything the edge holds (alice's message and the line the coordination wrote beside it): the exact count is not what this proves
  const headOf = async (): Promise<number> => ((await (await asAlice(`${edgeUrl}/w/${scope.workspaceId}/sync/head?streamId=${encodeURIComponent(STREAM)}`)).json()) as { head: number }).head
  const firstCursor = b.getRemoteTeamState(scope)?.cursors[STREAM]
  expect(firstCursor).toBe(await headOf())
  expect(firstCursor).toBeGreaterThanOrEqual(1)

  say(a, 'offline-message', 'A publicou enquanto B estava fora')
  await a.syncRemoteTeam(scope)
  await b.remoteTeam.dispose()
  const restored = new RemoteTeamHost(b.remoteTeam.options)
  restored.resume(scope)
  try {
    await restored.sync(scope)
    expect(channel(b)).toContain('A publicou enquanto B estava fora')
    expect(restored.state(scope)?.cursors[STREAM]).toBe(await headOf())
    expect(restored.state(scope)?.cursors[STREAM]).toBeGreaterThan(firstCursor ?? 0)
    await a.revokeMember({ ...scope, inviteId: invite.id })
    expect((await a.listRemoteMembers(scope)).find(row => row.actorId === 'bob')?.status).toBe('revoked')
    const deniedRoster = await asBob(`${edgeUrl}/w/${scope.workspaceId}/members?projectId=shared`)
    expect(deniedRoster.status).toBe(403)
    say(a, 'after-revoke', 'B não pode receber esta')
    await a.syncRemoteTeam(scope)
    await restored.sync(scope)
    expect(restored.state(scope)?.status).toBe('revoked')
    expect(channel(b)).not.toContain('B não pode receber esta')
    const revoked = restored.state(scope)
    await restored.sync(scope)
    expect(restored.state(scope)).toEqual(revoked)
  } finally {
    await restored.dispose()
  }
  const remote = await asAlice(`${edgeUrl}/w/${scope.workspaceId}/sync/after?streamId=${encodeURIComponent(STREAM)}&afterSeq=0`)
  const remoteBody = await remote.text()
  expect(remoteBody).not.toContain('DM nunca sai')
  expect(remoteBody).not.toContain('Canal não autorizado')
}, 90_000)
