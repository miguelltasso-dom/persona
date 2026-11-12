/**
 * Carbon P0-14 (sprint de correção): the remote team sent every message to the edge as `{ clear: ... }`. Two REAL hosts through the REAL worker (Miniflare, local):
 *  - what the edge stores is SEALED (`alg: 'channel'`): not a word of the message in the clear, anywhere in what the hub holds;
 *  - the members who hold the channel key read it; a member the owner removed cannot read the next epoch (the owner rotates and wraps only for who stays);
 *  - a person who joins later gets the keys of the epochs that came before (the history is theirs), and a stranger gets nothing.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { unstable_dev, type Unstable_DevWorker } from 'wrangler'
import type PersonaHost from '../../../packages/persona/persona-host/src/index.ts'
import { openRemoteTeamHarness, type RemoteTeamHarness } from '../../../packages/persona/persona-host/tests/remote-team-harness.ts'
import { approveAll, deviceOf } from './host-device.ts'
import { newDevice, signedAs } from './signed-fetch.ts'

let edge: Unstable_DevWorker | undefined
const profiles: RemoteTeamHarness[] = []
const home = mkdtempSync(join(tmpdir(), 'persona-e2ee-remote-'))
const scope = { workspaceId: 'e2ee-workspace', projectId: 'shared' }
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

function desk(actorId: string, workspaceId: string = scope.workspaceId): PersonaHost {
  const profile = openRemoteTeamHarness(join(home, `${actorId}.db`))
  profiles.push(profile)
  const { h } = profile
  h.createWorkspace({ id: workspaceId, name: actorId, personalProjectId: `personal-${actorId}` })
  h.createProject({ id: scope.projectId, workspaceId, name: 'Compartilhado', description: '' })
  h.createMember({ workspaceId, projectId: scope.projectId, id: actorId, displayName: actorId, handle: actorId, role: 'owner' })
  return h
}

function say(h: PersonaHost, id: string, body: string, actorId: string): void {
  h.postMessage({ ...scope, id, streamKind: 'channel', ownerId: GENERAL, actorId, body, subjectId: id, occurredAt: new Date().toISOString() })
}

const read = (h: PersonaHost, reader: string): readonly string[] =>
  h.listMessages({ ...scope, streamKind: 'channel', ownerId: GENERAL, actorId: reader, afterSeq: 0, limit: 80 }).events.map(event => event.body)

it('the edge holds only sealed messages; members read them, the removed one cannot read the next epoch, a late member gets the history, a stranger nothing', async () => {
  if (edge === undefined) throw new Error('edge-not-started')
  const edgeUrl = `http://${edge.address}:${edge.port}`
  const alice = desk('alice')
  const bob = desk('bob')
  const carol = desk('carol')
  await alice.connectRemoteTeam({ ...scope, edgeUrl, channelIds: [GENERAL] })
  const inviteBob = await alice.issueInvite({ ...scope, inviteId: 'invite-bob', token: '', role: 'member' })
  await bob.acceptInvite({ ...scope, edgeUrl, token: inviteBob.token })
  expect(await approveAll(alice, scope)).toBe(1)
  const asAlice = signedAs(fetch, await deviceOf(alice, 'alice'))
  const asBob = signedAs(fetch, await deviceOf(bob, 'bob'))
  const stored = async (): Promise<string> => (await asAlice(`${edgeUrl}/w/${scope.workspaceId}/sync/after?streamId=${encodeURIComponent(STREAM)}&afterSeq=0`)).text()

  say(alice, 'm1', 'Proposta secreta da Padaria Lua: R$ 4.800', 'alice')
  await alice.syncRemoteTeam(scope)
  await bob.syncRemoteTeam(scope)
  const first = await stored()
  expect(first).not.toContain('Proposta secreta') // not a word of it in the clear, anywhere the hub holds
  expect(first).not.toContain('4.800')
  const envelopes = (JSON.parse(first) as { envelopes: Array<{ payload: { alg?: string; clear?: string } }> }).envelopes
  expect(envelopes.length).toBeGreaterThan(0)
  expect(envelopes.every(item => item.payload.alg === 'channel' && item.payload.clear === undefined)).toBe(true)
  expect(read(bob, 'bob')).toContain('Proposta secreta da Padaria Lua: R$ 4.800') // bob holds the key: he reads it
  expect(read(alice, 'alice').filter(body => body.startsWith('Proposta secreta'))).toHaveLength(1)

  // a registered person who is NOT a member gets nothing: no wrap, no messages
  const stranger = signedAs(fetch, newDevice('estranho'))
  expect((await stranger(`${edgeUrl}/w/${scope.workspaceId}/channels/${encodeURIComponent(GENERAL)}/key-wraps`)).status).toBe(401)

  // alice removes bob: she rotates (epoch 2) and wraps only for who stays; what is said next is sealed under a key bob never gets
  await alice.revokeMember({ ...scope, inviteId: 'invite-bob' })
  const epoch = (await (await asAlice(`${edgeUrl}/w/${scope.workspaceId}/channels/${encodeURIComponent(GENERAL)}/epoch`)).json()) as { epoch: number }
  expect(epoch.epoch).toBe(2)
  say(alice, 'm2', 'Depois que o Bob saiu: desconto de 12%', 'alice')
  await alice.syncRemoteTeam(scope)
  expect(await stored()).not.toContain('desconto de 12%')
  expect((await asBob(`${edgeUrl}/w/${scope.workspaceId}/sync/after?streamId=${encodeURIComponent(STREAM)}&afterSeq=0`)).status).toBe(403)
  await bob.syncRemoteTeam(scope)
  expect(read(bob, 'bob').some(body => body.includes('desconto de 12%'))).toBe(false)

  // carol joins later: the owner wraps EVERY epoch for her, so the history is hers too
  const inviteCarol = await alice.issueInvite({ ...scope, inviteId: 'invite-carol', token: '', role: 'member' })
  await carol.acceptInvite({ ...scope, edgeUrl, token: inviteCarol.token })
  expect(await approveAll(alice, scope)).toBe(1)
  await carol.syncRemoteTeam(scope)
  expect(read(carol, 'carol')).toEqual(expect.arrayContaining(['Proposta secreta da Padaria Lua: R$ 4.800', 'Depois que o Bob saiu: desconto de 12%']))
}, 240_000)

it('a person who registers an unusable (low-order) agreement key cannot break the owner: approving them fails with a TYPED error and the request stays pending, then the owner denies it', async () => {
  if (edge === undefined) throw new Error('edge-not-started')
  const edgeUrl = `http://${edge.address}:${edge.port}`
  const scopeOlga = { workspaceId: 'olga-workspace', projectId: 'shared' } // another workspace at the hub: this one has its own owner
  const owner = desk('olga', scopeOlga.workspaceId)
  await owner.connectRemoteTeam({ ...scopeOlga, edgeUrl, channelIds: [GENERAL] })
  const invite = await owner.issueInvite({ ...scopeOlga, inviteId: 'invite-mal', token: '', role: 'member' })
  const mal = newDevice('mal')
  const asked = await signedAs(fetch, mal)(`${edgeUrl}/w/${scopeOlga.workspaceId}/invites/${invite.token}/request`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actorId: 'mal', keys: { signing: mal.keys.signing, agreement: 'A'.repeat(43) } }), // 32 zero bytes: the point at infinity
  })
  expect(asked.status).toBe(200)
  const [request] = await owner.remoteTeam.joinRequests(scopeOlga)
  await expect(owner.remoteTeam.approveJoinRequest(scopeOlga, request?.id ?? '')).rejects.toMatchObject({ name: 'ChannelCryptoError', code: 'BAD_KEY' })
  expect(await owner.remoteTeam.joinRequests(scopeOlga)).toHaveLength(1) // still waiting: nothing was half-done
  await owner.remoteTeam.denyJoinRequest(scopeOlga, request?.id ?? '')
  expect(await owner.remoteTeam.joinRequests(scopeOlga)).toHaveLength(0)
}, 120_000)
