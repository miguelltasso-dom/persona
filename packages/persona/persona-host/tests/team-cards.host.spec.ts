/**
 * EQUIPE-REAL §0 (Muse, 05/11): a request done in parts is TWO cards, not a stream of status lines: the PLAN once (by the Coordenação,
 * its chips changing in place) and ONE delivery card when every part is ready. Once they exist, the lines they replace ("Em andamento",
 * "Pronto" of each part, the closing "Concluído") are not shown — the person never loses the signal that it finished, because the
 * delivery card is that signal. Without `Config.teamwork` nothing of this exists.
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

function script(h: PersonaHost, texts: readonly string[]): void {
  const queue = [...texts]
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => queue.shift(), set: () => undefined })
}

const thread = (h: PersonaHost) => h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events

async function settle(h: PersonaHost): Promise<void> {
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp')
}

it('a campaign: ONE plan card by the Coordenação (all three parts, the ones not open yet "queued"), then ONE delivery card — and no status line in between', async () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } }) // the review has its own spec
  try {
    script(h, ['Texto da campanha pronto.', 'Arte da campanha pronta.', 'Posts da campanha prontos.'])
    h.proposeGestorAssemble({ ...scope, gestorId: 'atlas', id: 'campanha', goal: GOAL })
    h.approveGestorPlan({ workspaceId: 'ws', planId: 'campanha' })
    await settle(h)
    const lines = thread(h)
    const plans = lines.filter(row => row.teamPlan !== undefined)
    expect(plans, 'one plan card per request').toHaveLength(1)
    const [plan] = plans
    expect(plan?.id).toBe('team-plan:campanha')
    expect(plan?.actorId).toBe('atlas') // the Coordenação speaks
    expect(plan?.body).toMatch(/^Dividi assim: /u)
    expect(plan?.teamPlan).toMatchObject({ requestId: 'campanha', title: 'Campanha de Natal' })
    expect(plan?.teamPlan?.parts.map(part => part.title)).toEqual(['Texto da campanha de Natal', 'Arte da campanha de Natal', 'Posts da campanha de Natal'])
    expect(plan?.teamPlan?.parts.map(part => part.personaId)).toEqual(['bia', 'teo', 'caio'])
    // the chips are LIVE: every part delivered and waiting for the person (or done)
    expect(plan?.teamPlan?.parts.every(part => part.taskId !== '' && (part.status === 'needs-you' || part.status === 'done'))).toBe(true)
    // one delivery card, with a button that goes somewhere (the card of Aprovações of a part that waits)
    const deliveries = lines.filter(row => row.deliveryCard !== undefined)
    expect(deliveries, 'one delivery card per request').toHaveLength(1)
    expect(deliveries[0]?.actorId).toBe('atlas')
    expect(deliveries[0]?.deliveryCard).toMatchObject({ requestId: 'campanha', title: 'Campanha de Natal' })
    expect(deliveries[0]?.deliveryCard?.parts.map(part => part.personaId)).toEqual(['bia', 'teo', 'caio'])
    expect(deliveries[0]?.body).toMatch(/^Pronto: Campanha de Natal\./u)
    // what the cards REPLACE is not in the thread: no "Em andamento", no "Pronto" of a part, no closing "Concluído"
    const spoken = lines.map(row => row.body)
    expect(spoken.filter(body => body.startsWith('Em andamento:'))).toEqual([])
    expect(spoken.filter(body => /^Pronto: (Texto|Arte|Posts) /u.test(body))).toEqual([])
    expect(spoken.filter(body => body.startsWith('Concluído'))).toEqual([])
    // and still: nothing technical, the passes between colleagues are there
    expect(lines.every(row => !row.actorId.includes(':'))).toBe(true)
    expect(lines.filter(row => row.handoff?.status === 'asked')).toHaveLength(2)
  } finally {
    h.teamworkEnabled = false
  }
})

it('the plan card is the SAME message when a part moves: the stream re-sends it as an upsert of the same id, never a new line', async () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  try {
    script(h, ['Texto da campanha pronto.', 'Arte da campanha pronta.', 'Posts da campanha prontos.'])
    h.proposeGestorAssemble({ ...scope, gestorId: 'atlas', id: 'campanha', goal: GOAL })
    const abort = new AbortController()
    const frames: Array<{ kind: string; ids: string[] }> = []
    const reading = (async () => {
      for await (const frame of h.followMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 100 }, abort.signal)) {
        frames.push({ kind: frame.kind, ids: frame.events.map(row => row.id) })
      }
    })()
    await new Promise(resolve => setTimeout(resolve, 60))
    h.approveGestorPlan({ workspaceId: 'ws', planId: 'campanha' })
    await settle(h)
    await new Promise(resolve => setTimeout(resolve, 150))
    abort.abort()
    await reading
    const planFrames = frames.filter(frame => frame.ids.includes('team-plan:campanha'))
    expect(planFrames.length, 'the plan came and was updated in place').toBeGreaterThanOrEqual(2)
    // the SAME id in every frame, and the plan is one message of the thread (no second one)
    expect(thread(h).filter(row => row.id.startsWith('team-plan:'))).toHaveLength(1)
  } finally {
    h.teamworkEnabled = false
  }
})

it('the cards use the SHORT name of each part, list ALL the parts, and the morning card groups a finished request in ONE line', async () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.timezoneOffsetMinutes = () => -180
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  try {
    script(h, ['Texto da campanha pronto.', 'Arte da campanha pronta.', 'Posts da campanha prontos.'])
    h.proposeGestorAssemble({ ...scope, gestorId: 'atlas', id: 'campanha', goal: GOAL })
    h.approveGestorPlan({ workspaceId: 'ws', planId: 'campanha' })
    await settle(h)
    const plan = thread(h).find(row => row.teamPlan !== undefined)
    expect(plan?.teamPlan?.parts).toHaveLength(3) // Caio is on the card, whatever moment it was written
    expect(plan?.teamPlan?.parts.map(part => part.shortName.toLowerCase())).toEqual(['texto', 'arte', 'posts'])
    expect(plan?.teamPlan?.parts.every(part => part.shortName.length <= 24 && part.title.length > part.shortName.length)).toBe(true)
    expect(plan?.body).toMatch(/^Dividi assim: Bia — Texto; Teo — Arte; Caio — Posts\.$/iu) // the body is read live too, with every part
    const delivery = thread(h).find(row => row.deliveryCard !== undefined)
    expect(delivery?.deliveryCard?.parts.map(part => part.shortName.toLowerCase())).toEqual(['texto', 'arte', 'posts'])
    // the next morning: yesterday is ONE line for the whole request, not three with the long title
    const rt = h.orchestration.runtime('pp').repo.tickets
    for (const part of plan?.teamPlan?.parts ?? []) {
      const ticket = rt.get(part.taskId)
      if (ticket !== undefined) rt.save({ ...ticket, ended: { at: '2026-11-03T14:00:00.000Z', by: 'human', outcome: 'completed' } })
    }
    h.orchestration.now = () => '2026-11-04T11:00:00.000Z'
    expect(h.morningBrief.check('pp', 'app-open')).toBe('posted')
    const brief = thread(h).find(row => row.dailyBrief !== undefined)?.dailyBrief
    expect(brief?.yesterday).toHaveLength(1)
    expect(brief?.yesterday[0]?.title).toMatch(/^Campanha de Natal \(Texto, Arte e Posts\)$/iu)
    expect(brief?.yesterday[0]?.personaId).toBe('atlas')
    expect(brief?.yesterday[0]?.request).toMatchObject({ requestId: 'campanha', title: 'Campanha de Natal', personaIds: ['bia', 'teo', 'caio'] }) // the faces of who did it
    expect(brief?.yesterday[0]?.request?.parts.map(part => part.toLowerCase())).toEqual(['texto', 'arte', 'posts'])
  } finally {
    h.teamworkEnabled = false
  }
})

it('the cards absorb ONLY a line that is typed as a state: a question, an error or any other speech of a part always stays (§0.6, D-079)', async () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  try {
    script(h, ['Texto da campanha pronto.', 'Arte da campanha pronta.', 'Posts da campanha prontos.'])
    h.proposeGestorAssemble({ ...scope, gestorId: 'atlas', id: 'campanha', goal: GOAL })
    h.approveGestorPlan({ workspaceId: 'ws', planId: 'campanha' })
    await settle(h)
    const bia = h.orchestration.runtime('pp').repo.tickets.list().find(ticket => ticket.execution?.name === 'Bia')!
    const line = (id: string, body: string): void => {
      h.events.append({ id, workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'message', body, actorId: 'bia', subjectId: bia.id, occurredAt: '2026-11-04T12:00:00.000Z' })
    }
    // the persona's question lives in the same kind of line as "Pronto" — but it carries no stateLine
    line('q1', 'Qual a paleta da marca?')
    line('s1', 'Pronto: Texto da campanha de Natal')
    h.messageFlags.set('pp', 's1', { stateLine: { kind: 'part_done', ticketId: bia.id, groupId: 'campanha', text: 'status' } })
    line('r1', 'Texto da campanha pronto, com 3 versões.')
    h.messageFlags.set('pp', 'r1', { stateLine: { kind: 'part_done', ticketId: bia.id, groupId: 'campanha', text: 'result' } })
    line('l1', 'Pronto: tarefa avulsa')
    h.messageFlags.set('pp', 'l1', { stateLine: { kind: 'task_done', ticketId: 'avulsa', text: 'status' } }) // no groupId: not part of a request
    const shown = thread(h).map(row => row.id)
    expect(shown).toContain('q1') // the QUESTION stays
    expect(shown).not.toContain('s1') // a status line of a part of a request with its plan card is absorbed
    expect(shown).toContain('l1') // a lone Task has no card: its line stays
    // the persona's own result is absorbed only because the delivery card carries it
    expect(h.teamCards.absorbed('pp', 'r1')).toBe(h.teamCards.deliveryViewOf('pp', 'team-delivery:campanha') !== undefined)
    expect(thread(h).some(row => row.deliveryCard !== undefined)).toBe(true)
    expect(shown).not.toContain('r1')
  } finally {
    h.teamworkEnabled = false
  }
})

it('without Config.teamwork there are no cards and the status lines stay as they are', async () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = false
  h.proposeGestorAssemble({ ...scope, gestorId: 'atlas', id: 'campanha', goal: GOAL })
  h.approveGestorPlan({ workspaceId: 'ws', planId: 'campanha' })
  await settle(h)
  const lines = thread(h)
  expect(lines.some(row => row.teamPlan !== undefined || row.deliveryCard !== undefined)).toBe(false)
  expect(h.teamCards.planViewOf('pp', 'team-plan:campanha')).toBeUndefined()
})
