import { latestAssignment, type Ticket } from '@deepseek-ai/dsh-persona-engine'
import type { HarnessCall } from '@deepseek-ai/dsh-persona-runners'
import { expect, onTestFinished } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { TEAM_GUIDANCE_PLANNED } from '../src/harness-team.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * D100-1 (D-100, REVISÃO-01 §A1): a request that lists functions ("texto, arte e posts") is split by the host, and the parts are a CHAIN, not a race: the art is made FROM the text
 * and the posts FROM the art. Before this, the three parts started together, the text-maker was told to `pass_forward` the art and the host ALSO had an art part: two arts, 12 turns and
 * 469k tokens in the real round. Now: one turn per part, in chain order, the next part `waiting` (no turn, no cost) until the one before delivered, the delivery reaching it WHOLE, and a
 * `pass_forward` to a colleague who already has her part in the plan refused in words.
 */
const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
  { id: 'teo', name: 'Teo', title: 'Design' },
  { id: 'caio', name: 'Caio', title: 'Mídia' },
  { id: 'duda', name: 'Duda', title: 'Atendimento' },
]
const CAMPAIGN = 'preciso de uma campanha de lançamento do nosso produto: texto, arte e posts'
const BIA_TEXT = 'Texto da Bia: “Pão quentinho toda manhã na Padaria Lua. Venha provar!” Chamada: Abrimos às 7h.'
const TEO_ART = 'Arte do Teo: cartaz verde-sálvia com a frase da Bia centralizada e um pão de queijo no canto.'
const CAIO_POSTS = 'Posts do Caio: 3 posts curtos a partir da arte do cartaz.'

function rig(review: 'on' | 'off' = 'off'): PersonaHost {
  const before = process.env.PERSONA_PRODUCT_TOOLS
  process.env.PERSONA_PRODUCT_TOOLS = '1' // the product tools (and the paragraph about the team) are OFF under Vitest unless asked
  onTestFinished(() => { if (before === undefined) delete process.env.PERSONA_PRODUCT_TOOLS; else process.env.PERSONA_PRODUCT_TOOLS = before })
  const h = openJourney('2026-11-11T12:00:00.000Z')
  seedJourney(h, TEAM)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  if (review === 'off') h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  for (const row of TEAM) { // what the product creates: persona on a CLI with NO file/shell grant (`tools: {}`)
    const persona = h.product.getPersona(row.id)!
    h.product.updatePersona({ ...persona, runner: { kind: 'cli', cli: 'claude', model: 'haiku' }, tools: {} }, 'pp')
  }
  return h
}

/** What each live turn says, one step per turn in the order the turns run (a function step runs inside the turn, to look at the host while it is in flight). */
function script(h: PersonaHost, steps: ReadonlyArray<string | (() => string)>): void {
  const queue = [...steps]
  Object.defineProperty(h.orchestration, 'liveText', {
    configurable: true,
    get: () => { const next = queue.shift(); return typeof next === 'function' ? next() : next },
    set: () => undefined,
  })
}

async function settle(h: PersonaHost): Promise<void> {
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp')
}

async function ask(h: PersonaHost, body: string, id = 'u1'): Promise<string> {
  h.postMessage({ id, ...SCOPE, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: id })
  await settle(h)
  return id
}

const tickets = (h: PersonaHost): Ticket[] => h.orchestration.runtime('pp').repo.tickets.list().filter(item => !item.title.startsWith('Revisar:'))
const ticketOf = (h: PersonaHost, name: string): Ticket | undefined => tickets(h).find(item => item.execution?.name === name)
const turnsOf = (h: PersonaHost, personaId: string) => h.orchestration.turnInputs.filter(row => row.personaId === personaId && row.purpose === 'task')
/** The order the work turns ran in (reviews are another feature's). */
const order = (h: PersonaHost): string[] => h.orchestration.turnInputs.filter(row => row.purpose === 'task').map(row => row.personaId)

const call = (h: PersonaHost, tool: HarnessCall['tool'], ticket: Ticket, personaId: string, args: Record<string, unknown>, callId = `${ticket.id}:l:1`): Record<string, unknown> =>
  JSON.parse(h.teamTools.call({ tool, run: { personaId, ticketId: ticket.id, assignmentId: ticket.assignments[0]?.id ?? 'a1' }, args, callId })) as Record<string, unknown>

it('texto, arte e posts: ONE turn per part, in chain order, and each part reads the WHOLE delivery of the one before it', async () => {
  const h = rig()
  script(h, [BIA_TEXT, TEO_ART, CAIO_POSTS])
  await ask(h, CAMPAIGN)
  expect(tickets(h).map(item => item.execution?.name).sort()).toEqual(['Bia', 'Caio', 'Teo']) // the three Tasks exist (plan card, sisters, closing line unchanged)
  expect(order(h)).toEqual(['bia', 'teo', 'caio']) // exactly one turn each: ONE art
  expect(turnsOf(h, 'teo')).toHaveLength(1)
  // The art is made FROM the text, exactly as Bia wrote it; the posts FROM the art.
  expect(turnsOf(h, 'teo')[0]?.prompt).toContain(BIA_TEXT)
  expect(turnsOf(h, 'caio')[0]?.prompt).toContain(TEO_ART)
  expect(turnsOf(h, 'bia')[0]?.prompt).not.toContain('Arte do Teo')
  // The consumer is told, in words, that it works FROM the delivery (data, not instruction).
  expect(ticketOf(h, 'Teo')?.execution?.assignment).toContain('Bia (texto) faz a parte dela ANTES da sua')
  expect(ticketOf(h, 'Caio')?.execution?.assignment).toContain('Teo (arte) faz a parte dela ANTES da sua')
  // Everything ended: nothing is left waiting.
  for (const row of tickets(h)) expect(latestAssignment(row)?.report?.state, row.title).toBe('ready')
})

it('the part that waits costs NOTHING while it waits: written "arte e texto", Teo\'s slot comes first — no turn of hers, the card says who she waits for, then she runs ONCE with the text', async () => {
  const h = rig()
  let waiting: { state: string | undefined; summary: string | undefined; ran: string[] } | undefined
  script(h, [
    () => {
      // Inside Bia's turn: Teo's slot already came (she was written first) and she did NOT run.
      const report = latestAssignment(ticketOf(h, 'Teo')!)?.report
      waiting = { state: report?.state, summary: report?.summary, ran: order(h) }
      return BIA_TEXT
    },
    TEO_ART,
  ])
  await ask(h, 'preciso da arte e do texto do cartaz de lançamento do nosso produto')
  expect(tickets(h).map(item => item.execution?.name).sort()).toEqual(['Bia', 'Teo'])
  expect(waiting).toEqual({ state: 'waiting', summary: 'Esperando Bia: texto', ran: ['bia'] })
  expect(order(h)).toEqual(['bia', 'teo']) // the art is NOT made before the text exists
  expect(turnsOf(h, 'teo')).toHaveLength(1)
  expect(turnsOf(h, 'teo')[0]?.prompt).toContain(BIA_TEXT)
  expect(latestAssignment(ticketOf(h, 'Teo')!)?.report?.state).toBe('ready')
})

it('the orientation of a part of a plan does NOT tell the model to pass the rest on: the other parts are in the host\'s plan and start by themselves', async () => {
  const h = rig()
  script(h, [BIA_TEXT, TEO_ART, CAIO_POSTS])
  await ask(h, CAMPAIGN)
  const bia = turnsOf(h, 'bia')[0]!.prompt
  expect(bia).toContain(TEAM_GUIDANCE_PLANNED)
  expect(bia).toContain('Outras partes deste pedido, já no plano do app: Caio (posts), Teo (arte).')
  expect(bia).not.toContain('passe a ele (pass_forward) em vez de fazer sozinha') // the old sentence that made a second art
  // A request that is NOT a split keeps the usual orientation (the model decides when to use the team).
  const lone = rig()
  script(lone, ['Texto pronto.'])
  await ask(lone, '@Bia escreva o texto da página inicial')
  expect(turnsOf(lone, 'bia')[0]?.prompt).not.toContain(TEAM_GUIDANCE_PLANNED)
  expect(turnsOf(lone, 'bia')[0]?.prompt).toContain('pass_forward')
})

it('HARD GUARD: pass_forward to a colleague who already has her part in the plan is refused in words, and opens nothing', async () => {
  const h = rig()
  script(h, [BIA_TEXT, TEO_ART, CAIO_POSTS])
  await ask(h, CAMPAIGN)
  const bia = ticketOf(h, 'Bia')!
  const before = h.orchestration.runtime('pp').repo.tickets.list().length
  const refused = call(h, 'pass_forward', bia, 'bia', { colleague: 'Teo', title: 'A arte', done: ['texto'], needed: ['arte'] })
  expect(refused).toMatchObject({ ok: false, code: 'planned' })
  expect(String(refused.message)).toContain('Teo já tem a parte dela (arte)')
  expect(String(refused.message)).toContain('e já entregou') // the part is delivered by now
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(before) // no second art Task
  expect(turnsOf(h, 'teo')).toHaveLength(1)
  // Asking for help is not passing the work on: it stays open to a planned colleague, and a colleague who is NOT in the plan can still be passed work.
  const help = call(h, 'ask_colleague', bia, 'bia', { colleague: 'Teo', title: 'Dúvida de cor', needed: ['Qual verde?'] }, 'help-1')
  expect(help.ok).toBe(true)
  const other = call(h, 'pass_forward', bia, 'bia', { colleague: 'Duda', title: 'Avisar clientes', done: ['texto'], needed: ['avisar'] }, 'pass-2')
  expect(other.ok).toBe(true)
})

it('a part before the guard: a part that has NOT delivered yet says so, and the part is still not passed', async () => {
  const h = rig()
  let refused: Record<string, unknown> | undefined
  script(h, [
    () => {
      refused = call(h, 'pass_forward', ticketOf(h, 'Bia')!, 'bia', { colleague: 'Teo', title: 'A arte', done: [], needed: ['arte'] }, 'early-1')
      return BIA_TEXT
    },
    TEO_ART,
    CAIO_POSTS,
  ])
  await ask(h, CAMPAIGN)
  expect(refused).toMatchObject({ ok: false, code: 'planned' })
  expect(String(refused?.message)).toContain('começa sozinha quando chegar a vez dela')
  expect(order(h)).toEqual(['bia', 'teo', 'caio'])
})

it('a line "@Teo faça a arte" in the delivery of the text opens NO second art: Teo already has her part in the plan, and the pass-on from words is for colleagues who do not', async () => {
  const h = rig()
  script(h, ['Texto pronto.\n@Teo faça a arte do cartaz com esse texto', TEO_ART, CAIO_POSTS])
  await ask(h, CAMPAIGN)
  expect(tickets(h).filter(item => item.execution?.name === 'Teo')).toHaveLength(1)
  expect(h.events.listProject('pp').filter(item => item.id.startsWith('handoff:'))).toHaveLength(0) // no request was opened to anyone
  expect(order(h)).toEqual(['bia', 'teo', 'caio'])
  // …while the same words to a colleague who is NOT in the plan still pass the work on (the old behavior stays).
  const other = rig()
  script(other, ['Texto pronto.\n@Duda faça a lista de respostas para os clientes do lançamento', TEO_ART, CAIO_POSTS, 'Clientes avisados.'])
  await ask(other, CAMPAIGN)
  expect(tickets(other).filter(item => item.execution?.name === 'Duda')).toHaveLength(1)
})

it('a paused persona is out of the chain: she does not hold the others, and the rest still go in order', async () => {
  const h = rig()
  h.orchestration.setPersonaPaused('pp', 'bia', true)
  script(h, [TEO_ART, CAIO_POSTS])
  await ask(h, CAMPAIGN)
  expect(order(h)).toEqual(['teo', 'caio'])
  expect(turnsOf(h, 'caio')[0]?.prompt).toContain(TEO_ART)
})

it('a function outside the chain (atendimento) stays parallel: it does not wait for the text', async () => {
  const h = rig()
  let ranInsideBia: string[] = []
  script(h, [
    () => { ranInsideBia = order(h); return BIA_TEXT },
    'Atendimento: respostas prontas.',
    TEO_ART,
  ])
  await ask(h, 'preciso de texto e atendimento para o lançamento do nosso produto novo')
  expect(tickets(h).map(item => item.execution?.name).sort()).toEqual(['Bia', 'Duda'])
  expect(ranInsideBia).toEqual(['bia']) // Duda was waiting for no one: she starts with the first turn, not after it
  expect(turnsOf(h, 'duda')).toHaveLength(1)
})

it('with the review ON the next part waits for the REVIEWED text: bia → review → teo, one art', async () => {
  const h = rig('on')
  script(h, [BIA_TEXT, 'APROVADO. Sem pontos em aberto.', TEO_ART, 'APROVADO.', CAIO_POSTS, 'APROVADO.'])
  await ask(h, CAMPAIGN)
  const works = order(h)
  expect(works.indexOf('bia')).toBeLessThan(works.indexOf('teo'))
  expect(works.indexOf('teo')).toBeLessThan(works.indexOf('caio'))
  expect(turnsOf(h, 'teo')).toHaveLength(1) // never two arts
})
