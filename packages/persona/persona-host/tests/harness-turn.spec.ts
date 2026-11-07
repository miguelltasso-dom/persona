import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { createMcpGateway, type McpGateway, type PersonaToolHooks } from '@deepseek-ai/dsh-persona-runners'
import { expect, onTestFinished } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { harnessMcpPorts } from '../src/harness-dispatch.ts'
import { harnessToolsNeeded, productToolsOpener } from '../src/harness-turn.ts'
import type { HostRunnerRequest } from '../src/runner.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * HT-0 (3), the host wiring (OFF by default): the product tools reach a Task's turn only when the request needs them, only on a
 * CLI Task, and only with the flag. The CLI hop itself (OAR `toolsFor`) is Rivet's proof; here the host side is exact.
 */

const hooks: PersonaToolHooks = { report: () => {}, recall: () => '', ask: () => {} }

it('the words of a request decide which tools are worth their tokens: nothing for a plain Task', () => {
  expect(harnessToolsNeeded('Escreva o texto da página inicial')).toEqual([])
  expect(harnessToolsNeeded('Mova o cartão da faixa Agora para Fazendo')).toEqual(['board_list', 'board_card_move'])
  expect(harnessToolsNeeded('Abra um sprint para a semana e coloque as tarefas dele')).toEqual(['board_list', 'sprint_list', 'sprint_create', 'sprint_plan', 'sprint_start', 'sprint_close'])
  expect(harnessToolsNeeded('Crie uma rotina que resuma o dia toda segunda-feira')).toEqual(['routine_list', 'routine_create', 'routine_update', 'routine_pause'])
  expect(harnessToolsNeeded('me lembre disso todo dia às 9h')).toContain('routine_create')
  const both = harnessToolsNeeded('Crie um sprint e uma rotina semanal')
  expect(both).toContain('sprint_create')
  expect(both).toContain('routine_create')
})

function ticket(id: string, request: string): Ticket {
  const at = '2026-11-03T14:00:00.000Z'
  return {
    id, title: request.slice(0, 40), decisionId: `d-${id}`,
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: `a-${id}`, state: 'running', createdAt: at, startedAt: at }], inputs: [], undelivered: [],
    createdAt: at, updatedAt: at, origin: { triggerId: `m-${id}`, triggerIds: [`m-${id}`] },
    execution: { name: 'Nina', directory: '.', assignment: request },
  }
}

function rig(): { h: PersonaHost; gateway: McpGateway; open: ReturnType<typeof productToolsOpener> } {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'nina', name: 'Nina', title: 'Pesquisa' }])
  h.orchestration.events.append({ id: 'm-t-board', ...SCOPE, streamKind: 'channel', ownerId: 'geral', type: 'message', body: 'pedido', actorId: 'ana', subjectId: '', occurredAt: '2026-11-03T13:00:00.000Z' })
  const rt = h.orchestration.runtime('pp')
  rt.repo.tickets.save(ticket('t-board', 'Mova o cartão da faixa Agora para Fazendo'))
  rt.repo.tickets.save(ticket('t-plain', 'Escreva o texto da página inicial'))
  const gateway = createMcpGateway({ hooks, harness: harnessMcpPorts(h.harness), onlyWired: true })
  const open = productToolsOpener({
    gateway, toolLevel: 'write',
    taskTextOf: ticketId => rt.repo.tickets.get(ticketId)?.execution?.assignment ?? '',
  })
  return { h, gateway, open }
}
const turn = (ticketId: string) => ({ personaId: 'nina', ticketId, assignmentId: `a-${ticketId}`, cwd: 'C:/tmp' })

it('a Task that needs the board gets the board tools (and persona_ask, which every worker has) on its turn lease, and a call really moves the card', async () => {
  const { h, open } = rig()
  const set = open(turn('t-board'))
  expect(set?.server).toBe('persona')
  expect(set?.tools.map(tool => tool.name).sort()).toEqual(['board_card_move', 'board_list', 'persona_ask']) // no other persona_*, no sprint_*, no routine_*
  const columns = Object.fromEntries(h.getProjectBoard(SCOPE).workflow.columns.map(column => [column.category, column.id]))
  const byName = (name: string) => set!.tools.find(tool => tool.name === name)!
  const listed = await byName('board_list').handler({})
  expect(JSON.parse(listed.content)).toMatchObject({ ok: true })
  const moved = await byName('board_card_move').handler({ ticketId: 't-board', columnId: columns.doing })
  expect(JSON.parse(moved.content)).toMatchObject({ ok: true, moved: { ticketId: 't-board' } })
  expect(h.getProjectBoard(SCOPE).cards.find(card => card.ticketId === 't-board')?.columnId).toBe(columns.doing)
  await set!.close?.()
})

it('a plain Task gets ONLY persona_ask (every worker may ask the person), and the lease closes with the turn', async () => {
  const { open } = rig()
  const set = open(turn('t-plain'))
  expect(set?.tools.map(tool => tool.name)).toEqual(['persona_ask'])
  await set?.close?.()
})

it('a request that talks about hiring also gets persona_hire (HT-6), and no other request does', () => {
  for (const text of ['Contrate alguém para cuidar do texto', 'preciso recrutar uma nova pessoa para a mídia', 'queremos um novo colega no design']) {
    expect(harnessToolsNeeded(text), text).toContain('persona_hire')
  }
  for (const text of ['Faça o relatório do dia', 'Escreva o texto da página inicial', 'organize o quadro']) {
    expect(harnessToolsNeeded(text), text).not.toContain('persona_hire')
  }
})

it('the persona\'s grant caps it: with NO grant the board, sprints, routines and hiring are never handed over — only persona_ask (coordination, D-097); with no team rule that is all', () => {
  const { h, gateway } = rig()
  const rt = h.orchestration.runtime('pp')
  const readOnly = productToolsOpener({ gateway, toolLevel: 'none', taskTextOf: id => rt.repo.tickets.get(id)?.execution?.assignment ?? '' })
  const set = readOnly(turn('t-board'))
  expect((set?.tools ?? []).map(tool => tool.name)).toEqual(['persona_ask']) // a persona without a file/shell grant still asks the person
  void set?.close?.()
})

it('the host hands the opener to a Task\'s runner request ONLY with the flag, only for a CLI Task, never for conversation', async () => {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  const scripted = h.orchestration.scripted
  h.orchestration.scripted = false
  onTestFinished(() => { h.orchestration.scripted = scripted })
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name] of [['p1', 'Guia'], ['p2', 'Nina']] as const) {
    h.createPersona({
      id, ...SCOPE, name, title: 'Cargo', description: 'x', personality: 'Direta.', instructions: 'Prove.', avatarKind: 'gallery', avatarRef: name.toLowerCase(),
      runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: false, createdBy: 'ana',
    })
  }
  h.product.updatePersona({ ...h.product.getPersona('p1')!, systemRoles: ['coordination'] }, 'pp')
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
  h.sessionMemberId = 'ana'
  const seen: HostRunnerRequest[] = []
  h.orchestration.runnerFactory = (request) => {
    if (request !== undefined) seen.push(request)
    return Promise.resolve(createFakeRunner())
  }
  const opener = () => undefined
  h.orchestration.productToolsOf = () => opener
  h.postMessage({ id: 'm1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Nina preciso que você mova o cartão da faixa para Fazendo e me avise', actorId: 'ana', subjectId: 'm1' })
  await h.orchestration.flush('pp')
  const tasks = seen.filter(request => request.personId === 'p2' && request.purpose === 'task')
  expect(tasks.length).toBeGreaterThan(0)
  expect(tasks.every(request => request.productTools === opener)).toBe(true)
  expect(seen.filter(request => request.purpose !== 'task').every(request => request.productTools === undefined)).toBe(true) // conversation / answer-only: never
  // Flag OFF (the default): the host leaves the opener unset and the request carries nothing.
  h.orchestration.productToolsOf = undefined
  h.orchestration.warmRunners.clear()
  seen.length = 0
  h.postMessage({ id: 'm2', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Nina preciso de um texto novo para a página inicial', actorId: 'ana', subjectId: 'm2' })
  await h.orchestration.flush('pp')
  expect(seen.filter(request => request.purpose === 'task').every(request => request.productTools === undefined)).toBe(true)
})
