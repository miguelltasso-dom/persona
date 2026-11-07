/**
 * P0 (Keel, 04/11 21:40): in a REMOTE team, a message the person sends is ONE line in their own thread. The E13 desk showed it twice
 * under the same "Você" — "the echo of the edge". Real local edge + two SQLite-backed hosts, polling ON (like the real desk), no model.
 * Alice writes through the very Remote the composer calls; the edge hands the message back to her on every pull; both desks keep ONE copy.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { unstable_dev, type Unstable_DevWorker } from 'wrangler'
import type PersonaHost from '../../../packages/persona/persona-host/src/index.ts'
import { openRemoteTeamHarness, type RemoteTeamHarness } from '../../../packages/persona/persona-host/tests/remote-team-harness.ts'

let edge: Unstable_DevWorker | undefined
const profiles: RemoteTeamHarness[] = []
const home = mkdtempSync(join(tmpdir(), 'persona-echo-'))
const scope = { workspaceId: 'echo-ws', projectId: 'shared' }
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

function desk(actorId: string, pollMs: number): PersonaHost {
  const profile = openRemoteTeamHarness(join(home, `${actorId}.db`), pollMs)
  profiles.push(profile)
  const { h } = profile
  h.createWorkspace({ id: scope.workspaceId, name: actorId, personalProjectId: `personal-${actorId}` })
  h.createProject({ id: scope.projectId, workspaceId: scope.workspaceId, name: 'Compartilhado', description: '' })
  h.createMember({ ...scope, id: actorId, displayName: actorId, handle: actorId, role: 'owner' })
  return h
}

/** What the person reads in the thread: the lines with these words, and every stored copy in the project. */
function copies(h: PersonaHost, reader: string, body: string): { read: number; stored: number } {
  return {
    read: h.listMessages({ ...scope, streamKind: 'channel', ownerId: GENERAL, actorId: reader, afterSeq: 0, limit: 200 })
      .events.filter(event => event.body === body).length,
    stored: h.events.listProject(scope.projectId).filter(event => event.body === body).length,
  }
}

it('a message from the composer is one line on the sender\'s desk and one on the other, however often the edge hands it back', async () => {
  if (edge === undefined) throw new Error('edge-not-started')
  const edgeUrl = `http://${edge.address}:${edge.port}`
  const alice = desk('alice', 150) // polling ON: the exchange runs while the person types
  const bob = desk('bob', 150)
  await alice.connectRemoteTeam({ ...scope, edgeUrl, channelIds: [GENERAL] })
  const invite = await alice.issueInvite({ ...scope, inviteId: 'invite-bob', token: '', role: 'member' })
  await bob.acceptInvite({ ...scope, edgeUrl, token: invite.token })
  alice.sessionMemberId = 'alice'
  for (const [index, body] of ['Olá do Alice · 8a9b6eb3', 'segunda linha', 'preciso de um README no projeto'].entries()) {
    // The composer's call: its own id, the channel, the sender, the words.
    alice.postMessage({ ...scope, id: `ui-${String(index)}`, streamKind: 'channel', ownerId: GENERAL, actorId: 'alice', body,
      subjectId: `ui-${String(index)}`, occurredAt: new Date().toISOString() })
    await alice.orchestration.flush(scope.projectId)
    for (let round = 0; round < 2; round += 1) {
      await alice.syncRemoteTeam(scope)
      await new Promise(resolve => setTimeout(resolve, 200)) // let the polling timers fire too
    }
    expect(copies(alice, 'alice', body), `alice · ${body}`).toEqual({ read: 1, stored: 1 })
  }
  for (let round = 0; round < 2; round += 1) {
    await bob.syncRemoteTeam(scope)
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  for (const body of ['Olá do Alice · 8a9b6eb3', 'segunda linha', 'preciso de um README no projeto']) {
    expect(copies(bob, 'bob', body), `bob · ${body}`).toEqual({ read: 1, stored: 1 })
    expect(copies(alice, 'alice', body), `alice, after bob synced · ${body}`).toEqual({ read: 1, stored: 1 })
  }
  // The edge holds one envelope per message (nothing was pushed twice under another key).
  const stream = encodeURIComponent(`project:shared:channel:${GENERAL}`)
  const head = await fetch(`${edgeUrl}/w/${scope.workspaceId}/sync/head?streamId=${stream}`, { headers: { 'x-persona-actor': 'alice' } })
  const heads = (await head.json()) as { head: number }
  const stored = alice.events.listProject(scope.projectId).filter(event => event.streamId === `channel:${GENERAL}` && event.type === 'message')
  expect(heads.head).toBe(stored.length)
}, 240_000) // a loaded box needs room: the hosts poll every 150 ms
