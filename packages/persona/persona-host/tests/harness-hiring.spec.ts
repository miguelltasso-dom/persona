import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { createMcpGateway, type McpGateway, type PersonaToolHooks } from '@deepseek-ai/dsh-persona-runners'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { canSaveFiles } from '../src/file-tools.ts'
import { harnessMcpPorts, type AnyActivity } from '../src/harness-dispatch.ts'
import { MAX_DIRECT_HIRES_PER_DAY, MAX_OPEN_HIRE_CARDS, MAX_TEAM_SIZE } from '../src/harness-hiring.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * HT-6 (D-084): `persona_hire`. Only a persona the person allowed to hire; EVERY hire is a card in Aprovações unless she turned
 * “Contratar direto” on for that persona (and then only on her request or under `act`, inside the daily limit); the new persona never has more
 * access than the one who hired her; the same call twice is one card; nothing is dropped in silence.
 */

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

interface Rig { h: PersonaHost; gw: McpGateway; activity: AnyActivity[] }

function rig(): Rig {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Pesquisa', canRecruit: true },
    { id: 'bento', name: 'Bento', title: 'Engenharia' },
  ])
  h.sessionMemberId = 'ana'
  h.orchestration.events.append({ id: 'm-person', ...SCOPE, streamKind: 'channel', ownerId: 'geral', type: 'message', body: 'contrate alguém para o texto', actorId: 'ana', subjectId: '', occurredAt: '2026-11-03T13:59:00.000Z' })
  const rt = h.orchestration.runtime('pp')
  rt.repo.tickets.save(ticket('t-person', 'm-person', 'Nina')) // Ana asked
  rt.repo.tickets.save(ticket('t-system', 'initiative:run-9', 'Nina')) // the team's own initiative
  rt.repo.tickets.save(ticket('t-bento', 'initiative:run-8', 'Bento'))
  const activity: AnyActivity[] = []
  const gw = createMcpGateway({ hooks, harness: harnessMcpPorts(h.harness, { onActivity: (_who, row) => { activity.push(row) } }), onlyWired: true })
  return { h, gw, activity }
}

function turn(gw: McpGateway, personaId: string, ticketId: string) {
  const lease = gw.openTurn({ run: { personaId, ticketId, assignmentId: `a-${ticketId}` }, toolLevel: 'write', worktree: 'C:/tmp' })
  return {
    names: gw.list(lease.token),
    call: async (name: string, args: Record<string, unknown> = {}) => JSON.parse((await gw.call(lease.token, name, args)).content) as Record<string, unknown> & { ok: boolean; code?: string; message?: string; status?: string; hire?: { id: string; name: string; title: string } },
  }
}
const setMode = (h: PersonaHost, personaId: string, mode: 'asked' | 'propose' | 'act'): void => {
  h.setAutonomy({ ...SCOPE, personaId, mode, proposalBudget: 3, tokenBudget: 1, executionBudget: 1, silenceStart: '', silenceEnd: '' })
}
const cards = (h: PersonaHost) => h.screens.listApprovals('pp').filter(card => card.kind === 'hire')
const hired = (h: PersonaHost, by: string) => h.product.listPersonas('pp').filter(persona => persona.id.startsWith('hire:') && persona.createdBy === by)
const WANT = { name: 'Bolota', title: 'Redação', description: 'Escreve os textos da campanha.' }

it('only a persona the person allowed to hire: the others are told so, in a sentence, and nothing is written', async () => {
  const { h, gw } = rig()
  const bento = turn(gw, 'bento', 't-bento')
  const refused = await bento.call('persona_hire', WANT)
  expect(refused).toMatchObject({ ok: false, code: 'forbidden', message: 'Você não contrata pessoas; peça à Coordenação ou à pessoa.' })
  expect(cards(h)).toHaveLength(0)
  expect(h.product.listPersonas('pp')).toHaveLength(3)
})

it('Nina may hire: the tool is announced, and the answer is a CARD in Aprovações — nobody joins until the person approves', async () => {
  const { h, gw, activity } = rig()
  const nina = turn(gw, 'nina', 't-person')
  expect(nina.names).toContain('persona_hire')
  const result = await nina.call('persona_hire', { ...WANT, reason: 'O texto da campanha está atrasado.' })
  expect(result).toMatchObject({ ok: true, status: 'pending', undoable: true })
  expect(result.hire?.name).toBe('Bolota')
  const [card] = cards(h)
  expect(card).toMatchObject({ kind: 'hire', status: 'pending', personaId: 'nina', personaName: 'Nina', title: 'Bolota', roleTitle: 'Redação', reason: 'O texto da campanha está atrasado.' })
  expect(h.product.listPersonas('pp').some(persona => persona.name === 'Bolota')).toBe(false) // not hired yet
  expect(activity).toHaveLength(1)
  expect(activity[0]).toMatchObject({ verb: 'persona_hire', after: 'Aguardando a sua aprovação', undoable: true, initiator: 'person-request', requestId: 'm-person' })
  expect(activity[0]).toMatchObject({ undo: { remote: 'decideApproval', request: { id: card?.id, kind: 'hire', accept: false } } })
})

it('there is no invented reason: without one the card says none', async () => {
  const { h, gw } = rig()
  await turn(gw, 'nina', 't-person').call('persona_hire', WANT)
  expect(cards(h)[0]?.reason).toBeUndefined()
})

it('the person approves: the new persona exists, was made by Nina, and has NO more access than she does (no tools, no skills, no hiring)', async () => {
  const { h, gw } = rig()
  const result = await turn(gw, 'nina', 't-person').call('persona_hire', WANT)
  h.screens.decide({ workspaceId: 'ws', projectId: 'pp', id: result.hire?.id ?? '', kind: 'hire', accept: true })
  const [bolota] = hired(h, 'nina')
  expect(bolota).toMatchObject({ name: 'Bolota', title: 'Redação', canRecruit: false })
  expect(bolota?.tools).toEqual(canSaveFiles(h.product.getPersona('nina')!.tools) ? { files: 'write' } : {}) // the hirer's own grant at most (D-099)
  expect(bolota?.skills).toEqual([])
})

it('the person says no (or the persona cancels via the activity): nobody is hired', async () => {
  const { h, gw, activity } = rig()
  await turn(gw, 'nina', 't-person').call('persona_hire', WANT)
  const undo = (activity[0] as unknown as { undo?: { request: Parameters<PersonaHost['screens']['decide']>[0] } }).undo
  h.screens.decide(undo!.request)
  expect(cards(h)[0]?.status).toBe('rejected')
  expect(hired(h, 'nina')).toHaveLength(0)
})

it('the same call twice is ONE card and ONE activity (a retry never hires twice)', async () => {
  const { h, activity } = rig()
  const ports = harnessMcpPorts(h.harness, { onActivity: (_who, row) => { activity.push(row) } })
  const call = { tool: 'persona_hire' as const, run: { personaId: 'nina', ticketId: 't-person', assignmentId: 'a-t-person' }, args: WANT, callId: 'same-call' }
  const first = JSON.parse(await ports.call!(call)) as { ok: boolean; status: string }
  const again = JSON.parse(await ports.call!(call)) as { ok: boolean; status: string }
  expect(first).toMatchObject({ ok: true, status: 'pending' })
  expect(again).toMatchObject({ ok: true, status: 'pending' })
  expect(cards(h)).toHaveLength(1)
  expect(activity).toHaveLength(1)
})

it('the name and face on the card are never those of someone already on the team (A-4)', async () => {
  const { h, gw } = rig()
  await turn(gw, 'nina', 't-person').call('persona_hire', { ...WANT, name: 'Bento' })
  expect(cards(h)[0]?.title).not.toBe('Bento')
})

it('her own initiative follows her autonomy: `asked` never hires, `propose` and `act` leave the CARD', async () => {
  const { h, gw } = rig()
  const asked = turn(gw, 'nina', 't-system')
  setMode(h, 'nina', 'asked')
  expect(await asked.call('persona_hire', WANT)).toMatchObject({ ok: false, code: 'forbidden', message: 'Você só contrata quando a pessoa pede.' })
  expect(cards(h)).toHaveLength(0)
  setMode(h, 'nina', 'propose')
  expect(await turn(gw, 'nina', 't-system').call('persona_hire', WANT)).toMatchObject({ ok: true, status: 'pending' })
  setMode(h, 'nina', 'act')
  expect(await turn(gw, 'nina', 't-system').call('persona_hire', { ...WANT, name: 'Bela' })).toMatchObject({ ok: true, status: 'pending' })
  expect(cards(h)).toHaveLength(2)
  expect(hired(h, 'nina')).toHaveLength(0) // `act` WITHOUT “Contratar direto” is still a card
})

it('the person\'s request authorizes the verb even when her autonomy is `asked`', async () => {
  const { h, gw } = rig()
  setMode(h, 'nina', 'asked')
  expect(await turn(gw, 'nina', 't-person').call('persona_hire', WANT)).toMatchObject({ ok: true, status: 'pending' })
})

it('“Contratar direto” ON: she is hired at once on the person\'s request or under `act` — recorded as done, and it can be UNDONE (she is retired: leaves the team, history stays)', async () => {
  const { h, gw, activity } = rig()
  h.hireDirect.set('pp', 'nina', true)
  const result = await turn(gw, 'nina', 't-person').call('persona_hire', WANT)
  expect(result).toMatchObject({ ok: true, status: 'hired', undoable: true })
  expect(hired(h, 'nina').map(persona => persona.name)).toEqual(['Bolota'])
  expect(activity.at(-1)).toMatchObject({ verb: 'persona_hire', after: 'Contratada', undoable: true, undo: { remote: 'retirePersona' } })
  const undo = (activity.at(-1) as unknown as { undo: { request: Parameters<PersonaHost['retirePersona']>[0] } }).undo
  expect(h.listPersonas(SCOPE).some(persona => persona.name === 'Bolota')).toBe(true)
  h.retirePersona(undo.request) // the Desfazer of the activity
  expect(h.listPersonas(SCOPE).some(persona => persona.name === 'Bolota')).toBe(false)
  expect(h.product.getPersona(undo.request.personaId)?.name).toBe('Bolota') // her history and name in old messages stay
  setMode(h, 'nina', 'act')
  expect(await turn(gw, 'nina', 't-system').call('persona_hire', { ...WANT, name: 'Bela' })).toMatchObject({ ok: true, status: 'hired' })
})

it('“Contratar direto” ON does not let her go around the person: under `propose` it is still the card', async () => {
  const { h, gw } = rig()
  h.hireDirect.set('pp', 'nina', true)
  setMode(h, 'nina', 'propose')
  expect(await turn(gw, 'nina', 't-system').call('persona_hire', WANT)).toMatchObject({ ok: true, status: 'pending' })
  expect(hired(h, 'nina')).toHaveLength(0)
})

it('limits: two cards waiting at a time; direct hires two per day; the team has a ceiling — each refusal says why', async () => {
  const cardsCase = rig()
  for (let index = 0; index < MAX_OPEN_HIRE_CARDS; index += 1) {
    expect(await turn(cardsCase.gw, 'nina', 't-person').call('persona_hire', { ...WANT, name: `Pessoa ${String(index)}` })).toMatchObject({ ok: true })
  }
  expect(await turn(cardsCase.gw, 'nina', 't-person').call('persona_hire', { ...WANT, name: 'Mais uma' })).toMatchObject({ ok: false, code: 'limit' })
  expect(cards(cardsCase.h)).toHaveLength(MAX_OPEN_HIRE_CARDS)

  const direct = rig()
  direct.h.hireDirect.set('pp', 'nina', true)
  for (let index = 0; index < MAX_DIRECT_HIRES_PER_DAY; index += 1) {
    expect(await turn(direct.gw, 'nina', 't-person').call('persona_hire', { ...WANT, name: `Direta ${String(index)}` })).toMatchObject({ ok: true, status: 'hired' })
  }
  const capped = await turn(direct.gw, 'nina', 't-person').call('persona_hire', { ...WANT, name: 'Direta extra' })
  expect(capped).toMatchObject({ ok: false, code: 'limit' })
  expect(capped.message).toContain('hoje')

  const team = rig()
  for (let index = team.h.product.listPersonas('pp').length; index < MAX_TEAM_SIZE; index += 1) {
    team.h.createPersona({
      workspaceId: 'ws', projectId: 'pp', id: `extra-${String(index)}`, name: `Extra ${String(index)}`, title: 'Apoio', description: 'Apoio.',
      personality: 'Clara.', instructions: 'Ajude.', avatarKind: 'gallery', avatarRef: 'bento',
      runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
    })
  }
  expect(await turn(team.gw, 'nina', 't-person').call('persona_hire', WANT)).toMatchObject({ ok: false, code: 'limit', message: 'A equipe já está no tamanho máximo.' })
})

it('bad input is refused with a sentence; a secret in the description never becomes a card', async () => {
  const { h, gw } = rig()
  const nina = turn(gw, 'nina', 't-person')
  expect(await nina.call('persona_hire', { name: '  ', title: 'Redação', description: 'Escreve.' })).toMatchObject({ ok: false, code: 'invalid' })
  expect(await nina.call('persona_hire', { name: 'Bolota', title: 'Redação' })).toMatchObject({ ok: false, code: 'invalid' })
  expect(await nina.call('persona_hire', { name: 'Bolota', title: 'x'.repeat(61), description: 'Escreve.' })).toMatchObject({ ok: false, code: 'invalid' })
  // A secret in the description: through the gateway the call is stopped before it reaches the port; straight at the port it is refused in a safe sentence.
  const secret = 'Escreve. Use a api_key=sk-1234567890abcdefghijkl para entrar.'
  const lease = gw.openTurn({ run: { personaId: 'nina', ticketId: 't-person', assignmentId: 'a-t-person' }, toolLevel: 'write', worktree: 'C:/tmp' })
  const stopped = (await gw.call(lease.token, 'persona_hire', { name: 'Bolota', title: 'Redação', description: secret })).content
  expect(stopped).not.toContain('sk-1234567890')
  const port = harnessMcpPorts(h.harness)
  const leaked = JSON.parse(await port.call!({ tool: 'persona_hire', run: { personaId: 'nina', ticketId: 't-person', assignmentId: 'a-t-person' }, args: { name: 'Bolota', title: 'Redação', description: secret }, callId: 'leak-1' })) as { ok: boolean; code?: string; message?: string }
  expect(leaked).toMatchObject({ ok: false, code: 'invalid' })
  expect(String(leaked.message)).not.toContain('sk-')
  expect(cards(h)).toHaveLength(0)
})

it('“Contratar direto” is the person\'s switch: off by default, hers to turn on, only for a persona who may hire', () => {
  const { h } = rig()
  Object.assign(h, { productToolsEnabled: true })
  expect(h.listPersonas(SCOPE).find(persona => persona.id === 'nina')?.hireDirect).toBe(false) // shown for who may hire, off
  expect(h.listPersonas(SCOPE).find(persona => persona.id === 'bento')?.hireDirect).toBeUndefined() // nothing to switch for who may not
  expect(h.setPersonaHireDirect({ ...SCOPE, personaId: 'nina', hireDirect: true }).hireDirect).toBe(true)
  expect(h.hireDirect.get('pp', 'nina')).toBe(true)
  expect(h.setPersonaHireDirect({ ...SCOPE, personaId: 'nina', hireDirect: false }).hireDirect).toBe(false)
  expect(() => h.setPersonaHireDirect({ ...SCOPE, personaId: 'bento', hireDirect: true })).toThrow(/contratar/u)
  Object.assign(h, { productToolsEnabled: false })
  expect(h.listPersonas(SCOPE).find(persona => persona.id === 'nina')?.hireDirect).toBeUndefined() // with the product tools off no field is returned
})

it('a part of a split request and the Task of a colleague act with the PERSON\'s authority: her request is what allows “Contratar direto” (TEAM-13/HT-6)', async () => {
  const { h, gw } = rig()
  h.hireDirect.set('pp', 'nina', true)
  const rt = h.orchestration.runtime('pp')
  rt.repo.tickets.save(ticket('t-part', 'split:m-person:nina', 'Nina')) // the part: the line is the team's, the mandate is Ana's
  rt.repo.tickets.save(ticket('t-colleague', 'handoff:t-bento:call-1', 'Nina'))
  expect(await turn(gw, 'nina', 't-part').call('persona_hire', WANT)).toMatchObject({ ok: true, status: 'hired' })
  expect(await turn(gw, 'nina', 't-colleague').call('persona_hire', { ...WANT, name: 'Bela' })).toMatchObject({ ok: true, status: 'hired' })
  // The team's OWN initiative is still the persona's initiative: under `propose` it is a card, whatever the switch says.
  setMode(h, 'nina', 'propose')
  expect(await turn(gw, 'nina', 't-system').call('persona_hire', { ...WANT, name: 'Cica' })).toMatchObject({ ok: true, status: 'pending' })
})
