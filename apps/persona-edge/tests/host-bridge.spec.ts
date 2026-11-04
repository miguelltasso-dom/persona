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
  expect(await a.listRemoteMembers(scope)).toEqual(expect.arrayContaining([
    expect.objectContaining({ actorId: 'alice', displayName: 'alice', role: 'owner', status: 'active' }),
    expect.objectContaining({ actorId: 'bob', displayName: 'bob', role: 'member', inviteId: invite.id, status: 'active' }),
  ]))
  const deniedMembers = await fetch(`${edgeUrl}/w/${scope.workspaceId}/members?projectId=shared`, {
    headers: { 'x-persona-actor': 'stranger' },
  })
  expect(deniedMembers.status).toBe(403)
  const deniedProjectMembers = await fetch(`${edgeUrl}/w/${scope.workspaceId}/members?projectId=not-granted`, {
    headers: { 'x-persona-actor': 'bob' },
  })
  expect(deniedProjectMembers.status).toBe(403)
  const guestInvite = await a.issueInvite({ ...scope, inviteId: 'guest-proof', token: '', role: 'guest' })
  const guestRedeem = await fetch(`${edgeUrl}/w/${scope.workspaceId}/invites/redeem`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: guestInvite.token, actor: { kind: 'user', id: 'guest-proof', workspaceId: scope.workspaceId,
      workspaceRole: 'owner', projectIds: ['private-project'], dmIds: ['private-dm'], displayName: 'Convidada' } }),
  })
  expect(guestRedeem.status).toBe(200)
  const guest = await guestRedeem.json()
  expect(guest).toMatchObject({ actor: { workspaceRole: 'guest', projectIds: ['shared'] } })
  expect(JSON.stringify(guest)).not.toContain('private-project')
  expect(JSON.stringify(guest)).not.toContain('private-dm')
  await expect(b.issueInvite({ ...scope, inviteId: 'escalate', token: '', role: 'member' })).rejects.toThrow('forbidden')
  await expect(b.connectRemoteTeam({ ...scope, edgeUrl, channelIds: [GENERAL, 'local'] }))
    .rejects.toThrow('remote-team-owner-required')
  const forbiddenChannel = await fetch(`${edgeUrl}/w/${scope.workspaceId}/sync/after?streamId=project:shared:channel:local`, {
    headers: { 'x-persona-actor': 'bob' },
  })
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
  const firstCursor = b.getRemoteTeamState(scope)?.cursors[STREAM]
  expect(firstCursor).toBe(1)

  say(a, 'offline-message', 'A publicou enquanto B estava fora')
  await a.syncRemoteTeam(scope)
  await b.remoteTeam.dispose()
  const restored = new RemoteTeamHost(b.remoteTeam.options)
  restored.resume(scope)
  try {
    await restored.sync(scope)
    expect(channel(b)).toContain('A publicou enquanto B estava fora')
    expect(restored.state(scope)?.cursors[STREAM]).toBe(2)
    await a.revokeMember({ ...scope, inviteId: invite.id })
    expect((await a.listRemoteMembers(scope)).find(row => row.actorId === 'bob')?.status).toBe('revoked')
    const deniedRoster = await fetch(`${edgeUrl}/w/${scope.workspaceId}/members?projectId=shared`, {
      headers: { 'x-persona-actor': 'bob' },
    })
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
  const remote = await fetch(`${edgeUrl}/w/${scope.workspaceId}/sync/after?streamId=${encodeURIComponent(STREAM)}&afterSeq=0`, {
    headers: { 'x-persona-actor': 'alice' },
  })
  const remoteBody = await remote.text()
  expect(remoteBody).not.toContain('DM nunca sai')
  expect(remoteBody).not.toContain('Canal não autorizado')
}, 90_000)
