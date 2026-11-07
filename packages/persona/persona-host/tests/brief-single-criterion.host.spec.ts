/**
 * Keel 04:16 (Bolt's reading of the transcript): ONE criterion for "waits for the person" — a Task that waits for the person's review is in
 * "Precisa de você" and NOT also in "Hoje" (nor "working"): the same Task never appears in two sections. A PASSAGE of the work (a colleague took over
 * the next part) that was delivered waits for the person like any Task; a request for help or a review a colleague was asked for is a step of the team.
 * Also the card's `variant` (Prism, Keel 04:17): the scheduled card is `morning`, the one asked for by hand in the afternoon is `on-demand`.
 */
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' }
const GOAL = 'Monte um time para a campanha de Natal: texto, arte e posts'

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  const make = (id: string, name: string, title: string, description: string, roles: readonly ('coordination' | 'team_manager')[] = []) => h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id, name, title, description, personality: 'Clara.', instructions: 'Ajude.',
    avatarKind: 'gallery', avatarRef: id, runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: true, createdBy: 'ana',
    ...(roles.length === 0 ? {} : { systemRoles: roles }),
  })
  make('atlas', 'Atlas', 'Coordenação', 'Coordena.', ['coordination', 'team_manager'])
  make('bia', 'Bia', 'Redação', 'Escreve textos e legendas.')
  make('teo', 'Teo', 'Design', 'Cria artes, cartazes e identidade visual.')
  make('caio', 'Caio', 'Mídia social', 'Cuida de posts e redes sociais.')
}

const thread = (h: PersonaHost) => h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events

async function settle(h: PersonaHost): Promise<void> {
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp')
}

function script(h: PersonaHost, texts: readonly string[]): void {
  const queue = [...texts]
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => queue.shift(), set: () => undefined })
}

/** The campaign of the Gestor, run to the end: three chained Tasks (the 2nd and 3rd are PASSAGES), all delivered and waiting for the person's review. */
async function deliveredCampaign(h: PersonaHost): Promise<void> {
  seed(h)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.timezoneOffsetMinutes = () => -180
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  script(h, ['Texto da campanha pronto.', 'Arte final dos posts pronta.', 'Posts da campanha prontos.'])
  h.proposeGestorAssemble({ ...scope, gestorId: 'atlas', id: 'campanha', goal: GOAL })
  h.approveGestorPlan({ workspaceId: 'ws', planId: 'campanha' })
  await settle(h)
}

it('a delivered PASSAGE waits for the person in "Precisa de você" and is NOT also a line of "Hoje": no Task is in two sections', async () => {
  const h = host()
  try {
    await deliveredCampaign(h)
    const review = h.orchestration.kanban('pp').filter(card => card.column === 'review').map(card => card.ticketId)
    expect(review.length).toBe(3) // Bia's part and the two passages (Teo, Caio): all delivered, all waiting for the person
    const handoffTasks = h.orchestration.runtime('pp').repo.tickets.list().filter(ticket => ticket.origin.triggerId.startsWith('handoff:')).map(ticket => ticket.id)
    expect(handoffTasks.length).toBeGreaterThan(0) // the passages exist as Tasks of their own
    h.orchestration.now = () => '2026-11-05T12:00:00.000Z' // 09:00 in São Paulo
    expect(h.morningBrief.check('pp', 'app-open')).toBe('posted')
    const brief = thread(h).find(row => row.dailyBrief !== undefined)?.dailyBrief
    expect(brief).toBeDefined()
    expect(brief?.needsYou.count).toBe(3) // every delivered part waits, passages included
    const today = (brief?.today ?? []).map(line => line.taskId)
    expect(today.filter(id => review.includes(id)), 'a Task that waits for the person is not also "working"').toEqual([])
    expect(brief?.today).toEqual([])
    // and the text of the card agrees: it says what waits and does not list those Tasks as work in progress
    const body = thread(h).find(row => row.dailyBrief !== undefined)?.body ?? ''
    expect(body).toContain('Precisa de você: 3 coisas esperam você.')
    expect(body).not.toContain('Hoje:')
  } finally {
    h.teamworkEnabled = false
  }
})

it('the reminder of what waits for the person (EQ-14) reads the SAME criterion: the delivered passages are in it, a help or a review a colleague did is not', async () => {
  const h = host()
  try {
    await deliveredCampaign(h)
    const waiting = Reflect.get(h.personWaiting, 'deps') as { waiting: (projectId: string) => Array<{ taskId: string }> }
    const reminded = waiting.waiting('pp').map(row => row.taskId).sort()
    const review = h.orchestration.kanban('pp').filter(card => card.column === 'review').map(card => card.ticketId).sort()
    expect(reminded).toEqual(review) // the same Tasks as "Precisa de você", no more, no fewer
  } finally {
    h.teamworkEnabled = false
  }
})

it('the card says its kind: the SCHEDULED one is "morning" ("Bom dia."), and asked again in the afternoon with nothing new it is the same card, not a second', async () => {
  const h = host()
  try {
    await deliveredCampaign(h)
    h.orchestration.now = () => '2026-11-05T12:00:00.000Z' // 09:00 local
    expect(h.morningBrief.check('pp', 'app-open')).toBe('posted')
    const morning = thread(h).find(row => row.dailyBrief !== undefined)
    expect(morning?.dailyBrief?.variant).toBe('morning')
    expect(morning?.body.startsWith('Bom dia.')).toBe(true)
    h.orchestration.now = () => '2026-11-05T18:00:00.000Z' // 15:00 local, nothing changed since the card of the day
    const asked = h.postDailyBriefNow({ ...scope, requestId: 'r1' })
    expect(asked.outcome).toBe('already') // asked by hand when nothing changed: that card IS the answer (Muse), no second one
    expect(thread(h).filter(row => row.dailyBrief !== undefined)).toHaveLength(1)
  } finally {
    h.teamworkEnabled = false
  }
})

it('the card asked for by hand in the afternoon, with no card of the day yet, is "on-demand": "Resumo do dia.", never a "Bom dia" at 15:00', async () => {
  const h = host()
  try {
    await deliveredCampaign(h)
    h.orchestration.now = () => '2026-11-05T18:00:00.000Z' // 15:00 local
    const asked = h.postDailyBriefNow({ ...scope, requestId: 'r1' })
    expect(asked.outcome).toBe('posted')
    const cards = thread(h).filter(row => row.dailyBrief !== undefined)
    expect(cards).toHaveLength(1)
    expect(cards[0]?.dailyBrief?.variant).toBe('on-demand')
    expect(cards[0]?.body.startsWith('Resumo do dia.')).toBe(true)
  } finally {
    h.teamworkEnabled = false
  }
})

it('the text of a finished REQUEST names no person: "<pedido> ficou pronta (Texto, Arte e Posts)", never "Lia terminou …" (Bolt, transcript)', async () => {
  const h = host()
  try {
    await deliveredCampaign(h)
    h.orchestration.now = () => '2026-11-05T12:00:00.000Z'
    for (const card of h.orchestration.kanban('pp').filter(row => row.column === 'review')) h.orchestration.completeReview('pp', card.ticketId)
    h.orchestration.now = () => '2026-11-06T12:00:00.000Z' // the next morning, 09:00 local
    expect(h.morningBrief.check('pp', 'app-open')).toBe('posted')
    const body = thread(h).filter(row => row.dailyBrief !== undefined).at(-1)?.body ?? ''
    expect(body).toMatch(/Ontem: .+ ficou pronta \((texto|arte|posts)(, | e )(texto|arte|posts)(, | e )(texto|arte|posts)\)\./iu)
    expect(body).not.toMatch(/terminou/u) // no person is credited for the whole request
    expect(body).not.toContain('Atlas terminou')
  } finally {
    h.teamworkEnabled = false
  }
})
