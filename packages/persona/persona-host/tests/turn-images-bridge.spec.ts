import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import {
  CLAUDE_CAPABILITIES,
  CODEX_CAPABILITIES,
  createOarSessionRunner,
  ImagesRefusedError,
  type RunEvent,
  type StartTurnInput,
  type TurnCapabilities,
  type TurnRunner,
} from '@deepseek-ai/dsh-persona-runners'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * TEAM-5 / TEAM-4, the BRIDGE of the image in the host (the Probe's real round depends on it): with the REAL session runner of the OAR (the
 * one the host resolves for a CLI), an image attached to the channel arrives at `StartTurnInput.images` of the turn — as a file path and a
 * media type, never inside the prompt — for a Task, for each colleague of a round of opinion, and NOT for the consolidation. A CLI that
 * does not read images is told in plain words and never sent one.
 */

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/** A turn runner that records what the session facade hands to `start` (the Rivet's pattern, here under the host). */
function recordingTurn(capabilities: TurnCapabilities, refuse?: Error): { turn: TurnRunner; started: StartTurnInput[] } {
  const started: StartTurnInput[] = []
  const handle = (input: StartTurnInput) => ({
    runId: `r${String(started.length)}`, sessionId: 's1', ticketId: input.ticketId, assignmentId: input.assignmentId,
    personaId: input.personaId, cwd: input.cwd, model: input.model,
  })
  const ended = async function *(): AsyncIterable<RunEvent> { yield { type: 'ended', at: 'now', report: { state: 'ready', summary: 'ok' } } }
  const turn: TurnRunner = {
    capabilities: () => capabilities,
    health: async () => ({ ok: true, detail: 'x' }),
    authenticate: async () => ({ ok: true, detail: 'x' }),
    start: async (input) => {
      if (refuse !== undefined && input.images !== undefined) throw refuse
      started.push(input)
      return handle(input)
    },
    startTurn: async input => turn.start(input),
    stream: ended,
    events: ended,
    cancel: async () => undefined,
    resume: async input => turn.start(input),
    usage: async () => ({ inputTokens: 0, outputTokens: 0 }),
  }
  return { turn, started }
}

const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'nina', name: 'Nina', title: 'Arte' },
  { id: 'teo', name: 'Teo', title: 'Design' },
  { id: 'caio', name: 'Caio', title: 'Mídia' },
]

function rig(): PersonaHost {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, TEAM)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}

/** The REAL session runner of the OAR over a recording turn, installed as the warm runner of a persona for a purpose. */
function install(h: PersonaHost, personaId: string, slot: string, capabilities: TurnCapabilities, refuse?: Error): StartTurnInput[] {
  const { turn, started } = recordingTurn(capabilities, refuse)
  h.orchestration.warmRunners.set(`pp:${personaId}:${slot}`, createOarSessionRunner({ turn, personaId, model: 'm', permissionMode: 'deny', purpose: slot === 'task' ? 'task' : 'talk' }))
  return started
}

const attach = (h: PersonaHost): string => h.attachFile({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', name: 'capa.png', bytesBase64: PNG }).id

it('a Task about an image: the attachment of the channel reaches the CLI turn as a file + media type, not in the prompt', async () => {
  const h = rig()
  const started = install(h, 'nina', 'task', CLAUDE_CAPABILITIES)
  const id = attach(h)
  h.postMessage({ id: 'm1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Nina preciso de uma nova versão desta capa', actorId: 'ana', subjectId: 'm1', attachmentIds: [id] })
  await h.orchestration.flush('pp')
  const first = started.find(input => input.images !== undefined)
  expect(first?.images).toHaveLength(1)
  const [image] = first?.images ?? []
  expect(image?.mediaType).toBe('image/png')
  expect(isAbsolute(image?.path ?? '')).toBe(true)
  expect(existsSync(image?.path ?? '')).toBe(true)
  expect(readFileSync(image?.path ?? '').subarray(0, 4).toString('hex')).toBe('89504e47') // the real bytes of her file
  expect(first?.prompt).not.toContain(image?.path ?? '__none__') // never a path in the words
})

it('a CLI that does NOT read images is told in plain words and is never sent one; the Task still runs on the text', async () => {
  const h = rig()
  const started = install(h, 'nina', 'task', CODEX_CAPABILITIES)
  const id = attach(h)
  h.postMessage({ id: 'm2', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Nina preciso de uma nova versão desta capa', actorId: 'ana', subjectId: 'm2', attachmentIds: [id] })
  await h.orchestration.flush('pp')
  expect(started.length).toBeGreaterThan(0) // the Task ran
  expect(started.every(input => input.images === undefined)).toBe(true)
  expect(h.events.listProject('pp').some(row => row.body === 'Nina não consegue ver imagens neste motor.')).toBe(true)
})

it('a round of opinion: each colleague\'s turn carries the image, the consolidation of the asker does not', async () => {
  const h = rig()
  const teo = install(h, 'teo', 'talk:answer-only', CLAUDE_CAPABILITIES)
  const caio = install(h, 'caio', 'talk:answer-only', CLAUDE_CAPABILITIES)
  const nina = install(h, 'nina', 'talk:answer-only', CLAUDE_CAPABILITIES)
  const attachmentId = attach(h)
  const at = '2026-11-04T11:00:00.000Z'
  h.orchestration.runtime('pp').repo.tickets.save({
    id: 't-nina', title: 'Capa', decisionId: 'd', mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: 'a1', state: 'running', createdAt: at, startedAt: at }], inputs: [], undelivered: [], createdAt: at, updatedAt: at,
    origin: { triggerId: 'm0', triggerIds: ['m0'] }, execution: { name: 'Nina', directory: '.', assignment: 'Capa' },
  })
  const result = await h.opinions.run({
    projectId: 'pp', ticketId: 't-nina', requestId: 'call-bridge', askerId: 'nina', question: 'O que acham desta capa?',
    draft: { text: 'Capa de domingo', attachmentIds: [attachmentId] }, readerIds: ['teo', 'caio'], round: 1, maxRounds: 2, audience: 'team',
  })
  expect(result.state).toBe('done')
  for (const started of [teo, caio]) {
    const images = started.flatMap(input => input.images ?? [])
    expect(images).toHaveLength(1)
    expect(images[0]?.mediaType).toBe('image/png')
    expect(isAbsolute(images[0]?.path ?? '')).toBe(true)
  }
  expect(nina.flatMap(input => input.images ?? [])).toEqual([]) // her consolidation is text over the replies
  expect(nina.length).toBe(1)
})

it('a colleague whose CLI refuses the image is told as "does not see it" and left out — the round goes on with the others', async () => {
  const h = rig()
  install(h, 'teo', 'talk:answer-only', CODEX_CAPABILITIES, new ImagesRefusedError('engine'))
  const caio = install(h, 'caio', 'talk:answer-only', CLAUDE_CAPABILITIES)
  install(h, 'nina', 'talk:answer-only', CLAUDE_CAPABILITIES)
  const attachmentId = attach(h)
  const at = '2026-11-04T11:00:00.000Z'
  h.orchestration.runtime('pp').repo.tickets.save({
    id: 't-nina', title: 'Capa', decisionId: 'd', mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: 'a1', state: 'running', createdAt: at, startedAt: at }], inputs: [], undelivered: [], createdAt: at, updatedAt: at,
    origin: { triggerId: 'm0', triggerIds: ['m0'] }, execution: { name: 'Nina', directory: '.', assignment: 'Capa' },
  })
  const result = await h.opinions.run({
    projectId: 'pp', ticketId: 't-nina', requestId: 'call-refuse', askerId: 'nina', question: 'O que acham desta capa?',
    draft: { text: 'Capa de domingo', attachmentIds: [attachmentId] }, readerIds: ['teo', 'caio'], round: 1, maxRounds: 2, audience: 'team',
  })
  expect(result.noVision).toEqual(['teo'])
  expect(result.replies.map(reply => reply.personaId)).toEqual(['caio'])
  expect(caio.flatMap(input => input.images ?? [])).toHaveLength(1)
  expect(h.events.has('opinion:call-refuse:reply:teo')).toBe(false) // no line of an answer she never gave
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// TEAM-13 × TEAM-5 (Bolt, 07/11, found by the Probe in the fake of the lib 6): a request that lists TWO functions ("o texto e a arte") is split by
// the host into one Task per part, opened by a line of the TEAM (`split:<message>:<persona>`) that carries no file. The part's turn asked for the
// images of its own trigger only, so the photo the person attached never reached Téo (Arte). The part reads the files of the ORIGINAL message.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const SPLIT_TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Texto' },
  { id: 'teo', name: 'Téo', title: 'Arte' },
]

it('a request that lists two functions is split, and EACH part\'s turn carries the photo the person attached (not in the prompt, and cited by name)', async () => {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, SPLIT_TEAM)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  const bia = install(h, 'bia', 'task', CLAUDE_CAPABILITIES)
  const teo = install(h, 'teo', 'task', CLAUDE_CAPABILITIES)
  const id = attach(h)
  h.postMessage({
    id: 'm-split', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: 'Preciso do texto e da arte do cartaz da promoção; a foto é o rascunho atual.',
    actorId: 'ana', subjectId: 'm-split', attachmentIds: [id],
  })
  await h.orchestration.flush('pp')
  const tickets = h.orchestration.runtime('pp').repo.tickets.list()
  expect(tickets.map(ticket => ticket.origin.triggerId).sort()).toEqual(['split:m-split:bia', 'split:m-split:teo']) // it really was split
  for (const [name, started] of [['Bia', bia], ['Téo', teo]] as const) {
    const turn = started.find(input => input.images !== undefined)
    expect(turn, `${name}: a turn with the image`).toBeDefined()
    expect(turn?.images).toHaveLength(1)
    expect(turn?.images?.[0]?.mediaType).toBe('image/png')
    expect(existsSync(turn?.images?.[0]?.path ?? '')).toBe(true)
    expect(turn?.prompt).toContain('Anexos do pedido: inputs/capa.png') // and the words say which file it is: its REAL path in the draft (P0-1, draft-inbox.ts copies it there)
    expect(turn?.prompt).not.toContain(turn?.images?.[0]?.path ?? '__none__') // never a path in the words
  }
})

it('a request with no attachment is split as before: no “Anexos do pedido” line and no image', async () => {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, SPLIT_TEAM)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  const bia = install(h, 'bia', 'task', CLAUDE_CAPABILITIES)
  const teo = install(h, 'teo', 'task', CLAUDE_CAPABILITIES)
  h.postMessage({ id: 'm-plain', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: 'Preciso do texto e da arte do cartaz da promoção.', actorId: 'ana', subjectId: 'm-plain' })
  await h.orchestration.flush('pp')
  for (const started of [bia, teo]) {
    expect(started.length).toBeGreaterThan(0)
    expect(started.every(input => input.images === undefined)).toBe(true)
    expect(started.every(input => !input.prompt.includes('Anexos do pedido'))).toBe(true)
  }
})
