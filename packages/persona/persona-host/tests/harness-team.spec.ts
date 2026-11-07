import { latestAssignment, type Ticket } from '@deepseek-ai/dsh-persona-engine'
import type { HarnessCall } from '@deepseek-ai/dsh-persona-runners'
import { describe, expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { TEAM_GUIDANCE_CORE, TEAM_TOOLS, teamGuidance, TeamTools, withTeamTools, type TeamToolsDeps } from '../src/harness-team.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * D-090 (Atlas, 05/11): the team behaviors a REAL persona uses through the HT-0 tools — `ask_colleague`, `pass_forward`, `review_verdict`
 * (and the offer rule, "only when the request needs it"). The identity is the run, the mandate is the person's, the ACL is the persona's
 * switch/cap/autonomy and the circle of the chain; the model only says whom and what.
 */

function open(review: 'on' | 'off' = 'off'): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'bia', name: 'Bia', title: 'Redação' },
    { id: 'teo', name: 'Teo', title: 'Arte' },
  ])
  h.teamworkEnabled = true
  if (review === 'off') h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}

const tickets = (h: PersonaHost): Ticket[] => h.orchestration.runtime('pp').repo.tickets.list()
const ticketOf = (h: PersonaHost, name: string): Ticket | undefined => tickets(h).find(ticket => ticket.execution?.name === name)
const thread = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events

async function settle(h: PersonaHost): Promise<void> {
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp')
}

function script(h: PersonaHost, steps: ReadonlyArray<string | (() => string)>): void {
  const queue = [...steps]
  Object.defineProperty(h.orchestration, 'liveText', {
    configurable: true,
    get: () => { const next = queue.shift(); return typeof next === 'function' ? next() : next },
    set: () => undefined,
  })
}

const call = (h: PersonaHost, tool: HarnessCall['tool'], ticket: Ticket, personaId: string, args: Record<string, unknown>, callId = `${ticket.id}:l:1`): Record<string, unknown> =>
  JSON.parse(h.teamTools.call({ tool, run: { personaId, ticketId: ticket.id, assignmentId: ticket.assignments[0]?.id ?? 'a1' }, args, callId })) as Record<string, unknown>

const ASK = { colleague: 'Teo', title: 'Arte dos 3 posts', done: ['Texto dos 3 posts pronto.'], needed: ['Uma arte para cada post'], files: ['posts/post-1.md'] }

describe('the offer (D-097): by the host\'s rule, never by the words of the request', () => {
  it('EVERY Task of a project with colleagues is offered the three team tools — a plain, natural request included — and the paragraph that tells the model it works in a team', async () => {
    const h = open('off')
    script(h, ['Texto pronto.'])
    // no "peça ao…", no "depois o…", no "opinião da equipe": the way a person really writes
    say(h, 'u1', '@Bia Faz um cartaz da promoção da Padaria Lua com esta foto, quero algo bonito para o Instagram')
    const bia = ticketOf(h, 'Bia')!
    const persona = h.product.getPersona('bia')!
    expect(h.teamTools.toolsFor('pp', persona, bia.id)).toEqual(['ask_colleague', 'pass_forward', 'ask_team_opinion'])
    const colleagues = h.product.listPersonas('pp').filter(row => row.id !== 'bia')
    expect(h.teamTools.guidanceFor('pp', persona, bia.id)).toBe(teamGuidance(colleagues))
    // it names WHO is on the team (the `colleague` argument needs a name), never the persona herself
    expect(h.teamTools.guidanceFor('pp', persona, bia.id)).toMatch(/Equipe: (?:Guia \(Coordenação\), Teo \(Arte\)|Teo \(Arte\), Guia \(Coordenação\))\./u)
    expect(h.teamTools.guidanceFor('pp', persona, bia.id)).not.toContain('Bia (')
    // …and it says that using the team IS finishing well (above the owner norms), that several parts is not "só uma resposta em texto"
    expect(TEAM_GUIDANCE_CORE).toMatch(/vale mais que as normas de dono.*pass_forward.*ask_colleague.*ask_team_opinion.*não é só uma resposta em texto/su)
    expect(teamGuidance(colleagues).length).toBeLessThan(700) // a short paragraph, paid by every turn
    expect(teamGuidance(Array.from({ length: 12 }, (_, at) => ({ name: `P${String(at)}`, title: 'Função' })))).toContain('e mais 4.')
    await settle(h)
  })

  it('no colleague on the team, the team switch off, or the persona\'s own switch off → nothing is offered and no paragraph is added', async () => {
    const alone = openJourney()
    seedJourney(alone, [{ id: 'bia', name: 'Bia', title: 'Redação' }])
    alone.teamworkEnabled = true
    script(alone, ['Texto pronto.'])
    say(alone, 'u1', '@Bia Faz um cartaz da promoção')
    const solo = ticketOf(alone, 'Bia')!
    expect(alone.teamTools.toolsFor('pp', alone.product.getPersona('bia')!, solo.id)).toEqual([])
    expect(alone.teamTools.guidanceFor('pp', alone.product.getPersona('bia')!, solo.id)).toBeUndefined()
    await settle(alone)

    const h = open('off')
    script(h, ['Texto pronto.'])
    say(h, 'u1', '@Bia Faz um cartaz da promoção')
    const bia = ticketOf(h, 'Bia')!
    const persona = h.product.getPersona('bia')!
    h.teamwork.set('pp', { ...SCOPE, personaId: 'bia', canAskColleagues: false })
    expect(h.teamTools.toolsFor('pp', persona, bia.id)).toEqual([])
    expect(h.teamTools.guidanceFor('pp', persona, bia.id)).toBeUndefined()
    h.teamwork.set('pp', { ...SCOPE, personaId: 'bia', canAskColleagues: true })
    h.teamworkEnabled = false
    expect(h.teamTools.toolsFor('pp', persona, bia.id)).toEqual([])
    expect(h.teamTools.guidanceFor('pp', persona, bia.id)).toBeUndefined()
    h.teamworkEnabled = true
    expect(h.teamTools.toolsFor('pp', persona, bia.id)).toEqual(['ask_colleague', 'pass_forward', 'ask_team_opinion'])
    await settle(h) // the run in flight ends before the host closes
  })

  it('a review Task is offered ONLY the verdict, and no paragraph about asking colleagues', async () => {
    const h = open('on')
    script(h, ['Texto pronto.', () => 'APROVADO'])
    say(h, 'u1', '@Bia Faz um cartaz da promoção')
    await settle(h)
    const review = ticketOf(h, 'Guia')!
    const guia = h.product.getPersona('guia')!
    expect(h.teamTools.toolsFor('pp', guia, review.id)).toEqual(['review_verdict'])
    expect(h.teamTools.guidanceFor('pp', guia, review.id)).toBeUndefined()
  })
})

describe('ask_colleague / pass_forward through the HT-0 ports', () => {
  it('Bia asks Teo: his Task has the person\'s mandate, the asker waits, a retry of the same call acts once, the model reads what to do next', async () => {
    const h = open()
    say(h, 'u1', '@Bia escreva os 3 posts da campanha')
    const bia = ticketOf(h, 'Bia')!
    const answer = call(h, 'ask_colleague', bia, 'bia', ASK)
    expect(answer).toMatchObject({ ok: true, status: 'asked', colleague: 'Teo' })
    expect(String(answer.next)).toMatch(/termine o turno/u)
    const teo = ticketOf(h, 'Teo')!
    expect(teo.mandate.actor).toEqual(bia.mandate.actor)
    expect(teo.mandate.scope).toBe(bia.mandate.scope)
    expect(teo.execution?.assignment).toContain('<bilhete>')
    // the same call again (a retry) answers the same and opens nothing more
    expect(call(h, 'ask_colleague', bia, 'bia', ASK)).toMatchObject({ ok: true, duplicate: true, requestId: answer.requestId })
    expect(tickets(h).filter(ticket => ticket.execution?.name === 'Teo')).toHaveLength(1)
    // a deliberate second ask (a new call id) is a new request, under the same limits
    expect(call(h, 'ask_colleague', bia, 'bia', { ...ASK, colleague: 'arte', title: 'Capa' }, `${bia.id}:l:2`)).toMatchObject({ ok: true })
    // the thread has the typed line, never the bilhete, never a technical author
    expect(thread(h).filter(row => row.handoff !== undefined)).toHaveLength(2)
    expect(JSON.stringify(thread(h))).not.toContain('Texto dos 3 posts pronto')
    // and the delivery wakes the asker with it
    script(h, ['Arte pronta.', 'Texto e arte prontos.'])
    await settle(h)
    expect(latestAssignment(h.orchestration.runtime('pp').repo.tickets.get(bia.id)!)?.report?.state).toBe('ready')
  })

  it('the model\'s mistakes come back as sentences with the way forward: unknown person, itself, empty bilhete, no title', async () => {
    const h = open()
    say(h, 'u1', '@Bia escreva os 3 posts da campanha')
    const bia = ticketOf(h, 'Bia')!
    const unknown = call(h, 'ask_colleague', bia, 'bia', { ...ASK, colleague: 'Zé' })
    expect(unknown).toMatchObject({ ok: false, code: 'unknown-colleague' })
    expect(String(unknown.message)).toContain('Teo (Arte)')
    expect(String(unknown.message)).not.toContain('Bia (') // she is not her own colleague
    expect(call(h, 'ask_colleague', bia, 'bia', { ...ASK, colleague: 'Bia' })).toMatchObject({ ok: false, code: 'unknown-colleague' })
    expect(call(h, 'ask_colleague', bia, 'bia', { title: 'x' })).toMatchObject({ ok: false, code: 'invalid' })
    expect(call(h, 'ask_colleague', bia, 'bia', { colleague: 'Teo', title: 'Arte' })).toMatchObject({ ok: false, code: 'refused', message: expect.stringMatching(/bilhete/u) })
    expect(call(h, 'ask_colleague', bia, 'bia', { colleague: 'Teo', needed: ['arte'] })).toMatchObject({ ok: false, code: 'refused', message: expect.stringMatching(/título|linha/u) })
    expect(call(h, 'ask_colleague', bia, 'bia', { ...ASK, files: ['C:/Users/ana/segredo.txt'] })).toMatchObject({ ok: false, code: 'refused', message: expect.stringMatching(/caminho dentro do projeto/u) })
    expect(ticketOf(h, 'Teo')).toBeUndefined() // nothing was opened by any of them
    await settle(h)
  })

  it('identity is the run: a persona that is not running that Task, or a forged persona id, runs nothing', async () => {
    const h = open()
    say(h, 'u1', '@Bia escreva os 3 posts da campanha')
    const bia = ticketOf(h, 'Bia')!
    // Teo "calls" inside Bia's Task: the run says Bia's Task, the persona is Teo → the host refuses (he does not run that Task)
    expect(call(h, 'ask_colleague', bia, 'teo', { ...ASK, colleague: 'Guia' })).toMatchObject({ ok: false })
    expect(call(h, 'ask_colleague', bia, 'ninguem', ASK)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(tickets(h).filter(ticket => ticket.execution?.name !== 'Bia')).toHaveLength(0)
    await settle(h)
  })

  it('the persona\'s own switch and daily cap, and the circle (nobody already in the chain), are the host\'s', async () => {
    const h = open()
    say(h, 'u1', '@Bia escreva os 3 posts da campanha')
    const bia = ticketOf(h, 'Bia')!
    h.teamwork.set('pp', { ...SCOPE, personaId: 'bia', canAskColleagues: false })
    expect(call(h, 'ask_colleague', bia, 'bia', ASK)).toMatchObject({ ok: false, code: 'refused' })
    h.teamwork.set('pp', { ...SCOPE, personaId: 'bia', canAskColleagues: true, askCapPerDay: 1 })
    expect(call(h, 'ask_colleague', bia, 'bia', ASK)).toMatchObject({ ok: true })
    expect(call(h, 'ask_colleague', bia, 'bia', { ...ASK, colleague: 'Guia', title: 'Revisão' }, `${bia.id}:l:2`)).toMatchObject({ ok: false, code: 'refused' })
    // Teo's Task, asked by Bia: Teo may not ask Bia back (she is in the chain)
    const teo = ticketOf(h, 'Teo')!
    expect(call(h, 'ask_colleague', teo, 'teo', { ...ASK, colleague: 'Bia', title: 'Volta' })).toMatchObject({ ok: false, code: 'refused' })
    await settle(h)
  })

  it('pass_forward: the work goes on to Teo with Bia\'s bilhete, Bia does NOT wait, and a delivery line that says the same does not open a second Task', async () => {
    const h = open()
    say(h, 'u1', '@Bia escreva os 3 posts e depois o Teo faz a arte')
    const bia = ticketOf(h, 'Bia')!
    const answer = call(h, 'pass_forward', bia, 'bia', { ...ASK, title: 'Arte dos 3 posts' })
    expect(answer).toMatchObject({ ok: true, colleague: 'Teo' })
    expect(String(answer.next)).toMatch(/não é sua/u)
    expect(ticketOf(h, 'Teo')?.mandate.actor).toEqual(bia.mandate.actor)
    // Bia delivers and, as models do, also says "@Teo faça a arte": the pass-on already happened with the tool
    script(h, ['Texto pronto.\n@Teo faça a arte dos 3 posts', 'Arte pronta.'])
    await settle(h)
    expect(tickets(h).filter(ticket => ticket.execution?.name === 'Teo')).toHaveLength(1)
    expect(latestAssignment(h.orchestration.runtime('pp').repo.tickets.get(bia.id)!)?.report?.state).toBe('ready') // she was not held waiting for him
  })
})

describe('the ACL branches of the door (stubbed host)', () => {
  const run = { personaId: 'bia', ticketId: 't1', assignmentId: 'a1' }
  const base = (over: Partial<{ initiator: 'person-request' | 'persona-initiative'; autonomy: 'asked' | 'propose' | 'act'; trigger: string; review: boolean }>): { team: TeamTools; asked: unknown[] } => {
    const asked: unknown[] = []
    const people = [
      { id: 'bia', name: 'Bia', title: 'Redação' }, { id: 'teo', name: 'Teo', title: 'Arte' },
      { id: 'ana2', name: 'Teo', title: 'Design' }, { id: 'lia', name: 'Lia', title: 'Revisão' }, { id: 'ivo', name: 'Ivo', title: 'Revisão' },
    ]
    const deps = {
      enabled: () => true,
      product: { listPersonas: () => people },
      harness: { identityOf: () => ({ workspaceId: 'ws', projectId: 'pp', personaId: 'bia', initiator: over.initiator ?? 'person-request', autonomy: over.autonomy ?? 'act', callId: 'c' }) },
      handoffs: {
        ask: (input: unknown) => { asked.push(input); return { ok: true, status: 'asked', requestId: 'r1' } },
        verdict: () => ({ ok: true, verdict: 'approve', points: 0 }),
        isReviewTask: () => over.review === true,
      },
      limitsOf: () => ({ canAskColleagues: true, askCapPerDay: 6 }),
      ticketOf: () => ({ origin: { triggerId: over.trigger ?? 'u1' } }),
    } as unknown as TeamToolsDeps
    return { team: new TeamTools(deps), asked }
  }
  const go = (team: TeamTools, tool: HarnessCall['tool'], args: Record<string, unknown> = { colleague: 'Lia', title: 'x', needed: ['y'] }): Record<string, unknown> =>
    JSON.parse(team.call({ tool, run, args, callId: 'c1' })) as Record<string, unknown>

  it('her own INITIATIVE: only when the person let her act (a campaign step is the person\'s plan, not her initiative)', () => {
    expect(go(base({ initiator: 'persona-initiative', autonomy: 'propose' }).team, 'ask_colleague')).toMatchObject({ ok: false, code: 'needs-person' })
    expect(go(base({ initiator: 'persona-initiative', autonomy: 'asked' }).team, 'pass_forward')).toMatchObject({ ok: false, code: 'needs-person' })
    expect(go(base({ initiator: 'persona-initiative', autonomy: 'act' }).team, 'ask_colleague')).toMatchObject({ ok: true })
    expect(go(base({ initiator: 'persona-initiative', autonomy: 'propose', trigger: 'campaign:plan1:0' }).team, 'ask_colleague')).toMatchObject({ ok: true })
    expect(go(base({ initiator: 'person-request', autonomy: 'asked' }).team, 'ask_colleague')).toMatchObject({ ok: true })
  })

  it('names: an ambiguous one is refused with the roster, a title that is unique works, kind follows the tool', () => {
    const ambiguous = base({})
    expect(go(ambiguous.team, 'ask_colleague', { colleague: 'Teo', title: 'x', needed: ['y'] })).toMatchObject({ ok: false, code: 'ambiguous-colleague' })
    expect(go(ambiguous.team, 'ask_colleague', { colleague: 'revisao', title: 'x', needed: ['y'] })).toMatchObject({ ok: false, code: 'ambiguous-colleague' })
    expect(ambiguous.asked).toHaveLength(0)
    const fine = base({})
    expect(go(fine.team, 'ask_colleague', { colleague: 'Design', title: 'x', needed: ['y'] })).toMatchObject({ ok: true })
    expect(go(fine.team, 'pass_forward', { colleague: 'ana2', title: 'x', needed: ['y'] })).toMatchObject({ ok: true })
    expect(fine.asked).toMatchObject([{ kind: 'help', toPersonaId: 'ana2', fromTicketId: 't1', fromPersonaId: 'bia', callId: 'c1' }, { kind: 'next', toPersonaId: 'ana2' }])
  })

  it('a model writes a name the way it likes: "@Lia", "Lia (Revisão)", "Lia — Revisão", "lia" all mean Lia', () => {
    const { team, asked } = base({})
    for (const [at, colleague] of ['@Lia', 'Lia (Revisão)', 'Lia — Revisão', 'Lia - Revisão', 'lia', '@Lia: a revisão final'].entries()) {
      expect(go(team, 'ask_colleague', { colleague, title: 'x', needed: ['y'] }), colleague).toMatchObject({ ok: true, colleague: 'Lia' })
      expect(asked[at], colleague).toMatchObject({ toPersonaId: 'lia' })
    }
    // a name that matches nobody is still refused with the roster, however it is written
    expect(go(team, 'ask_colleague', { colleague: '@Zé (Dados)', title: 'x', needed: ['y'] })).toMatchObject({ ok: false, code: 'unknown-colleague' })
  })

  it('a review Task only gives a verdict; the others cannot', () => {
    const reviewing = base({ review: true })
    expect(go(reviewing.team, 'ask_colleague')).toMatchObject({ ok: false, code: 'review-task' })
    expect(go(reviewing.team, 'pass_forward')).toMatchObject({ ok: false, code: 'review-task' })
    expect(go(reviewing.team, 'review_verdict', { verdict: 'approve' })).toMatchObject({ ok: true, verdict: 'approve' })
  })

  it('composes in front of the ports: it announces its three tools, serves them, and leaves every other call to the base', async () => {
    const seen: string[] = []
    const ports = withTeamTools({ tools: ['board_list', 'ask_team_opinion'], call: (input) => { seen.push(input.tool); return Promise.resolve('{"ok":true,"base":true}') } }, base({}).team)
    expect(ports.tools).toEqual(['board_list', 'ask_team_opinion', ...TEAM_TOOLS])
    const args = { colleague: 'Lia', title: 'x', needed: ['y'] }
    expect(JSON.parse(await ports.call!({ tool: 'ask_colleague', run, args, callId: 'c' }))).toMatchObject({ ok: true, colleague: 'Lia' })
    expect(JSON.parse(await ports.call!({ tool: 'board_list', run, args: {}, callId: 'c2' }))).toMatchObject({ base: true })
    expect(seen).toEqual(['board_list'])
  })
})

describe('review_verdict: the reviewer\'s own call is the verdict (the words are the fallback)', () => {
  const reviewerTicket = (h: PersonaHost): Ticket => ticketOf(h, 'Guia')!

  it('"approve" by tool, whatever the reviewer says afterwards: the work goes on with the seal; "changes" sends it back with the points, twice at most', async () => {
    const h = open('on')
    script(h, [
      'Texto pronto.',
      // Guia reviews: she calls the tool; the words she says afterwards are NOT a verdict ("Pode seguir…")
      () => { expect(call(h, 'review_verdict', reviewerTicket(h), 'guia', { verdict: 'changes', points: ['Falta o preço no segundo post'] })).toMatchObject({ ok: true, verdict: 'changes', points: 1 }); return 'Devolvi com um ponto.' },
      'Texto ajustado com o preço.',
      () => { expect(call(h, 'review_verdict', reviewerTicket(h), 'guia', { verdict: 'approve' })).toMatchObject({ ok: true, verdict: 'approve' }); return 'Pode seguir, ficou legal.' },
    ])
    say(h, 'u1', '@Bia escreva os 3 posts da campanha')
    await settle(h)
    const bia = ticketOf(h, 'Bia')!
    expect(h.handoffs.reviewedBy('pp', bia.id)).toMatchObject({ personaId: 'guia' })
    expect(h.handoffs.reviewFailure('pp', bia.id)).toBeUndefined()
    expect(latestAssignment(h.orchestration.runtime('pp').repo.tickets.get(bia.id)!)?.report?.state).toBe('ready')
    const reviews = thread(h).flatMap(row => row.review === undefined ? [] : [row.review])
    expect(reviews.map(row => row.kind)).toEqual(['returned', 'reviewed'])
    expect(JSON.stringify(thread(h))).not.toContain('Pode seguir') // the reviewer's words never reach the person
  })

  it('without the tool the words still work; a review Task that gives neither is unreadable and never holds the delivery', async () => {
    const h = open('on')
    script(h, ['Texto pronto.', 'APROVADO\nTudo certo.'])
    say(h, 'u1', '@Bia escreva os 3 posts da campanha')
    await settle(h)
    expect(h.handoffs.reviewedBy('pp', ticketOf(h, 'Bia')!.id)).toMatchObject({ personaId: 'guia' })
    const other = open('on')
    script(other, ['Texto pronto.', 'Ficou ótimo, parabéns.'])
    say(other, 'u1', '@Bia escreva os 3 posts da campanha')
    await settle(other)
    expect(other.handoffs.reviewFailure('pp', ticketOf(other, 'Bia')!.id)).toBe('unreadable')
    expect(latestAssignment(other.orchestration.runtime('pp').repo.tickets.get(ticketOf(other, 'Bia')!.id)!)?.report?.state).toBe('ready')
  })

  it('only a review Task can give a verdict, only while it is waiting for it, and "changes" needs its points', async () => {
    const h = open('on')
    script(h, [
      'Texto pronto.',
      () => {
        const guia = reviewerTicket(h)
        expect(call(h, 'review_verdict', guia, 'guia', { verdict: 'changes' })).toMatchObject({ ok: false, code: 'refused', message: expect.stringMatching(/pontos|aprove/u) })
        expect(call(h, 'review_verdict', guia, 'guia', { verdict: 'talvez' })).toMatchObject({ ok: false, code: 'refused' })
        // a colleague who is not the reviewer cannot answer for her
        expect(call(h, 'review_verdict', guia, 'teo', { verdict: 'approve' })).toMatchObject({ ok: false })
        return 'APROVADO'
      },
    ])
    say(h, 'u1', '@Bia escreva os 3 posts da campanha')
    // Bia's own Task is not a review: the verdict is not hers to give
    expect(call(h, 'review_verdict', ticketOf(h, 'Bia')!, 'bia', { verdict: 'approve' })).toMatchObject({ ok: false, code: 'refused', message: expect.stringMatching(/não está revisando/u) })
    await settle(h)
    expect(h.handoffs.reviewedBy('pp', ticketOf(h, 'Bia')!.id)).toMatchObject({ personaId: 'guia' })
    // after the review ended, a late call changes nothing
    expect(call(h, 'review_verdict', reviewerTicket(h), 'guia', { verdict: 'changes', points: ['tarde'] })).toMatchObject({ ok: false })
  })
})
