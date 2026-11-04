import { latestAssignment, type Ticket } from '@deepseek-ai/dsh-persona-engine'
import { ProactivityRepos, RoutineRepos } from '@deepseek-ai/dsh-persona-store'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { ProactivityHost } from '../src/proactivity.ts'
import { createProactivityScheduler } from '../src/proactivity-wire.ts'
import { RemoteFault } from '../src/remote-guard.ts'
import { TeamStateBook } from '../src/team-state.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/** P1-9 “Proposta de {persona}” (contracts/task-proposals.md): the card, the budget, Aceitar / Agora não, the acceptance rate. */

const DAY = 86_400_000
const T0 = Date.parse('2026-11-04T12:00:00.000Z')
const iso = (days = 0): string => new Date(T0 + days * DAY).toISOString()

function setup(): PersonaHost {
  const h = openJourney(iso())
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Pesquisa' },
    { id: 'bento', name: 'Bento', title: 'Engenharia' },
  ])
  h.createMember({ id: 'gus', workspaceId: 'ws', projectId: 'pp', displayName: 'Gus', handle: 'gus', role: 'guest' })
  h.store.db.exec('DELETE FROM routine_run')
  h.store.db.exec('DELETE FROM routine')
  return h
}

/** A Ticket waiting on a question for `idleDays`. */
function asking(h: PersonaHost, id: string, title: string, question: string, idleDays: number, persona = 'Nina'): void {
  const at = iso(-idleDays)
  const ticket: Ticket = {
    id, title, decisionId: 'd1',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [],
    assignments: [{ id: `${id}-a1`, state: 'running', createdAt: at, startedAt: at, report: { state: 'waiting', summary: question, at } }],
    inputs: [], undelivered: [],
    attention: { id: `att-${id}`, question },
    createdAt: at, updatedAt: at, origin: { triggerId: `m-${id}`, triggerIds: [`m-${id}`] },
    execution: { name: persona, directory: '.', assignment: title },
  }
  h.orchestration.runtime('pp').repo.tickets.save(ticket)
}

function offer(h: PersonaHost, personaId: string, days = 0): number {
  return h.taskProposals.offer({ workspaceId: 'ws', projectId: 'pp', personaId, nowIso: iso(days) })
}

function geral(h: PersonaHost) {
  return h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
}

function fault(run: () => unknown): RemoteFault {
  try {
    run()
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(RemoteFault)
    return error as RemoteFault
  }
  throw new Error('expected a RemoteFault')
}

it('the Remotes exist', () => {
  const names = new Set(remoteMethods(setup()).map(item => item.method))
  for (const name of ['listTaskProposals', 'decideTaskProposal', 'reopenTaskProposal', 'getProposalStats']) expect(names.has(name), name).toBe(true)
})

it('one real fact becomes ONE card from the persona, with the Muse\'s words and the plain sentence; nothing is posted before the cycle ends', () => {
  const h = setup()
  asking(h, 't1', 'Cardápio de almoço', 'Qual preço cobro pelo combo?', 2)
  expect(offer(h, 'nina')).toBe(1)
  expect(geral(h).some(row => row.id.startsWith('proposal-card:'))).toBe(false) // recorded, not posted
  expect(h.listTaskProposals(SCOPE)).toEqual([])
  h.orchestration.now = () => iso()
  expect(h.taskProposals.flush('pp', iso())).toBe(true)
  const card = geral(h).find(row => row.id.startsWith('proposal-card:'))!
  expect(card.actorId).toBe('nina')
  expect(card.taskProposal).toMatchObject({ kind: 'single', items: [{ personaId: 'nina', personaName: 'Nina', question: 'Posso destravar “Cardápio de almoço”?', reason: 'Qual preço cobro pelo combo?' }] })
  expect(card.body.split('\n')[0]).toBe('Nina sugeriu: Posso destravar “Cardápio de almoço”? (Qual preço cobro pelo combo?)')
  expect(h.listTaskProposals(SCOPE)).toMatchObject([{ status: 'open', question: 'Posso destravar “Cardápio de almoço”?', cardId: card.id }])
})

it('no fact, no card: a quiet project, a fresh question and a result waiting for review propose nothing', () => {
  const h = setup()
  expect(offer(h, 'nina')).toBe(0) // nothing observed
  asking(h, 't1', 'Cardápio', 'Qual preço?', 0.2) // asked a few hours ago: the person is still looking at it
  expect(offer(h, 'nina')).toBe(0)
  const repo = h.orchestration.runtime('pp').repo
  const { attention: _answered, ...asked } = repo.tickets.get('t1')!
  repo.tickets.save({ ...asked, updatedAt: iso(-5), assignments: [{ id: 'a', state: 'running', createdAt: iso(-5), report: { state: 'ready', summary: 'pronto', at: iso(-5) } }] })
  expect(offer(h, 'nina')).toBe(0) // a result waiting for the person is the person's to review, not a "retomar"
  asking(h, 't2', 'Folheto', 'Qual cor?', 3, 'Bento')
  expect(offer(h, 'nina')).toBe(0) // Bento's work is Bento's to propose about, not Nina's
  expect(h.taskProposals.flush('pp', iso())).toBe(false)
  expect(geral(h).some(row => row.id.startsWith('proposal-card:'))).toBe(false)
})

it('two personas in the same cycle share ONE digest from the Coordenação; the project never holds more than 3 open', () => {
  const h = setup()
  asking(h, 't1', 'Cardápio', 'Qual preço?', 2, 'Nina')
  asking(h, 't2', 'Folheto', 'Qual cor?', 3, 'Bento')
  expect(offer(h, 'nina')).toBe(1)
  expect(offer(h, 'bento')).toBe(1)
  h.orchestration.now = () => iso()
  expect(h.taskProposals.flush('pp', iso())).toBe(true)
  const cards = geral(h).filter(row => row.id.startsWith('proposal-card:'))
  expect(cards).toHaveLength(1)
  expect(cards[0]!.actorId).toBe('guia')
  expect(cards[0]!.taskProposal?.kind).toBe('digest')
  expect(cards[0]!.taskProposal?.items.map(item => item.personaName).sort()).toEqual(['Bento', 'Nina'])
  expect(cards[0]!.body.split('\n')[0]).toBe('A equipe tem 2 sugestões para você. Abra a Persona para responder.')
  // 2 open + 3 more facts: only one more fits
  asking(h, 't3', 'Contrato', 'Quem assina?', 2, 'Nina')
  asking(h, 't4', 'Site', 'Qual domínio?', 2, 'Nina')
  asking(h, 't5', 'Logo', 'Qual fonte?', 2, 'Nina')
  expect(offer(h, 'nina', 0.5)).toBe(1)
  h.taskProposals.flush('pp', iso(0.5))
  expect(h.listTaskProposals(SCOPE).filter(row => row.status === 'open')).toHaveLength(3)
  expect(offer(h, 'nina', 0.6)).toBe(0) // the open cap
  expect(offer(h, 'bento', 0.6)).toBe(0)
})

it('Aceitar makes ONE real Ticket for that persona, with the proposal as the request; deciding again changes nothing', async () => {
  const h = setup()
  asking(h, 't1', 'Cardápio de almoço', 'Qual preço cobro pelo combo?', 2)
  offer(h, 'nina')
  h.taskProposals.flush('pp', iso())
  const proposal = h.listTaskProposals(SCOPE)[0]!
  const before = h.orchestration.runtime('pp').repo.tickets.list().length
  const accepted = h.decideTaskProposal({ ...SCOPE, id: proposal.id, accept: true })
  await h.orchestration.flush('pp')
  expect(accepted).toMatchObject({ id: proposal.id, status: 'accepted' })
  const tickets = h.orchestration.runtime('pp').repo.tickets.list()
  expect(tickets).toHaveLength(before + 1)
  const made = tickets.find(ticket => ticket.origin.triggerId === `proposal-accept:${proposal.id}`)!
  expect(made.execution?.name).toBe('Nina')
  expect(geral(h).find(row => row.id === `proposal-accept:${proposal.id}`)?.body).toMatch(/^@Nina Destrave “Cardápio de almoço”\./)
  expect(h.listTaskProposals(SCOPE)[0]).toMatchObject({ status: 'accepted', ticketId: made.id, ticketTitle: made.title })
  expect(latestAssignment(made)).toBeDefined()
  // idempotent
  expect(h.decideTaskProposal({ ...SCOPE, id: proposal.id, accept: true }).status).toBe('accepted')
  expect(h.decideTaskProposal({ ...SCOPE, id: proposal.id, accept: false }).status).toBe('accepted') // the first answer stays
  await h.orchestration.flush('pp')
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(before + 1)
  expect(h.getProposalStats(SCOPE).find(row => row.personaId === 'nina')).toMatchObject({ accepted: 1, declined: 0, rate: 0.625 })
})

it('Agora não keeps the same proposal quiet for 7 days, lowers the rate, and Desfazer opens it again with the rate back', () => {
  const h = setup()
  asking(h, 't1', 'Cardápio de almoço', 'Qual preço cobro pelo combo?', 2)
  offer(h, 'nina')
  h.taskProposals.flush('pp', iso())
  const id = h.listTaskProposals(SCOPE)[0]!.id
  expect(h.decideTaskProposal({ ...SCOPE, id, accept: false })).toMatchObject({ status: 'declined' })
  expect(h.getProposalStats(SCOPE).find(row => row.personaId === 'nina')).toMatchObject({ accepted: 0, declined: 1 })
  expect(h.getProposalStats(SCOPE).find(row => row.personaId === 'nina')!.rate).toBeCloseTo(0.375)
  expect(offer(h, 'nina', 1)).toBe(0) // same fact, one day later
  expect(offer(h, 'nina', 6.5)).toBe(0)
  expect(offer(h, 'nina', 7.5)).toBe(1) // the week is over
  // Desfazer
  const reopened = h.reopenTaskProposal({ ...SCOPE, id })
  expect(reopened.status).toBe('open')
  expect(h.getProposalStats(SCOPE).find(row => row.personaId === 'nina')).toMatchObject({ accepted: 0, declined: 0, rate: 0.5 })
  expect(h.reopenTaskProposal({ ...SCOPE, id }).status).toBe('open') // idempotent
})

it('an unanswered proposal expires in 3 days: it shows as expired, cannot be accepted, and is neutral for the rate', async () => {
  const h = setup()
  asking(h, 't1', 'Cardápio', 'Qual preço?', 2)
  offer(h, 'nina')
  h.taskProposals.flush('pp', iso())
  const id = h.listTaskProposals(SCOPE)[0]!.id
  h.orchestration.now = () => iso(3.1)
  expect(h.listTaskProposals(SCOPE)[0]!.status).toBe('expired')
  const before = h.orchestration.runtime('pp').repo.tickets.list().length
  expect(h.decideTaskProposal({ ...SCOPE, id, accept: true }).status).toBe('expired')
  await h.orchestration.flush('pp')
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(before)
  expect(h.getProposalStats(SCOPE).find(row => row.personaId === 'nina')).toMatchObject({ accepted: 0, declined: 0, rate: 0.5 })
  h.taskProposals.expire('pp', iso(3.1))
  expect(h.listTaskProposals(SCOPE)[0]!.status).toBe('expired')
})

it('proposals that are not welcome come less often: a persona whose proposals keep being declined gets one a day, then waits', () => {
  const h = setup()
  const titles = ['Cardápio de almoço', 'Folheto da padaria', 'Contrato com fornecedor', 'Planilha de preços', 'Campanha de inverno', 'Relatório de vendas']
  titles.forEach((title, i) => { asking(h, `t${String(i)}`, title, `Pergunta distinta número ${String(i)}?`, 2) })
  let day = 0
  let declined = 0
  for (let round = 0; round < 6 && declined < 4; round += 1) {
    day += 2.5
    h.orchestration.now = () => iso(day)
    if (offer(h, 'nina', day) === 0) continue
    h.taskProposals.flush('pp', iso(day))
    for (const row of h.listTaskProposals(SCOPE).filter(item => item.status === 'open')) {
      h.decideTaskProposal({ ...SCOPE, id: row.id, accept: false })
      declined += 1
    }
  }
  expect(declined).toBeGreaterThanOrEqual(3)
  const rate = h.getProposalStats(SCOPE).find(row => row.personaId === 'nina')!.rate
  expect(rate).toBeLessThan(0.25)
  // unwelcome ⇒ at most 1 a day and not before 24h × (2 − rate)
  day += 0.2
  expect(offer(h, 'nina', day)).toBe(0)
})

it('only someone who can write decides; a proposal of another project is not found', () => {
  const h = setup()
  asking(h, 't1', 'Cardápio', 'Qual preço?', 2)
  offer(h, 'nina')
  h.taskProposals.flush('pp', iso())
  const id = h.listTaskProposals(SCOPE)[0]!.id
  h.sessionMemberId = 'gus'
  expect(() => h.decideTaskProposal({ ...SCOPE, id, accept: true })).toThrow(/forbidden/u)
  expect(() => h.reopenTaskProposal({ ...SCOPE, id })).toThrow(/forbidden/u)
  h.sessionMemberId = 'ana'
  h.createProject({ id: 'other', workspaceId: 'ws', name: 'Outro', description: '' })
  expect(fault(() => h.decideTaskProposal({ workspaceId: 'ws', projectId: 'other', id, accept: true })).code).toBe('not-found')
  expect(fault(() => h.decideTaskProposal({ ...SCOPE, id: 'nao-existe', accept: true })).code).toBe('not-found')
  expect(fault(() => h.decideTaskProposal({ ...SCOPE, id: '', accept: true })).code).toBe('invalid-payload')
  expect(h.listTaskProposals(SCOPE)[0]!.status).toBe('open')
})

function liveScheduler(h: PersonaHost) {
  const clock = { ms: T0 }
  const nowIso = (): string => new Date(clock.ms).toISOString()
  h.orchestration.now = nowIso
  const routines = new RoutineRepos(h.store, nowIso)
  const proactivity = new ProactivityHost(h.product, routines, new ProactivityRepos(h.store, nowIso), h.orchestration, nowIso)
  proactivity.ensureAllInitiativeRoutines('pp')
  const scheduler = createProactivityScheduler({
    product: h.product, events: h.events, routines, proactivity, screens: h.screens.screens, orchestration: h.orchestration,
    boards: h.boards, teamState: new TeamStateBook(h.screens.screens, routines, nowIso), governance: h.governance,
    draftFiles: h.draftFiles, workingControl: h.workingControl, taskProposals: h.taskProposals,
  }, { nowMs: () => clock.ms, cycleMs: 0 })
  return { clock, scheduler, proactivity }
}

const proposalCards = (h: PersonaHost) => geral(h).filter(row => row.taskProposal !== undefined)

it('the scheduler\'s daily initiative leaves ONE card in #geral at the end of the cycle, once, and no Ticket on its own', async () => {
  const h = setup()
  asking(h, 't1', 'Cardápio de almoço', 'Qual preço cobro pelo combo?', 2)
  const { clock, scheduler } = liveScheduler(h)
  clock.ms += 26 * 3_600_000 // every initiative routine is due
  await scheduler.cycle()
  await scheduler.whenIdle()
  const cards = proposalCards(h)
  expect(cards).toHaveLength(1)
  expect(cards[0]!.actorId).toBe('nina')
  expect(cards[0]!.taskProposal?.items[0]?.question).toBe('Posso destravar “Cardápio de almoço”?')
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(1) // proposing is not doing: no Ticket was made on her own
  // the next cycle does not repeat what is open
  clock.ms += 3_600_000
  await scheduler.cycle()
  await scheduler.whenIdle()
  expect(proposalCards(h)).toHaveLength(1)
  expect(h.listTaskProposals(SCOPE)).toHaveLength(1)
})

it('"Só quando pedido" never proposes: the same cycle leaves no card', async () => {
  const h = setup()
  asking(h, 't1', 'Cardápio de almoço', 'Qual preço cobro pelo combo?', 2)
  const { clock, scheduler, proactivity } = liveScheduler(h)
  proactivity.setAutonomy({ projectId: 'pp', personaId: 'nina', mode: 'asked', proposalBudget: 3, tokenBudget: 0, executionBudget: 0 })
  clock.ms += 26 * 3_600_000
  await scheduler.cycle()
  await scheduler.whenIdle()
  expect(proposalCards(h)).toHaveLength(0)
})
