import { latestAssignment, type Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, geralChannelId, it, openJourney, say, sayOn, seedJourney, seedProject } from './journeys/journey-host.ts'

/**
 * Item 18 (Forge, pré-aceite 01:25): ataques à conversa da tarefa. Os que envolvem DUAS pessoas rodam num projeto COMPARTILHADO ('sp'): no host um membro só acessa projetos `kind === 'shared'`
 * (o 'pp' do seedJourney é o pessoal do dono, e o Bob é, corretamente, barrado dele). Fio longo e cursor no futuro: o Forge consertou (paginar até o fim; clampar o cursor).
 */
const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
  { id: 'teo', name: 'Teo', title: 'Arte' },
]
const SP = { workspaceId: 'ws', projectId: 'sp' } as const
const PAUSA = 'Teo está pausada. Use /retomar para voltar.'

function rigPersonal(): PersonaHost {
  const h = openJourney('2026-11-12T12:00:00.000Z')
  seedJourney(h, TEAM)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}
function rigShared(): PersonaHost {
  const h = openJourney('2026-11-12T12:00:00.000Z')
  seedJourney(h, [])
  seedProject(h, { id: 'sp', name: 'Equipe', team: TEAM })
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('sp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}
function script(h: PersonaHost, steps: ReadonlyArray<string | (() => string)>): void {
  const queue = [...steps]
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => { const next = queue.shift(); return typeof next === 'function' ? next() : next }, set: () => undefined })
}
async function settle(h: PersonaHost, project: 'pp' | 'sp'): Promise<void> { for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush(project) }
const taskOfBia = async (h: PersonaHost, project: 'pp' | 'sp'): Promise<Ticket> => {
  script(h, ['Os 3 posts estão prontos.'])
  if (project === 'pp') say(h, 'u1', '@Bia escreva os 3 posts da campanha'); else sayOn(h, 'sp', 'u1', '@Bia escreva os 3 posts da campanha')
  await settle(h, project)
  const ticket = h.orchestration.runtime(project).repo.tickets.list().find(row => row.execution?.name === 'Bia')
  if (ticket === undefined) throw new Error('no Task')
  return ticket
}
const addBob = (h: PersonaHost): void => { h.createMember({ id: 'bob', ...SP, displayName: 'Bob', handle: 'bob', role: 'member' }) }
const as = (h: PersonaHost, member: string): void => { h.sessionMemberId = member }
const channelOf = (h: PersonaHost, project: 'pp' | 'sp'): string => (project === 'pp' ? 'geral' : geralChannelId(h, 'sp'))
const scopeOf = (project: 'pp' | 'sp') => (project === 'pp' ? SCOPE : SP)
const read = (h: PersonaHost, project: 'pp' | 'sp', topicId?: string, actorId = 'ana') => h.listMessages({ ...scopeOf(project), streamKind: 'channel', ownerId: channelOf(h, project), actorId, afterSeq: 0, limit: 200, ...(topicId === undefined ? {} : { topicId }) }).events
const card = (h: PersonaHost, project: 'pp' | 'sp', ticketId: string) => h.getProjectBoard(scopeOf(project)).cards.find(row => row.ticketId === ticketId)
const write = (h: PersonaHost, project: 'pp' | 'sp', id: string, body: string, topicId: string, actorId = 'ana') => h.postMessage({ id, ...scopeOf(project), streamKind: 'channel', ownerId: channelOf(h, project), body, actorId, subjectId: id, topicId })
const errorLines = (lines: readonly { body: string }[]) => lines.filter(row => /run-error|engine_unavailable|Não consegui responder/u.test(row.body))

it('(1) fio LONGO (205 mensagens) com DUAS pessoas: quem leu até o que o cartão mostra volta a ter "não lida" com a mensagem seguinte', async () => {
  const h = rigShared()
  const bia = await taskOfBia(h, 'sp')
  addBob(h)
  h.orchestration.setPersonaPaused('sp', 'bia', true) // sem turno: só as mensagens (e o aviso de pausa) contam
  const { topicId } = h.openTaskConversation({ ...SP, ticketId: bia.id })
  for (let i = 0; i < 205; i += 1) write(h, 'sp', `m${String(i)}`, `mensagem ${String(i)}`, topicId)
  await settle(h, 'sp')
  as(h, 'bob')
  const before = card(h, 'sp', bia.id)
  expect(before?.threadUnread).toBeGreaterThanOrEqual(99) // o cartão mostra "99+" muito antes
  h.markTaskThreadRead({ ...SP, ticketId: bia.id, seq: before?.threadLastSeq ?? 0 })
  expect(card(h, 'sp', bia.id)?.threadUnread).toBe(0)
  as(h, 'ana')
  write(h, 'sp', 'depois', 'mais uma, depois de o Bob ler tudo', topicId)
  await settle(h, 'sp')
  as(h, 'bob')
  expect(card(h, 'sp', bia.id)?.threadUnread).toBeGreaterThanOrEqual(1) // com o contador preso nos 200 primeiros ficaria 0 para sempre
})

it('(2) cursor do FUTURO: markTaskThreadRead com seq enorme não cala o fio — a próxima resposta continua "não lida"', async () => {
  const h = rigPersonal()
  const bia = await taskOfBia(h, 'pp')
  const { topicId } = h.openTaskConversation({ ...SCOPE, ticketId: bia.id })
  h.markTaskThreadRead({ ...SCOPE, ticketId: bia.id, seq: 1_000_000 })
  script(h, ['Falta só rever o terceiro post.'])
  write(h, 'pp', 'q1', 'como está ficando?', topicId)
  await settle(h, 'pp')
  expect(read(h, 'pp', topicId).map(row => row.actorId)).toEqual(['ana', 'bia'])
  expect(card(h, 'pp', bia.id)?.threadUnread).toBe(1)
})

it('(3) tarefa PARADA: o fio abre, a persona responde dizendo a situação, a Tarefa continua parada (não reabre) e não aparece cartão de erro', async () => {
  const h = rigPersonal()
  const bia = await taskOfBia(h, 'pp')
  h.runTicketCommand({ ...SCOPE, ticketId: bia.id, command: 'stop', reason: '' } as never)
  const { topicId } = h.openTaskConversation({ ...SCOPE, ticketId: bia.id })
  expect(h.orchestration.threadContextOf?.({ projectId: 'pp', topicId } as never)[0]?.body).toMatch(/parada pela pessoa|concluída|encerrada/u)
  script(h, ['A tarefa está parada, mas posso explicar o que já entreguei.'])
  write(h, 'pp', 'q1', 'o que você já entregou?', topicId)
  await settle(h, 'pp')
  const thread = read(h, 'pp', topicId)
  expect(thread.map(row => row.actorId)).toEqual(['ana', 'bia'])
  expect(errorLines(thread)).toEqual([])
  expect(errorLines(read(h, 'pp'))).toEqual([])
  const after = h.orchestration.runtime('pp').repo.tickets.get(bia.id)
  expect(after?.ended).toMatchObject({ by: 'human', outcome: 'stopped' })
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(1)
  expect(latestAssignment(after!)?.report?.state).not.toBe('progress')
})

it('(4) "@Teo" no fio com o Teo PAUSADO: nenhum turno roda, o fio só ganha o aviso padrão de pausa (o mesmo do #geral), nada vaza para o #geral e não há cartão de erro', async () => {
  const h = rigPersonal()
  const bia = await taskOfBia(h, 'pp')
  const { topicId } = h.openTaskConversation({ ...SCOPE, ticketId: bia.id })
  h.orchestration.setPersonaPaused('pp', 'teo', true)
  script(h, ['Isto não deveria ser dito pelo Teo pausado.'])
  const turnsBefore = h.orchestration.turnInputs.length
  write(h, 'pp', 'q1', '@Teo você viu o texto dos posts?', topicId)
  await settle(h, 'pp')
  expect(h.orchestration.turnInputs.slice(turnsBefore).some(row => row.personaId === 'teo')).toBe(false)
  const fromTeo = read(h, 'pp', topicId).filter(row => row.actorId === 'teo')
  expect(fromTeo.map(row => row.body)).toEqual([PAUSA]) // só o aviso de pausa, não uma resposta de verdade
  expect(errorLines(read(h, 'pp', topicId))).toEqual([])
  expect(read(h, 'pp').some(row => row.id === 'q1' || row.body === PAUSA)).toBe(false) // nem a pergunta nem o aviso foram para o #geral
})

it('(5) DUAS pessoas: cada uma tem o seu cursor; a mensagem de uma conta como "não lida" para a outra e nunca para ela mesma', async () => {
  const h = rigShared()
  const bia = await taskOfBia(h, 'sp')
  addBob(h)
  const { topicId } = h.openTaskConversation({ ...SP, ticketId: bia.id })
  script(h, ['Falta só rever o terceiro post.'])
  write(h, 'sp', 'q1', 'como está ficando?', topicId) // da Ana; a Bia responde
  await settle(h, 'sp')
  as(h, 'bob')
  expect(card(h, 'sp', bia.id)).toMatchObject({ threadCount: 2, threadUnread: 2 }) // a pergunta da Ana e a resposta da Bia, as duas novas para o Bob
  h.markTaskThreadRead({ ...SP, ticketId: bia.id, seq: card(h, 'sp', bia.id)?.threadLastSeq ?? 0 })
  expect(card(h, 'sp', bia.id)?.threadUnread).toBe(0)
  as(h, 'ana')
  expect(card(h, 'sp', bia.id)?.threadUnread).toBe(1) // o cursor do Bob não mexeu no da Ana: a resposta da Bia ainda é nova para ela
  script(h, ['Ok, anotado.'])
  as(h, 'bob')
  write(h, 'sp', 'b1', 'também quero o post 3 mais curto', topicId, 'bob')
  await settle(h, 'sp')
  expect(card(h, 'sp', bia.id)?.threadUnread).toBe(1) // para o Bob só a resposta da Bia; a mensagem dele não conta
  as(h, 'ana')
  expect(card(h, 'sp', bia.id)?.threadUnread).toBe(3) // a resposta anterior + a mensagem do Bob + a resposta nova
})

it('(6) fio de tarefa de DM num projeto compartilhado: quem NÃO é do DM não abre a conversa, não lê e o cartão dele não mostra contagem', async () => {
  const h = rigShared()
  addBob(h)
  h.createDm({ id: 'dm-ab', ...SP, participantA: 'ana', participantB: 'bia' })
  script(h, ['Pronto, os 3 posts.'])
  h.postMessage({ id: 'd1', ...SP, streamKind: 'dm', ownerId: 'dm-ab', body: 'escreva os 3 posts da campanha', actorId: 'ana', subjectId: 'd1' })
  await settle(h, 'sp')
  const ticket = h.orchestration.runtime('sp').repo.tickets.list().find(row => row.execution?.name === 'Bia')
  expect(ticket, 'a DM não abriu Tarefa').toBeDefined()
  const view = h.openTaskConversation({ ...SP, ticketId: ticket!.id })
  expect(view).toMatchObject({ streamKind: 'dm', ownerId: 'dm-ab' })
  script(h, ['Está pronto, falta só revisar.'])
  h.postMessage({ id: 'd2', ...SP, streamKind: 'dm', ownerId: 'dm-ab', body: 'como está?', actorId: 'ana', subjectId: 'd2', topicId: view.topicId })
  await settle(h, 'sp')
  const dmThread = (actor: string) => h.listMessages({ ...SP, streamKind: 'dm', ownerId: 'dm-ab', actorId: actor, afterSeq: 0, limit: 200, topicId: view.topicId }).events
  expect(dmThread('ana').map(row => row.actorId)).toEqual(['ana', 'bia'])
  as(h, 'bob')
  expect(() => h.openTaskConversation({ ...SP, ticketId: ticket!.id })).toThrow(/não encontrada/u) // a guarda do Forge: nem o id da DM nem o título saem
  expect(dmThread('bob')).toEqual([]) // página vazia, nada vaza
  // (escrever na DM sem ser do DM e escrever em nome de outro NÃO são recusados hoje: RED em acceptance-dm-write-acl.red.ts)
  const bobCard = card(h, 'sp', ticket!.id)
  if (bobCard !== undefined) expect(bobCard).toMatchObject({ threadCount: 0, threadUnread: 0 })
})
