/**
 * H23 / F4 (the invite of the 1st colleague, host side): the link of a team, the screen it opens, the request and the owner's card. Two REAL hosts through the REAL worker
 * (Miniflare, local only):
 *  - the owner's "Criar link de convite" gives `persona://entrar/<time>/<token>` (one person, 7 days, the team's name on it);
 *  - the screen the link opens shows the team BEFORE anybody asks (nothing is created, nobody is asked); a malformed link, a link of another team, a hub address that is not
 *    local, an expired, a revoked and a used invite each answer with the screen's own reason;
 *  - "Pedir para entrar" asks, signed by the device: the person is NOT a member until the owner decides; only the owner sees the card (with the security code);
 *  - the owner lets the person in: the channel keys are wrapped for them, they read what the team says; the invite is then used.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { unstable_dev, type Unstable_DevWorker } from 'wrangler'
import type PersonaHost from '../../../packages/persona/persona-host/src/index.ts'
import { openRemoteTeamHarness, type RemoteTeamHarness } from '../../../packages/persona/persona-host/tests/remote-team-harness.ts'
import { deviceOf } from './host-device.ts'
import { json, newDevice, signedAs } from './signed-fetch.ts'

let edge: Unstable_DevWorker | undefined
const profiles: RemoteTeamHarness[] = []
const home = mkdtempSync(join(tmpdir(), 'persona-invite-link-'))
const scope = { workspaceId: 'link-workspace', projectId: 'shared' }
const GENERAL = 'geral:shared'

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

function desk(actorId: string): PersonaHost {
  const profile = openRemoteTeamHarness(join(home, `${actorId}.db`))
  profiles.push(profile)
  const { h } = profile
  h.createWorkspace({ id: scope.workspaceId, name: actorId, personalProjectId: `personal-${actorId}` })
  h.createProject({ id: scope.projectId, workspaceId: scope.workspaceId, name: 'Compartilhado', description: '' })
  h.createMember({ workspaceId: scope.workspaceId, projectId: scope.projectId, id: actorId, displayName: actorId, handle: actorId, role: 'owner' })
  return h
}

const read = (h: PersonaHost, reader: string): readonly string[] =>
  h.listMessages({ ...scope, streamKind: 'channel', ownerId: GENERAL, actorId: reader, afterSeq: 0, limit: 80 }).events.map(event => event.body)

it('link -> preview -> ask -> owner card -> approval: the guest reads the team; every wrong link says why', async () => {
  if (edge === undefined) throw new Error('edge-not-started')
  const edgeUrl = `http://${edge.address}:${edge.port}`
  const alice = desk('alice')
  const bob = desk('bob')
  expect(await desk('zoe').getJoinStatus(scope)).toBe('sem_pedido') // nobody asked on this device
  await alice.connectRemoteTeam({ ...scope, edgeUrl, channelIds: [GENERAL] })

  // the owner's link: one person, 7 days, the team's name on it
  const made = await alice.createInviteLink({ ...scope, inviteId: 'invite-bob', token: '', role: 'member', teamName: '  Padaria\u0000 Lua  ' })
  expect(made.link).toMatch(/^persona:\/\/entrar\/link-workspace\/[0-9a-f]{48}$/u)
  expect(made.inviteId).toBe('invite-bob')
  expect(Math.abs(made.expiresAt - (Date.now() + 7 * 24 * 60 * 60 * 1000))).toBeLessThan(60_000)

  // the screen the link opens: the team, before anybody asks
  const shown = await bob.previewInvite({ link: made.link, edgeUrl })
  expect(shown).toEqual({ ok: true, teamId: 'link-workspace', teamName: 'Padaria Lua', projectId: 'shared', expiresAt: made.expiresAt })
  expect(await alice.listJoinRequests(scope)).toEqual([]) // previewing asked nobody

  // every wrong link has its own reason (the screen's words, not a code)
  const token = made.link.split('/').at(-1) ?? ''
  const reasons = async (link: string, url: string = edgeUrl): Promise<unknown> => (await bob.previewInvite({ link, edgeUrl: url }) as { error?: string }).error
  expect(await reasons('persona://entrar/link-workspace/curto')).toBe('LINK_INVALIDO')
  expect(await reasons(`${made.link}?x=1`)).toBe('LINK_INVALIDO')
  expect(await reasons(`persona://entrar/link-workspace/${'a'.repeat(48)}`)).toBe('LINK_INVALIDO') // well formed, but the hub does not know it
  expect(await reasons(`persona://entrar/outro-time/${token}`)).toBe('LINK_INVALIDO') // another team's door
  expect(await reasons(made.link, 'https://evil.example')).toBe('SEM_CONEXAO') // the hub's address is configuration, and it is local
  const asAlice = signedAs(fetch, await deviceOf(alice, 'alice'))
  const grant = { workspaceRole: 'member', projectIds: ['shared'], channelIds: [GENERAL], dmIds: [] }
  const short = 'b'.repeat(48)
  expect((await asAlice(`${edgeUrl}/w/${scope.workspaceId}/invites`, { method: 'POST', ...json({ id: 'invite-short', token: short, ttlMs: 1, grant }) })).status).toBe(200)
  await new Promise(resolve => setTimeout(resolve, 25))
  expect(await reasons(`persona://entrar/link-workspace/${short}`)).toBe('CONVITE_VENCIDO')
  const dead = 'c'.repeat(48)
  expect((await asAlice(`${edgeUrl}/w/${scope.workspaceId}/invites`, { method: 'POST', ...json({ id: 'invite-dead', token: dead, grant }) })).status).toBe(200)
  expect((await asAlice(`${edgeUrl}/w/${scope.workspaceId}/invites/invite-dead/revoke`, { method: 'POST' })).status).toBe(200)
  expect(await reasons(`persona://entrar/link-workspace/${dead}`)).toBe('CONVITE_REVOGADO')

  // "Pedir para entrar" reads the link again and refuses one that names another team
  await expect(bob.joinTeamFromLink({ ...scope, link: `persona://entrar/outro-time/${token}`, edgeUrl })).rejects.toThrow() // (the Remote layer hides the message)
  await expect(bob.joinTeamFromLink({ ...scope, link: `${made.link}/`, edgeUrl })).rejects.toThrow()
  expect(await alice.listJoinRequests(scope)).toEqual([]) // neither refusal reached the hub
  const asked = await bob.joinTeamFromLink({ ...scope, link: made.link, edgeUrl })
  expect(asked.status).toBe('offline')
  expect(asked.errorCode).toBe('PENDING_APPROVAL') // not a member until the owner decides
  expect(await bob.getJoinStatus(scope)).toBe('esperando_dono') // the hub's own answer for HIS request
  const asStranger = signedAs(fetch, newDevice('estranho'))
  expect((await asStranger(`${edgeUrl}/w/${scope.workspaceId}/join-requests/mine`)).status).toBe(401) // someone who never asked reads nobody's request

  // the owner's card; only the owner sees it
  const cards = await alice.listJoinRequests(scope)
  expect(cards).toHaveLength(1)
  expect(cards[0]).toMatchObject({ actorId: 'bob', displayName: 'bob' })
  expect(cards[0]?.securityCode).toMatch(/\S/u)
  await expect(bob.listJoinRequests(scope)).rejects.toThrow() // the guest is not the owner of this team
  await expect(bob.decideJoinRequest({ ...scope, requestId: cards[0]?.id ?? '', allow: true })).rejects.toThrow()

  // the owner lets bob in: the keys are wrapped for him, he reads what the team says
  expect(await alice.decideJoinRequest({ ...scope, requestId: cards[0]?.id ?? '', allow: true })).toBe(true)
  expect(await alice.listJoinRequests(scope)).toEqual([])
  expect(await bob.getJoinStatus(scope)).toBe('aceito') // the owner decided: the screen syncs and the keys arrive
  alice.postMessage({ ...scope, id: 'm1', streamKind: 'channel', ownerId: GENERAL, actorId: 'alice', body: 'Bem-vindo ao time, Bob', subjectId: 'm1', occurredAt: new Date().toISOString() })
  await alice.syncRemoteTeam(scope)
  await bob.syncRemoteTeam(scope)
  expect(read(bob, 'bob')).toContain('Bem-vindo ao time, Bob')
  expect(await bob.getJoinStatus(scope)).toBe('aceito')
  const asBob = signedAs(fetch, await deviceOf(bob, 'bob'))
  expect((await asBob(`${edgeUrl}/w/${scope.workspaceId}/join-requests/mine/cancel`, { method: 'POST' })).status).toBe(409) // a decided request cannot be withdrawn

  // the invite was for one person: the same link now says so
  expect(await reasons(made.link)).toBe('CONVITE_USADO')

  // the owner can also say no: the card goes away and the person never becomes a member
  const carol = desk('carol')
  const second = await alice.createInviteLink({ ...scope, inviteId: 'invite-carol', token: '', role: 'member', teamName: 'Padaria Lua' })
  await carol.joinTeamFromLink({ ...scope, link: second.link, edgeUrl })
  expect(await carol.getJoinStatus(scope)).toBe('esperando_dono')
  const [waiting] = await alice.listJoinRequests(scope)
  expect(waiting?.actorId).toBe('carol')
  expect(await alice.decideJoinRequest({ ...scope, requestId: waiting?.id ?? '', allow: false })).toBe(true)
  expect(await alice.listJoinRequests(scope)).toEqual([])
  await carol.syncRemoteTeam(scope)
  expect(read(carol, 'carol')).not.toContain('Bem-vindo ao time, Bob') // she was refused: no key, no history
  expect((await carol.getRemoteTeamState(scope))?.status).not.toBe('connected')
  expect(await carol.getJoinStatus(scope)).toBe('recusado')

  // and the guest can withdraw a request nobody decided yet: the card leaves the owner's list and the device forgets the pending connection
  const dave = desk('dave')
  const third = await alice.createInviteLink({ ...scope, inviteId: 'invite-dave', token: '', role: 'member', teamName: 'Padaria Lua' })
  await dave.joinTeamFromLink({ ...scope, link: third.link, edgeUrl })
  expect((await alice.listJoinRequests(scope)).map(card => card.actorId)).toEqual(['dave'])
  expect(await dave.cancelJoinRequest(scope)).toBe(true)
  expect(await alice.listJoinRequests(scope)).toEqual([])
  expect(await dave.getJoinStatus(scope)).toBe('sem_pedido')
  await expect(dave.cancelJoinRequest(scope)).rejects.toThrow() // nothing left to cancel
}, 120_000)
