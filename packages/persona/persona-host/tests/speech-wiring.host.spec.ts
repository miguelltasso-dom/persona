/**
 * Item 4 wired into the host: what a persona writes reaches the thread as simple speech (technical detail folded, "você" for the owner),
 * the pass token never shows, a person's message is never left without a line (D-079), and the prompt prefix carries the speech layer
 * as one constant paragraph (cache-stable).
 */
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { PASSED_LINE, PASS_TOKEN, QUIET_TASK_LINE, speechRules } from '../src/speech.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const CLOCK = '2026-11-04T15:00:00.000Z'
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    ...SCOPE, id: 'atlas', name: 'Atlas', title: 'Coordenação',
    description: 'Coordena.', personality: 'Calmo.', instructions: 'Despache.',
    avatarKind: 'gallery', avatarRef: 'atlas', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana', systemRoles: ['coordination'],
  })
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
}

function say(h: PersonaHost, id: string, body: string): void {
  h.postMessage({ id, ...SCOPE, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: `s-${id}`, occurredAt: CLOCK })
}

async function settle(h: PersonaHost): Promise<void> {
  await h.orchestration.flush('pp')
  await new Promise<void>((resolve) => { setTimeout(resolve, 20) })
  await h.orchestration.flush('pp')
}

function replyTo(h: PersonaHost, id: string): string | undefined {
  const events = h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
  return events.find(item => item.id === `coord-${id}-reply`)?.body
}

function eventOf(id: string, actorId: string): Parameters<PersonaHost['orchestration']['talkLayers']>[0] {
  return { id, streamId: 'channel:geral', workspaceId: 'ws', projectId: 'pp', seq: 1, type: 'message', body: 'Qual o horário?', actorId, subjectId: 's', occurredAt: CLOCK, deleted: false }
}

it('a reply with a path and an error code reaches the thread folded: the plain sentence first, the technical one in ONE fold', async () => {
  const h = host()
  seed(h)
  h.orchestration.liveText = 'Abrimos às 7h todos os dias. O horário está em C:\\Users\\ana\\padaria\\horario.json e falhou com ENOENT antes.'
  say(h, 'q1', 'Qual o horário de abertura?')
  await settle(h)
  const body = replyTo(h, 'q1') ?? ''
  expect(body.startsWith('Abrimos às 7h todos os dias.')).toBe(true)
  const visible = body.slice(0, body.indexOf('<details'))
  expect(visible).not.toMatch(/C:\\|ENOENT|horario\.json/u)
  expect(body).toContain('<details><summary>Detalhes</summary>')
  expect(body).toContain('C:\\Users\\ana\\padaria\\horario.json')
  expect(body.split('<details').length).toBe(2)
})

it('the owner is addressed as você, never "a pessoa"', async () => {
  const h = host()
  seed(h)
  h.orchestration.liveText = 'Anotei o que a pessoa pediu e já aviso a pessoa quando ficar pronto.'
  say(h, 'q2', 'Anota o pedido?')
  await settle(h)
  const body = replyTo(h, 'q2') ?? ''
  expect(body).not.toMatch(/a pessoa/iu)
  expect(body).toMatch(/você/u)
})

it('a plain reply is exactly what it was before (no fold, no change)', async () => {
  const h = host()
  seed(h)
  h.orchestration.liveText = 'Tudo bem por aqui. Em que posso ajudar?'
  say(h, 'q3', 'Oi, tudo bem por aí hoje?')
  await settle(h)
  expect(replyTo(h, 'q3')).toBe('Tudo bem por aqui. Em que posso ajudar?')
})

it('a person\'s message that gets the pass token anyway is answered with one plain line, and the token never shows', async () => {
  const h = host()
  seed(h)
  h.orchestration.liveText = PASS_TOKEN
  say(h, 'q4', 'Qual o horário de abertura?')
  await settle(h)
  const body = replyTo(h, 'q4')
  expect(body).toBe(PASSED_LINE)
  expect(body).not.toMatch(/\[\[|passar-a-vez/u)
})

it('every spelling of the token is swallowed on the way to the thread', async () => {
  const h = host()
  seed(h)
  const spellings = ['[[NO_REPLY]]', 'NO_REPLY', '[[passar a vez]]', '`[[passar-a-vez]]`']
  for (const [index, text] of spellings.entries()) {
    h.orchestration.liveText = text
    say(h, `t${String(index)}`, `Pergunta número ${String(index)}, pode responder?`)
    await settle(h)
    const events = h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
    for (const item of events) expect(item.body, item.id).not.toMatch(/NO_REPLY|passar[- ]a[- ]vez/iu)
  }
})

it('the speech layer is in the stable prefix: constant for a person\'s message, and the right to stay silent is offered only when no person waits', () => {
  const h = host()
  seed(h)
  const speaker = h.product.getPersona('atlas')!
  const first = h.orchestration.talkLayers(eventOf('e1', 'ana'), speaker, [])
  const second = h.orchestration.talkLayers({ ...eventOf('e2', 'ana'), body: 'Outra pergunta' }, speaker, [])
  expect(first.prefix).toBe(second.prefix)
  expect(first.prefix).toContain(speechRules('simple'))
  expect(first.prefix).not.toContain(PASS_TOKEN)
  const team = h.orchestration.talkLayers(eventOf('e3', 'team:note'), speaker, [])
  expect(team.prefix).toContain(PASS_TOKEN)
})

function threadBodies(h: PersonaHost): string[] {
  return h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events.map(item => item.body)
}

it('a Task that ends with the pass token closes with ONE short line and the token is nowhere (line, report, review)', async () => {
  const h = host()
  seed(h)
  h.orchestration.liveText = '[[passar-a-vez]]'
  say(h, 'w1', 'Monte o cardápio da semana com preços')
  await settle(h)
  const bodies = threadBodies(h)
  for (const body of bodies) expect(body).not.toMatch(/\[\[|passar-a-vez/u)
  expect(bodies).toContain(QUIET_TASK_LINE)
})

it('a Task delivery line is simple speech too: the plain sentence first, the path folded, "você" for the owner', async () => {
  const h = host()
  seed(h)
  h.orchestration.liveText = 'Montei o cardápio e a pessoa já pode revisar. O arquivo está em C:\\Users\\ana\\cardapio\\semana.json.'
  say(h, 'w2', 'Monte o cardápio da semana com preços')
  await settle(h)
  const line = threadBodies(h).find(body => body.startsWith('Montei o cardápio')) ?? ''
  expect(line).toMatch(/^Montei o cardápio e você já pode revisar\.\n\n<details><summary>Detalhes<\/summary>/u)
  expect(line.slice(0, line.indexOf('<details'))).not.toMatch(/C:\\/u)
  expect(line).toContain('C:\\Users\\ana\\cardapio\\semana.json')
})

it('a line posted by ANY path never carries the token (postAs is the last door)', () => {
  const h = host()
  seed(h)
  const post = (h.orchestration as unknown as { postAs: (event: unknown, speaker: unknown, id: string, body: string) => void }).postAs.bind(h.orchestration)
  const origin = { id: 'o1', streamId: 'channel:geral', workspaceId: 'ws', projectId: 'pp', seq: 1, type: 'message', body: 'oi', actorId: 'ana', subjectId: 's', occurredAt: CLOCK, deleted: false }
  post(origin, undefined, 'only-token', '[[passar-a-vez]]')
  post(origin, undefined, 'mixed', 'Feito. [[NO_REPLY]]')
  const bodies = threadBodies(h)
  expect(bodies).not.toContain('[[passar-a-vez]]')
  expect(bodies).toContain('Feito.')
  expect(h.events.has('only-token')).toBe(false)
})

it('the technical register keeps paths in the text', async () => {
  const h = host()
  seed(h)
  h.orchestration.speechStyleOf = () => 'technical'
  h.orchestration.liveText = 'O horário está em C:\\Users\\ana\\padaria\\horario.json.'
  say(h, 'q5', 'Onde fica o horário?')
  await settle(h)
  expect(replyTo(h, 'q5')).toBe('O horário está em C:\\Users\\ana\\padaria\\horario.json.')
})
