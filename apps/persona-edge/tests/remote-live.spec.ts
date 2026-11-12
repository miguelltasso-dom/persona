/**
 * H23 / F4: the live link, with two REAL hosts through the REAL worker (Miniflare, local only) and NO polling (`pollMs` 0), so whatever arrives, arrives through the WebSocket:
 *  - what one host posts is in the other's log within seconds, without the other asking (the socket wakes its sync);
 *  - presence: the owner sees who is online, and a member who leaves turns "fora";
 *  - the owner removes a member: the hub cuts their socket, they are not retried, and their host learns it is no longer a member.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { unstable_dev, type Unstable_DevWorker } from 'wrangler'
import type PersonaHost from '../../../packages/persona/persona-host/src/index.ts'
import { openRemoteTeamHarness, type RemoteTeamHarness } from '../../../packages/persona/persona-host/tests/remote-team-harness.ts'
import { approveAll } from './host-device.ts'

let edge: Unstable_DevWorker | undefined
const profiles = new Map<string, RemoteTeamHarness>()
const home = mkdtempSync(join(tmpdir(), 'persona-remote-live-'))
const scope = { workspaceId: 'live-workspace', projectId: 'shared' }
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
  for (const profile of profiles.values()) await profile.dispose().catch(() => undefined)
  await edge?.stop()
  rmSync(home, { recursive: true, force: true })
  vi.unstubAllEnvs()
}, 60_000)

function desk(actorId: string): PersonaHost {
  const profile = openRemoteTeamHarness(join(home, `${actorId}.db`), 0, true) // no polling, live link ON
  profiles.set(actorId, profile)
  const { h } = profile
  h.createWorkspace({ id: scope.workspaceId, name: actorId, personalProjectId: `personal-${actorId}` })
  h.createProject({ id: scope.projectId, workspaceId: scope.workspaceId, name: 'Compartilhado', description: '' })
  h.createMember({ workspaceId: scope.workspaceId, projectId: scope.projectId, id: actorId, displayName: actorId, handle: actorId, role: 'owner' })
  return h
}

const read = (h: PersonaHost, reader: string): readonly string[] =>
  h.listMessages({ ...scope, streamKind: 'channel', ownerId: GENERAL, actorId: reader, afterSeq: 0, limit: 80 }).events.map(event => event.body)

/** Wait (up to `ms`) for something that arrives by itself; the message says what was awaited. */
async function eventually<T>(what: string, look: () => Promise<T | undefined> | T | undefined, ms = 10_000): Promise<T> {
  const deadline = Date.now() + ms
  for (;;) {
    const found = await look()
    if (found !== undefined && found !== false) return found
    if (Date.now() > deadline) throw new Error(`não chegou sozinho em ${String(ms)} ms: ${what}`)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

it('a message posted by one host reaches the other with no polling; presence follows who is connected; a removed member is cut and not retried', async () => {
  if (edge === undefined) throw new Error('edge-not-started')
  const edgeUrl = `http://${edge.address}:${edge.port}`
  const alice = desk('alice')
  const bob = desk('bob')
  const carol = desk('carol')
  await alice.connectRemoteTeam({ ...scope, edgeUrl, channelIds: [GENERAL] })
  for (const [name, guest] of [['bob', bob], ['carol', carol]] as const) {
    const invite = await alice.issueInvite({ ...scope, inviteId: `invite-${name}`, token: '', role: 'member' })
    await guest.acceptInvite({ ...scope, edgeUrl, token: invite.token })
  }
  expect(await approveAll(alice, scope)).toBe(2)
  await bob.syncRemoteTeam(scope) // the first exchange loads the keys: from here the host is connected and the live link opens
  await carol.syncRemoteTeam(scope)

  // presence: the owner sees both online (nobody polls: the roster comes from the sockets)
  let last: unknown
  const online = await eventually('todos online', async () => {
    const rows = await alice.getPresence(scope)
    last = {
      rows, alice: await alice.getRemoteTeamState(scope), bob: (await bob.getRemoteTeamState(scope))?.status,
      carol: (await carol.getRemoteTeamState(scope))?.status,
    }
    return ['alice', 'bob', 'carol'].every(name => rows.find(row => row.actorId === name)?.state === 'online') ? rows : undefined
  }).catch((error: unknown) => { throw new Error(`${String(error)} :: ${JSON.stringify(last)}`) })
  expect(online.find(row => row.actorId === 'bob')).toMatchObject({ name: 'bob', state: 'online' })

  // a message reaches the other host by itself
  alice.postMessage({ ...scope, id: 'm1', streamKind: 'channel', ownerId: GENERAL, actorId: 'alice', body: 'Bom dia, time', subjectId: 'm1', occurredAt: new Date().toISOString() })
  await alice.syncRemoteTeam(scope) // alice pushes; nobody calls sync on bob or carol
  await eventually('bob recebeu a mensagem', () => (read(bob, 'bob').includes('Bom dia, time') ? true : undefined))
  await eventually('carol recebeu a mensagem', () => (read(carol, 'carol').includes('Bom dia, time') ? true : undefined))

  // the other way round: bob answers, alice gets it by herself
  bob.postMessage({ ...scope, id: 'm2', streamKind: 'channel', ownerId: GENERAL, actorId: 'bob', body: 'Bom dia, Ana', subjectId: 'm2', occurredAt: new Date().toISOString() })
  await bob.syncRemoteTeam(scope)
  await eventually('alice recebeu a resposta', () => (read(alice, 'alice').includes('Bom dia, Ana') ? true : undefined))

  // a member who leaves turns "fora" for the others
  await profiles.get('bob')?.dispose()
  profiles.delete('bob')
  await eventually('bob fora', async () => ((await alice.getPresence(scope)).find(row => row.actorId === 'bob')?.state === 'fora' ? true : undefined))

  // the owner removes carol: the hub cuts her socket and her host learns it without being asked
  await alice.revokeMember({ ...scope, inviteId: 'invite-carol' })
  await eventually('carol revogada', async () => ((await carol.getRemoteTeamState(scope))?.status === 'revoked' ? true : undefined))
  await new Promise(resolve => setTimeout(resolve, 3_000)) // not retried: she does not come back as "online"
  expect((await alice.getPresence(scope)).find(row => row.actorId === 'carol')).toBeUndefined()
}, 120_000)
