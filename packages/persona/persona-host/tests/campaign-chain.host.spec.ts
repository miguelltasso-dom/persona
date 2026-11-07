import { latestAssignment, type Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import { routeByFunction } from '../src/function-route.ts'
import type PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * EQUIPE-REAL, TEAM-12: the Gestor's approved plan for a campaign opens its parts as CHAINED Tasks, each for the persona of its function
 * ("texto, arte e posts" → Bia, Teo, Caio): the first part starts at once, every delivery opens the next with what it delivered as the
 * bilhete, and the whole chain carries the mandate of the PERSON who approved the plan.
 */

const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' }
const GOAL = 'Monte um time para a campanha de Natal: texto, arte e posts'

/** @param withTeam - Bia/Teo/Caio (texto, arte, posts) already on the team; without them only the Coordenação is there and a plan must hire. */
function seed(h: PersonaHost, withTeam = true): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  const make = (id: string, name: string, title: string, description: string, roles: readonly ('coordination' | 'team_manager')[] = []) => h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id, name, title, description, personality: 'Clara.', instructions: 'Ajude.',
    avatarKind: 'gallery', avatarRef: id, runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: true, createdBy: 'ana',
    ...(roles.length === 0 ? {} : { systemRoles: roles }),
  })
  make('atlas', 'Atlas', 'Coordenação', 'Coordena.', ['coordination', 'team_manager'])
  if (!withTeam) return
  make('bia', 'Bia', 'Redação', 'Escreve textos e legendas.')
  make('teo', 'Teo', 'Design', 'Cria artes, cartazes e identidade visual.')
  make('caio', 'Caio', 'Mídia social', 'Cuida de posts e redes sociais.')
}

function script(h: PersonaHost, texts: readonly string[]): void {
  const queue = [...texts]
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => queue.shift(), set: () => undefined })
}

const tickets = (h: PersonaHost): Ticket[] => h.orchestration.runtime('pp').repo.tickets.list()
const thread = (h: PersonaHost) => h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events

async function settle(h: PersonaHost): Promise<void> {
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp')
}

it('the approved plan starts the campaign: Bia (texto) now, Teo (arte) when she delivers, Caio (posts) when he does — one mandate, one line per step', async () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } }) // the review has its own spec
  try {
    script(h, ['Texto da campanha pronto.', 'Arte da campanha pronta.', 'Posts da campanha prontos.'])
    const proposed = h.proposeGestorAssemble({ ...scope, gestorId: 'atlas', id: 'campanha', goal: GOAL })
    expect(proposed.plan.status).toBe('proposed')
    // nothing starts before the person approves
    expect(tickets(h)).toHaveLength(0)
    expect(h.approveGestorPlan({ workspaceId: 'ws', planId: 'campanha' }).status).toBe('applied')
    await settle(h)

    const byName = (name: string) => tickets(h).find(ticket => ticket.execution?.name === name)
    const bia = byName('Bia')
    const teo = byName('Teo')
    const caio = byName('Caio')
    expect([bia, teo, caio].every(ticket => ticket !== undefined)).toBe(true)
    // short, human titles: "{Parte} da {pedido resumido}", never the raw request (EQUIPE-REAL-SPEC §0)
    expect([bia?.title, teo?.title, caio?.title]).toEqual(['Texto da campanha de Natal', 'Arte da campanha de Natal', 'Posts da campanha de Natal'])
    // the whole chain works under the mandate of the PERSON who approved the plan
    for (const ticket of [bia, teo, caio]) expect(ticket?.mandate.actor.id).toBe('ana')
    // every part delivered, in order
    for (const ticket of [bia, teo, caio]) expect(latestAssignment(h.orchestration.runtime('pp').repo.tickets.get(ticket!.id)!)?.report?.state).toBe('ready')
    // the next part got what the previous one delivered as its bilhete (data between delimiters)
    expect(teo?.execution?.assignment).toContain('<bilhete>')
    expect(teo?.execution?.assignment).toContain('Texto da campanha pronto.')
    expect(caio?.execution?.assignment).toContain('Arte da campanha pronta.')
    // the REQUEST the parts belong to, readable from any of them (the plan card and the one delivery card are built on it)
    for (const part of [bia, teo, caio]) {
      expect(h.handoffs.requestOf('pp', part!.id)).toEqual({
        requestId: 'campanha', title: 'Campanha de Natal', partTicketIds: [bia!.id, teo!.id, caio!.id],
        // each part has its SHORT NAME next to its long title (the chip and the plan card)
        parts: [{ ticketId: bia!.id, name: 'Texto' }, { ticketId: teo!.id, name: 'Arte' }, { ticketId: caio!.id, name: 'Posts' }],
      })
    }
    expect(h.handoffs.requestOf('pp', 'nao-existe')).toBeUndefined()
    // the thread: the plan's own line opens it, the hand-overs follow ("passou para"), the bilhete never appears
    const lines = thread(h)
    const planned = lines.find(row => row.body.startsWith('Plano aprovado — Bia começa: texto'))
    expect(planned).toBeDefined()
    expect(planned?.actorId).toBe('atlas') // the Gestor who proposed it says it, never an internal author
    expect(lines.every(row => !row.actorId.includes(':'))).toBe(true)
    const passes = lines.filter(row => row.handoff?.status === 'asked').map(row => row.body.split('\n')[0])
    expect(passes).toHaveLength(2)
    expect(passes[0]).toMatch(/^Bia passou para Teo:/u)
    expect(passes[1]).toMatch(/^Teo passou para Caio:/u)
    expect(lines.map(row => row.body).join('\n')).not.toContain('<bilhete>')
  } finally {
    h.teamworkEnabled = false
  }
})

it('with the team behavior off the approved plan hires and plans as before and opens no Task', async () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = false
  h.proposeGestorAssemble({ ...scope, gestorId: 'atlas', id: 'campanha2', goal: GOAL })
  expect(h.approveGestorPlan({ workspaceId: 'ws', planId: 'campanha2' }).status).toBe('applied')
  await settle(h)
  expect(tickets(h)).toHaveLength(0)
  expect(h.getProjectBoard(scope).workflow.template).toBeDefined()
})

it('a goal that names no functions of the team opens no chain (the plan only builds the team)', async () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  try {
    h.proposeGestorAssemble({ ...scope, gestorId: 'atlas', id: 'sem-funcao', goal: 'Monte um time para o Site' })
    h.approveGestorPlan({ workspaceId: 'ws', planId: 'sem-funcao' })
    await settle(h)
    expect(tickets(h)).toHaveLength(0)
  } finally {
    h.teamworkEnabled = false
  }
})

it('the hired personas carry only their FUNCTION as description (the objective is in their instructions): a request that repeats words of the objective is not routed to them', () => {
  const h = host()
  seed(h, false) // a team that already does texto/arte/posts is REUSED by the plan (EQ-8); here nobody does, so the plan hires
  h.sessionMemberId = 'ana'
  h.proposeGestorAssemble({ ...scope, gestorId: 'atlas', id: 'campanha3', goal: 'Monte um time para a campanha de lançamento do produto' })
  h.approveGestorPlan({ workspaceId: 'ws', planId: 'campanha3' })
  const hired = h.product.listPersonas('pp').filter(persona => persona.id.startsWith('hire-campanha3-'))
  expect(hired.length).toBeGreaterThan(0)
  for (const persona of hired) {
    expect(persona.description).toBe(persona.title)
    expect(persona.instructions).toContain('campanha de lançamento do produto')
  }
  const roster = h.product.listPersonas('pp').map(persona => ({
    id: persona.id, name: persona.name, title: persona.title, description: persona.description,
    coordination: persona.systemRoles.includes('coordination'), paused: false,
  }))
  const route = routeByFunction(roster, 'preciso de um resumo da campanha de lançamento do produto para a diretoria')
  const owners = route === undefined ? [] : route.kind === 'single' ? [route.part.persona.id] : route.parts.map(part => part.persona.id)
  expect(owners.filter(id => id.startsWith('hire-campanha3-'))).toEqual([])
})
