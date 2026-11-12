import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { createMcpGateway, toolSignature, type McpGateway, type PersonaToolHooks } from '@deepseek-ai/dsh-persona-runners'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { harnessMcpPorts } from '../src/harness-dispatch.ts'
import { offeredToolNames, productToolsOpener, type ProductToolsRules } from '../src/harness-turn.ts'
import { StableTools } from '../src/tool-stability.ts'
import { it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * Item 9a "ferramentas estáveis no pool quente" (Tally, 11/11), the host wiring: the tool list a persona is offered turn after turn is what a warm CLI session is keyed by
 * (`toolSignature`), so a list that follows each request's words rebuilds the session every time the words change. With the memory the list changes ONCE.
 * Real MCP gateway and the real opener; no CLI, no model.
 */
const hooks: PersonaToolHooks = { report: () => {}, recall: () => '', ask: () => {} }

const REQUESTS = [
  'Escreva o texto da página inicial', // lean
  'Mova o cartão da faixa Agora para Fazendo', // board
  'Escreva o texto da página inicial', // lean again
  'Crie uma rotina que resuma o dia toda segunda-feira', // routines
  'Escreva o texto da página inicial',
  'Abra um sprint para a semana e coloque as tarefas dele', // sprints
  'Escreva o texto da página inicial',
]

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

function rig(): { gateway: McpGateway; taskTextOf: ProductToolsRules['taskTextOf']; h: PersonaHost } {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'nina', name: 'Nina', title: 'Pesquisa' }])
  const rt = h.orchestration.runtime('pp')
  REQUESTS.forEach((request, at) => { rt.repo.tickets.save(ticket(`t${String(at)}`, request)) })
  const gateway = createMcpGateway({ hooks, harness: harnessMcpPorts(h.harness), onlyWired: true })
  return { gateway, h, taskTextOf: id => rt.repo.tickets.get(id)?.execution?.assignment ?? '' }
}
const turn = (at: number) => ({ personaId: 'nina', ticketId: `t${String(at)}`, assignmentId: `a-t${String(at)}`, cwd: 'C:/tmp' })

/** The signature of the list each turn is offered, and how many times it changed from one turn to the next. */
async function churn(rules: ProductToolsRules, toolLevel: 'write' | 'none', gateway: McpGateway): Promise<{ signatures: string[]; changes: number; names: string[][] }> {
  const open = productToolsOpener({ gateway, toolLevel, ...rules })
  const signatures: string[] = []
  const names: string[][] = []
  for (let at = 0; at < REQUESTS.length; at += 1) {
    const set = open(turn(at))
    signatures.push(toolSignature(set))
    names.push((set?.tools ?? []).map(tool => tool.name).sort())
    await set?.close?.()
  }
  return { signatures, names, changes: signatures.filter((sig, at) => at > 0 && sig !== signatures[at - 1]).length }
}

it('MEASURE: a week of mixed requests rebuilds the warm session on almost every turn today, and ONCE with the memory', async () => {
  const { gateway, taskTextOf } = rig()
  const before = await churn({ taskTextOf }, 'write', gateway)
  const after = await churn({ taskTextOf, stable: { memory: new StableTools(), key: 'pp:nina' } }, 'write', gateway)
  expect(before.changes).toBe(6) // lean, board, lean, routines, lean, sprints, lean: every turn is a different list
  expect(after.changes).toBe(1) // lean, then with the board/sprint/routine tools for good
  expect(after.signatures[0]).toBe(before.signatures[0]) // the first (lean) list is exactly the old one
  expect(after.names.slice(1).every(list => list.includes('board_card_move') && list.includes('routine_create') && list.includes('sprint_create'))).toBe(true)
  expect(after.names.flat()).not.toContain('persona_hire') // hiring stays by the words of the request
  process.stdout.write(`[item9a] trocas de lista de ferramentas em ${String(REQUESTS.length)} turnos da mesma persona: ${String(before.changes)} antes -> ${String(after.changes)} depois (cada troca reabre a sessão quente da CLI)\n`)
})

it('the record of the turn (offeredToolNames) says exactly what the opener announces, with and without the memory', async () => {
  const { gateway, taskTextOf } = rig()
  const stable = { memory: new StableTools(), key: 'pp:nina' }
  const rules: ProductToolsRules = { taskTextOf, stable }
  const open = productToolsOpener({ gateway, toolLevel: 'write', ...rules })
  for (let at = 0; at < REQUESTS.length; at += 1) {
    const offered = offeredToolNames(rules, 'write', turn(at)).sort()
    const set = open(turn(at))
    expect((set?.tools ?? []).map(tool => tool.name).sort()).toEqual(offered)
    await set?.close?.()
  }
})

it('the grant still caps what is announced: a persona with NO grant is never handed the board, sprints or routines, widened memory or not', async () => {
  const { gateway, taskTextOf } = rig()
  const stable = { memory: new StableTools(), key: 'pp:nina' }
  const widened = await churn({ taskTextOf, stable }, 'none', gateway)
  expect(widened.names.flat().filter(name => name !== 'persona_ask')).toEqual([])
  expect(widened.changes).toBe(0) // and her list never moved either
})

it('another persona is not widened by this one\'s board request (the memory is per persona)', async () => {
  const { gateway, taskTextOf } = rig()
  const memory = new StableTools()
  await churn({ taskTextOf, stable: { memory, key: 'pp:nina' } }, 'write', gateway)
  const other = productToolsOpener({ gateway, toolLevel: 'write', taskTextOf, stable: { memory, key: 'pp:teo' } })
  const set = other(turn(0)) // a plain request for a different persona
  expect((set?.tools ?? []).map(tool => tool.name)).toEqual(['persona_ask'])
  await set?.close?.()
})
