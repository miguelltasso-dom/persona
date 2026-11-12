/**
 * HONEST-1 (Atlas 11/11), block 3: `never-hire` — "contratar direto" is the ONE way a persona brings someone to the team without the person's card.
 * With the house rule saved, that shortcut is closed whatever the persona's autonomy or the "Contratar direto" switch: the hire is ALWAYS a card in
 * Aprovações, nobody joins before the person decides, and the rule's book counts the shortcut it closed. Same rig as HT-6 (`harness-hiring.spec.ts`).
 */
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { createMcpGateway, type McpGateway, type PersonaToolHooks } from '@deepseek-ai/dsh-persona-runners'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { harnessMcpPorts } from '../src/harness-dispatch.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

const hooks: PersonaToolHooks = { report: () => {}, recall: () => '', ask: () => {} }

function ticket(id: string, trigger: string, owner: string): Ticket {
  const at = '2026-11-03T14:00:00.000Z'
  return {
    id, title: `Tarefa ${id}`, decisionId: `d-${id}`,
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: `a-${id}`, state: 'running', createdAt: at, startedAt: at }], inputs: [], undelivered: [],
    createdAt: at, updatedAt: at, origin: { triggerId: trigger, triggerIds: [trigger] },
    execution: { name: owner, directory: '.', assignment: `Tarefa ${id}` },
  }
}

function rig(): { h: PersonaHost; gw: McpGateway } {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Pesquisa', canRecruit: true },
  ])
  h.sessionMemberId = 'ana'
  h.orchestration.events.append({ id: 'm-person', ...SCOPE, streamKind: 'channel', ownerId: 'geral', type: 'message', body: 'contrate alguém para o texto', actorId: 'ana', subjectId: '', occurredAt: '2026-11-04T11:00:00.000Z' })
  h.orchestration.runtime('pp').repo.tickets.save(ticket('t-person', 'm-person', 'Nina'))
  const gw = createMcpGateway({ hooks, harness: harnessMcpPorts(h.harness, { onActivity: () => {} }), onlyWired: true })
  return { h, gw }
}

function turn(gw: McpGateway, personaId: string, ticketId: string) {
  const lease = gw.openTurn({ run: { personaId, ticketId, assignmentId: `a-${ticketId}` }, toolLevel: 'write', worktree: 'C:/tmp' })
  return {
    call: async (name: string, args: Record<string, unknown> = {}) => JSON.parse((await gw.call(lease.token, name, args)).content) as Record<string, unknown> & { ok: boolean; status?: string },
  }
}

const hired = (h: PersonaHost) => h.product.listPersonas('pp').filter(persona => persona.id.startsWith('hire:'))
const cards = (h: PersonaHost) => h.screens.listApprovals('pp').filter(card => card.kind === 'hire')
const WANT = { name: 'Bolota', title: 'Redação', description: 'Escreve os textos da campanha.' }
const rule = (h: PersonaHost, kind?: 'never-hire') => h.putTriageRule({
  ...SCOPE, id: 'r-hire', gateText: 'Nunca contratar sem mim.', assessmentText: '', logOnly: false, speculativeEnabled: false, ...(kind === undefined ? {} : { kind }),
})

it('control: with "Contratar direto" ON and the person\'s own request, the hire is DIRECT (so the rule below is what closes it)', async () => {
  const { h, gw } = rig()
  h.hireDirect.set('pp', 'nina', true)
  expect(await turn(gw, 'nina', 't-person').call('persona_hire', WANT)).toMatchObject({ ok: true, status: 'hired' })
  expect(hired(h)).toHaveLength(1)
})

it('never-hire: the same call is a CARD, nobody joins, and the rule counts the shortcut it closed', async () => {
  const { h, gw } = rig()
  h.hireDirect.set('pp', 'nina', true)
  rule(h, 'never-hire')
  expect(await turn(gw, 'nina', 't-person').call('persona_hire', WANT)).toMatchObject({ ok: true, status: 'pending' })
  expect(hired(h)).toHaveLength(0)
  expect(cards(h)).toHaveLength(1)
  expect(h.listTriageRules(SCOPE)[0]!.applied).toMatchObject({ total: 1, thisWeek: 1, lastWhat: 'contratar Bolota direto' })
})

it('a hire that was a card anyway is not counted (the rule only counts what it changed)', async () => {
  const { h, gw } = rig() // "Contratar direto" is OFF here
  rule(h, 'never-hire')
  expect(await turn(gw, 'nina', 't-person').call('persona_hire', WANT)).toMatchObject({ ok: true, status: 'pending' })
  expect(h.listTriageRules(SCOPE)[0]!.applied).toEqual({ total: 0, thisWeek: 0 })
})

it('a rule that is only text does not close the shortcut (and says it is not enforced)', async () => {
  const { h, gw } = rig()
  h.hireDirect.set('pp', 'nina', true)
  expect(rule(h).enforced).toBe(false)
  expect(await turn(gw, 'nina', 't-person').call('persona_hire', WANT)).toMatchObject({ ok: true, status: 'hired' })
})
