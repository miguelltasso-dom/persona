import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { harnessMcpPorts } from '../src/harness-dispatch.ts'
import { HarnessForbidden, type HarnessIdentity } from '../src/harness-routines.ts'
import type { HarnessPorts } from '../src/harness-ports.ts'
import { it, openJourney, seedJourney, seedProject } from './journeys/journey-host.ts'

/**
 * Marco dogfood M3 (C6, a cerca entre projetos): "a responsavel de A nunca le nem move nada do quadro de B" (criterio 3, a cerca do R2).
 * A persona pertence a UM projeto. Quem chama as portas do quadro (o laco autonomo do Flint) entrega a IDENTIDADE (persona + projeto). Uma identidade que nomeia um projeto que NAO e o da persona
 * (a Nina de A "como Nina" em B) e recusada em TODA porta, com codigo estavel, sem ler e sem mudar nada do outro projeto. As ESCRITAS ja eram cercadas (`authorize`); a LEITURA nao era (board_list,
 * sprint_list, rotinas): a Nina de A lia o quadro inteiro de B.
 */

const A = { workspaceId: 'ws', projectId: 'pp' } as const
const B = { workspaceId: 'ws', projectId: 'pb' } as const

function card(id: string, title: string, owner: string | undefined): Ticket {
  const at = '2026-11-04T11:00:00.000Z'
  return {
    id, title, decisionId: `d-${id}`,
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'owner' }, scope: 'small' },
    channels: [], assignments: [{ id: `a-${id}`, state: 'pending', createdAt: at }], inputs: [], undelivered: [],
    createdAt: at, updatedAt: at, origin: { triggerId: `m-${id}`, triggerIds: [`m-${id}`] },
    ...(owner === undefined ? {} : { execution: { name: owner, directory: '.', assignment: title } }),
  }
}

/** Two projects with their own board and team: A (loja: Nina responsavel) and B (obra: Beto responsavel). */
function twoProjects(): PersonaHost {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, [
    { id: 'nina', name: 'Nina', title: 'Coordenação', coordination: true },
    { id: 'lia', name: 'Lia', title: 'Pesquisa' },
  ])
  seedProject(h, {
    id: 'pb', name: 'Obra', template: 'simples',
    team: [{ id: 'beto', name: 'Beto', title: 'Coordenação', coordination: true }, { id: 'caio', name: 'Caio', title: 'Engenharia' }],
  })
  h.orchestration.runtime('pp').repo.tickets.save(card('tk-a', 'Vitrine da loja', 'Lia'))
  h.orchestration.runtime('pb').repo.tickets.save(card('tk-b', 'Laje do segundo andar', 'Caio'))
  return h
}

let call = 0
const identity = (project: { readonly projectId: string }, personaId: string, extra: Partial<HarnessIdentity> = {}): HarnessIdentity => ({
  workspaceId: 'ws', projectId: project.projectId, personaId, initiator: 'persona-initiative', autonomy: 'act', callId: `c${String((call += 1))}`, ...extra,
})
const columns = (h: PersonaHost, project: { readonly workspaceId: string; readonly projectId: string }): Record<string, string> =>
  Object.fromEntries(h.getProjectBoard(project).workflow.columns.map(column => [column.category, column.id]))
const board = (h: PersonaHost): string => JSON.stringify(h.getProjectBoard(B))
const sprintsOfB = (h: PersonaHost): string => JSON.stringify(h.listSprints(B))

it('a Nina de A nomeando o quadro de B: nao le, nao move, nao planeja; o quadro de B fica IDENTICO (iniciativa propria e a pedido da pessoa)', () => {
  const h = twoProjects()
  const { boards, routines } = h.harness
  const col = columns(h, B)
  const before = { board: board(h), sprints: sprintsOfB(h) }
  for (const extra of [{}, { initiator: 'person-request', requestId: 'm1' }] as Partial<HarnessIdentity>[]) {
    const forged = (): HarnessIdentity => identity(B, 'nina', extra)
    expect(() => boards.read(forged()), 'read').toThrow(HarnessForbidden)
    expect(() => boards.sprints(forged()), 'sprints').toThrow(HarnessForbidden)
    expect(() => routines!.list(forged()), 'routines.list').toThrow(HarnessForbidden)
    expect(boards.moveCard(forged(), { ticketId: 'tk-b', columnId: col.doing! }), 'moveCard').toMatchObject({ ok: false, code: 'forbidden' })
    expect(boards.createSprint(forged(), { name: 'Sprint da Nina', objective: 'mexer na obra' }), 'createSprint').toMatchObject({ ok: false, code: 'forbidden' })
    expect(boards.planSprint(forged(), { sprintId: 'x', ticketIds: ['tk-b'] }), 'planSprint').toMatchObject({ ok: false, code: 'forbidden' })
    expect(boards.startSprint(forged(), { sprintId: 'x' }), 'startSprint').toMatchObject({ ok: false, code: 'forbidden' })
    expect(boards.closeSprint(forged(), { sprintId: 'x', leftover: 'backlog' }), 'closeSprint').toMatchObject({ ok: false, code: 'forbidden' })
    expect(routines!.create(forged(), { name: 'Rotina da Nina', prompt: 'olhar a obra', schedule: { frequency: 'daily', time: '09:00' } }), 'routines.create').toMatchObject({ ok: false, code: 'forbidden' })
    expect(routines!.pause(forged(), { id: 'qualquer', paused: true }), 'routines.pause').toMatchObject({ ok: false, code: 'forbidden' })
    expect(h.harness.hiring!.hire(forged(), { name: 'Intrusa', title: 'Pesquisa', description: 'nao deveria entrar em B' }), 'hire').toMatchObject({ ok: false, code: 'forbidden' })
  }
  expect({ board: board(h), sprints: sprintsOfB(h) }).toEqual(before) // nada mudou em B
  expect(h.harness.routines!.list(identity(B, 'beto')).every(row => row.projectId === 'pb')).toBe(true) // e B segue legivel por quem e DE B
})

it('o inverso: o Beto de B no quadro de A tambem e recusado (a cerca vale nos dois sentidos)', () => {
  const h = twoProjects()
  const beforeA = JSON.stringify(h.getProjectBoard(A))
  const forged = identity(A, 'beto')
  expect(() => h.harness.boards.read(forged)).toThrow(HarnessForbidden)
  expect(h.harness.boards.moveCard(forged, { ticketId: 'tk-a', columnId: columns(h, A).doing! })).toMatchObject({ ok: false, code: 'forbidden' })
  expect(JSON.stringify(h.getProjectBoard(A))).toBe(beforeA)
})

it('controle: a mesma Nina DENTRO do projeto dela le e move (a cerca nao e "tudo recusado")', () => {
  const h = twoProjects()
  const own = identity(A, 'nina', { initiator: 'person-request', requestId: 'm1' })
  expect(h.harness.boards.read(own).cards.map(item => item.ticketId)).toContain('tk-a')
  expect(h.harness.boards.moveCard(own, { ticketId: 'tk-a', columnId: columns(h, A).doing! })).toMatchObject({ ok: true }) // a coordenacao cobre o cartao da Lia
  expect(h.harness.routines!.list(identity(B, 'beto')).length).toBeGreaterThan(0)
})

it('uma persona que nao existe e uma persona de outro workspace sao ninguem: nem lem', () => {
  const h = twoProjects()
  expect(() => h.harness.boards.read(identity(A, 'fantasma'))).toThrow(HarnessForbidden)
  expect(() => h.harness.boards.sprints(identity(B, ''))).toThrow(HarnessForbidden)
})

it('na ferramenta (board_list / sprint_list / routine_list) a recusa vira o `forbidden` tipado, nunca uma excecao nem dados do outro projeto', async () => {
  const h = twoProjects()
  const forged = identity(B, 'nina')
  const harness = { ...h.harness, identityOf: () => forged, boards: h.harness.boards, routines: h.harness.routines } as unknown as HarnessPorts
  const tools = harnessMcpPorts(harness)
  const run = { personaId: 'nina', ticketId: 'tk-a', assignmentId: 'a-tk-a' }
  for (const tool of ['board_list', 'sprint_list', 'routine_list'] as const) {
    const answer = await tools.call!({ tool, args: {}, run, callId: `t-${tool}` })
    expect(JSON.parse(answer), tool).toMatchObject({ ok: false, code: 'forbidden' })
    expect(answer, tool).not.toContain('Laje do segundo andar') // nenhum titulo do quadro de B
  }
})
