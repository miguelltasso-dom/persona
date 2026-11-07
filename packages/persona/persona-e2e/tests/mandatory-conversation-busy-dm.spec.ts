/**
 * D-079 / CONV-2 (Bolt, 04/11 19:47) — the "estou terminando uma tarefa" line must not leak the Task's TITLE to someone who cannot
 * read it. Acceptance through the REAL PersonaHost public path (`postMessage` → orchestration → `listMessages`), no model, 0 AI:
 *
 *   a SHARED project (a `member` only sees projects of kind `shared`); the owner (Ana) asked Bento for a long Task in #geral and it is
 *   RUNNING; a SECOND member (Bia) opens a DM with Bento and writes "Como você está?".
 *
 *   - Bia's DM: the line has NO title — "Estou terminando uma tarefa; respondo em seguida." (same persona as the Task) or
 *     "A equipe está terminando uma tarefa; respondo em seguida." (another persona);
 *   - counter-proof, Ana's DM (the one who asked for the Task): the title stays, between quotes —
 *     "Estou terminando “Relatório do dia”; respondo em seguida.";
 *   - the line id is `coord-<id of the message>-busy`, exactly one per message, and Ana never reads Bia's DM (nor the reverse).
 *
 * The running Task is injected into the repository the way Bolt's own host specs do (a real model turn is not needed to be "running");
 * the visible lines come from the unchanged host code path.
 */
import type { Runner, Ticket } from '@deepseek-ai/dsh-persona-engine'
import { describe, expect } from 'vitest'
import type PersonaHost from '../../persona-host/src/index.ts'
import { openJourney, seedJourney, it } from '../../persona-host/tests/journeys/journey-host.ts'

const SP = { workspaceId: 'ws', projectId: 'sp' } as const
const TITLE = 'Relatório do dia'
const ASKED_AT = '2026-11-03T14:30:00.000Z'
const LINE_SAME_PERSONA_NO_TITLE = 'Estou terminando uma tarefa; respondo em seguida.'
const LINE_OTHER_PERSONA_NO_TITLE = 'A equipe está terminando uma tarefa; respondo em seguida.'
const LINE_SAME_PERSONA_TITLE = `Estou terminando “${TITLE}”; respondo em seguida.`
const LINE_OTHER_PERSONA_TITLE = `A equipe está terminando “${TITLE}”; respondo em seguida.`

function persona(h: PersonaHost, id: string, name: string, title: string, coordination: boolean): void {
  h.createPersona({
    workspaceId: 'ws', projectId: 'sp', id, name, title, description: title, personality: 'Direto.', instructions: 'Ajude.',
    avatarKind: 'gallery', avatarRef: name.toLowerCase(), runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  if (coordination) h.product.updatePersona({ ...h.product.getPersona(id)!, systemRoles: ['coordination'] }, 'sp')
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

/** The shared project, two members, two personas, one DM per pair, and Bento working on a Task Ana asked for in #geral. */
function world(): PersonaHost {
  const h = openJourney()
  seedJourney(h)
  h.createProject({ id: 'sp', workspaceId: 'ws', name: 'Padaria Lua', description: 'compartilhado' })
  h.createMember({ id: 'bia', ...SP, displayName: 'Bia', handle: 'bia', role: 'member' })
  persona(h, 'bento', 'Bento', 'Engenharia', true)
  persona(h, 'nina', 'Nina', 'Design', false)
  for (const [dm, human, ai] of [['dm-ana-bento', 'ana', 'bento'], ['dm-bia-bento', 'bia', 'bento'], ['dm-ana-nina', 'ana', 'nina'], ['dm-bia-nina', 'bia', 'nina']] as const) {
    h.createDm({ id: dm, ...SP, participantA: human, participantB: ai })
  }
  const task: Ticket = {
    id: 't-run', title: TITLE, decisionId: 'd-run',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: 't-run-a1', state: 'running', createdAt: ASKED_AT, startedAt: ASKED_AT }], inputs: [], undelivered: [],
    createdAt: ASKED_AT, updatedAt: ASKED_AT, origin: { triggerId: 'm-old', triggerIds: ['m-old'] },
    execution: { name: 'Bento', directory: '.', assignment: 'Faça o relatório do dia' },
  }
  h.orchestration.runtime('sp').repo.tickets.save(task)
  h.orchestration.warmRunners.set('sp:bento:task', runningRunner())
  h.orchestration.budget.running.set('sp', 1)
  return h
}

let serial = 0

/** Write in a DM as `who`; return the lines the persona answered with (id → body), as `who` reads them. */
async function sayInDm(h: PersonaHost, dm: string, who: string, body: string): Promise<{ id: string; lines: Array<[string, string]> }> {
  serial += 1
  const id = `u${String(serial)}`
  h.sessionMemberId = who
  h.postMessage({ id, ...SP, streamKind: 'dm', ownerId: dm, body, actorId: who, subjectId: '' })
  await h.orchestration.flush('sp')
  const events = h.listMessages({ ...SP, streamKind: 'dm', ownerId: dm, actorId: who, afterSeq: 0, limit: 200 }).events
  return { id, lines: events.filter(item => item.actorId !== who && item.id.includes(id)).map(item => [item.id, item.body]) }
}

const busyLine = (said: { id: string; lines: Array<[string, string]> }): string | undefined =>
  said.lines.find(([lineId]) => lineId === `coord-${said.id}-busy`)?.[1]

describe('D-079 / CONV-2 — "estou terminando uma tarefa" não revela o título a quem não pode lê-lo (projeto compartilhado)', () => {
  it('[BUSY-1] na DM do 2º membro (Bia) com a MESMA persona da Tarefa: a linha vem SEM o título', async () => {
    const h = world()
    const said = await sayInDm(h, 'dm-bia-bento', 'bia', 'Como você está?')
    expect(busyLine(said), `lines: ${JSON.stringify(said.lines)}`).toBe(LINE_SAME_PERSONA_NO_TITLE)
    expect(JSON.stringify(said.lines)).not.toContain(TITLE)
    expect(said.lines.filter(([lineId]) => lineId.endsWith('-busy')), 'one busy line per message').toHaveLength(1)
  })

  it('[BUSY-2] na DM da dona (Ana, quem pediu a Tarefa): a linha mantém o título entre aspas', async () => {
    const h = world()
    const said = await sayInDm(h, 'dm-ana-bento', 'ana', 'Como você está?')
    expect(busyLine(said), `lines: ${JSON.stringify(said.lines)}`).toBe(LINE_SAME_PERSONA_TITLE)
  })

  it('[BUSY-3] OUTRA persona (Nina) na DM da Bia: "A equipe está terminando uma tarefa" sem título; na DM da Ana, com título', async () => {
    const h = world()
    const bia = await sayInDm(h, 'dm-bia-nina', 'bia', 'Como você está?')
    expect(busyLine(bia), `lines: ${JSON.stringify(bia.lines)}`).toBe(LINE_OTHER_PERSONA_NO_TITLE)
    expect(JSON.stringify(bia.lines)).not.toContain(TITLE)
    const ana = await sayInDm(h, 'dm-ana-nina', 'ana', 'Como você está?')
    expect(busyLine(ana), `lines: ${JSON.stringify(ana.lines)}`).toBe(LINE_OTHER_PERSONA_TITLE)
  })

  it('[BUSY-4] ninguém lê a DM do outro: a Ana não vê a conversa da Bia, nem a Bia a da Ana, e o título só aparece onde a linha o diz', async () => {
    const h = world()
    await sayInDm(h, 'dm-bia-bento', 'bia', 'Como você está?')
    await sayInDm(h, 'dm-ana-bento', 'ana', 'Como você está?')
    h.sessionMemberId = 'bia'
    const biaReads = h.listMessages({ ...SP, streamKind: 'dm', ownerId: 'dm-bia-bento', actorId: 'bia', afterSeq: 0, limit: 200 }).events
    expect(biaReads.map(item => item.body).join('\n')).not.toContain(TITLE)
    expect(h.listMessages({ ...SP, streamKind: 'dm', ownerId: 'dm-ana-bento', actorId: 'bia', afterSeq: 0, limit: 200 }).events).toEqual([])
    h.sessionMemberId = 'ana'
    expect(h.listMessages({ ...SP, streamKind: 'dm', ownerId: 'dm-bia-bento', actorId: 'ana', afterSeq: 0, limit: 200 }).events).toEqual([])
  })
})
