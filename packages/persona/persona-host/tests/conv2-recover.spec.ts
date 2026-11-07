import type { Runner, Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * CONV-2 (D-079): the recovery sweep after a restart (`recoverTalks`) re-answered, as a chat message, every non-work message that
 * had no `coord-<id>-reply` — also the ones the host had already answered with another state line (absorbed by a running task,
 * paused, ...), and also for a PAUSED persona. One answer per message, never two; a paused persona does not talk.
 */
const { host } = bindHostFile('2026-11-03T15:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }
let serial = 0

function seed(h: PersonaHost): void {
  serial = 0
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bia', ...scope, displayName: 'Bia', handle: 'bia', role: 'member' })
  h.createPersona({
    id: 'p1', ...scope, name: 'Bento', title: 'Engenharia', description: 'Implementa.', personality: 'Direto.',
    instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm',
    canRecruit: false, createdBy: 'ana',
  })
  h.product.updatePersona({ ...h.product.getPersona('p1')!, systemRoles: ['coordination'] }, 'pp')
  h.createDm({ id: 'dm-ana', ...scope, participantA: 'ana', participantB: 'p1' })
  h.createDm({ id: 'dm-bia', ...scope, participantA: 'bia', participantB: 'p1' })
  h.sessionMemberId = 'ana'
}

type Where = { kind: 'channel' | 'dm'; owner: string }
const CHANNEL: Where = { kind: 'channel', owner: 'geral' }

function send(h: PersonaHost, body: string, where: Where = CHANNEL, as = 'ana'): string {
  serial += 1
  const id = `u${String(serial)}`
  h.sessionMemberId = as
  h.postMessage({ id, ...scope, streamKind: where.kind, ownerId: where.owner, body, actorId: as, subjectId: '' })
  return id
}

const eventsOf = (h: PersonaHost, where: Where = CHANNEL, as = 'ana') =>
  h.listMessages({ ...scope, streamKind: where.kind, ownerId: where.owner, actorId: as, afterSeq: 0, limit: 200 }).events

const linesAbout = (h: PersonaHost, id: string, where: Where = CHANNEL, as = 'ana'): Array<[string, string]> =>
  eventsOf(h, where, as).filter(item => item.actorId !== as && item.id.includes(id)).map(item => [item.id, item.body])

/** The sweep that runs when a project is opened again after a restart. */
async function recover(h: PersonaHost): Promise<void> {
  const orchestration = h.orchestration as unknown as { recoverTalks(rt: unknown, projectId: string): Promise<void> }
  await orchestration.recoverTalks(h.orchestration.runtime('pp'), 'pp')
  await h.orchestration.flush('pp')
}

function runningRunner(): Runner {
  return {
    ensureSession: () => Promise.resolve(),
    deliver: () => Promise.resolve(),
    cancel: () => Promise.resolve(),
    status: () => 'running',
    whenIdle: () => Promise.resolve(),
    onEvent: () => () => undefined,
    capabilities: () => ({ steer: true, removeQueued: true, reportsInputTaken: true, background: false, tools: 'native', resume: true }),
  }
}

/** A task running right now on Bento in the channel; started by Ana. */
function runningTask(h: PersonaHost): void {
  const at = '2026-11-03T14:30:00.000Z'
  const task: Ticket = {
    id: 't-run', title: 'Relatório do dia', decisionId: 'd-run',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: 't-run-a1', state: 'running', createdAt: at, startedAt: at }], inputs: [], undelivered: [],
    createdAt: at, updatedAt: at, origin: { triggerId: 'm-old', triggerIds: ['m-old'] },
    execution: { name: 'Bento', directory: '.', assignment: 'Faça o relatório do dia' },
  }
  h.orchestration.runtime('pp').repo.tickets.save(task)
  h.orchestration.warmRunners.set('pp:p1:task', runningRunner())
  h.orchestration.budget.running.set('pp', 1)
}

it('a message the running task absorbed is not re-answered as a chat message when the project is reopened', async () => {
  const h = host()
  seed(h)
  runningTask(h)
  const id = send(h, 'use a cor azul')
  await h.orchestration.flush('pp')
  expect(linesAbout(h, id).map(([lineId]) => lineId)).toEqual([`coord-${id}-absorbed`])
  await recover(h)
  expect(linesAbout(h, id).map(([lineId]) => lineId)).toEqual([`coord-${id}-absorbed`]) // still exactly one answer
})

it('a paused persona does not talk after a restart: its held message keeps the one "pausada" line', async () => {
  const h = host()
  seed(h)
  h.orchestration.setPersonaPaused('pp', 'p1', true)
  const id = send(h, 'bom dia, tudo bem?')
  await h.orchestration.flush('pp')
  expect(linesAbout(h, id).map(([lineId]) => lineId)).toEqual([`coord-${id}-paused`])
  await recover(h)
  expect(linesAbout(h, id).map(([lineId]) => lineId)).toEqual([`coord-${id}-paused`]) // paused: no conversation reply
})

it('a command already answered (/pausar) is not turned into a chat reply by the sweep', async () => {
  const h = host()
  seed(h)
  const id = send(h, '/pausar')
  await h.orchestration.flush('pp')
  const before = linesAbout(h, id)
  expect(before.map(([lineId]) => lineId)).toEqual([`coord-${id}-pause`])
  await recover(h)
  expect(linesAbout(h, id)).toEqual(before)
})

it('a message steered into the open turn ("Direcionar agora") is answered by the turn, not by the sweep', async () => {
  const h = host()
  seed(h)
  const id = 'steer:p1:2026-11-03T15:00:02.000Z'
  h.orchestration.events.append({
    id, ...scope, streamKind: 'channel', ownerId: 'geral', type: 'message', body: 'prefira tabelas', actorId: 'ana', subjectId: '', occurredAt: '2026-11-03T15:00:02.000Z',
  })
  h.messageFlags.set('pp', id, { steeredPersonaId: 'p1' })
  await recover(h)
  expect(linesAbout(h, id)).toEqual([]) // no second, conversational answer to an instruction the turn already took
})

it('D-079 still holds: a talk that really lost its reply (only the "busy" line) is answered by the sweep', async () => {
  const h = host()
  seed(h)
  const id = send(h, 'Como você está hoje?')
  await h.orchestration.flush('pp')
  // The crash happened after the first state line and before the reply: simulate it by removing the reply.
  const reply = `coord-${id}-reply`
  h.orchestration.store.db.prepare('DELETE FROM event WHERE id = ?').run(reply)
  expect(linesAbout(h, id).map(([lineId]) => lineId)).not.toContain(reply)
  await recover(h)
  expect(linesAbout(h, id).map(([lineId]) => lineId)).toContain(reply) // never silence
})

it('the "busy" line of a channel task does not tell another person\'s DM its title; the person who asked still sees it', async () => {
  const h = host()
  seed(h)
  runningTask(h)
  const speaker = h.product.getPersona('p1')!
  const rt = h.orchestration.runtime('pp')
  const busy = (id: string, dm: string, actorId: string): string | undefined => {
    // The message of the person, stored as the host stores it, then the host's "busy" reaction to it.
    const stored = h.orchestration.events.append({
      id, ...scope, streamKind: 'dm', ownerId: dm, type: 'message', body: 'Como você está?', actorId, subjectId: '', occurredAt: '2026-11-03T15:00:01.000Z',
    })
    ;(h.orchestration as unknown as { noteBusy(rt: unknown, event: unknown, speaker: unknown): void }).noteBusy(rt, stored, speaker)
    return h.orchestration.events.get(`coord-${id}-busy`)?.body
  }
  // Bia's DM with Bento: the task runs in the channel and was asked by Ana, so Bia is not told its title.
  expect(busy('bia-1', 'dm-bia', 'bia')).toBe('Estou terminando uma tarefa; respondo em seguida.')
  // Ana asked for the task herself, so she still sees it, in a DM or anywhere.
  expect(busy('ana-1', 'dm-ana', 'ana')).toBe('Estou terminando “Relatório do dia”; respondo em seguida.')
})
