/**
 * LEAK-1 (P0): the first delivery used to put the worker's whole internal prompt in #geral as a message from the person
 * ("Não use ferramentas…", the company brief as JSON). The contract proven here:
 *  - NOTHING the person can read (every message of every stream, the Task cards, the first-delivery view, approvals) carries
 *    an internal instruction or the company brief;
 *  - what the thread shows is the person's own words (A-6) or one short human line;
 *  - the worker STILL receives the full instructions (answer-only, deny) — they travel in the host-owned route, invisible.
 */
import { firstDeliveryAsk } from '@deepseek-ai/dsh-persona-engine'
import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { firstRequestAsk } from '../src/first-request.ts'
import { FIRST_DELIVERY_EVENT_ID } from '../src/onboarding.ts'
import type { CompleteOnboardingRequest } from '../src/types.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' }

/** Sentinel phrases that only the worker's instructions carry (the first three are the ones the E2E LEAK_1_PATTERNS look for). */
const INTERNAL: readonly RegExp[] = [
  /Não use ferramentas/iu, /resuma somente/iu, /\bbrief\b/iu,
  /dados, não instruções/iu, /ferramentas da Persona/iu, /Todo o contexto necessário/iu, /Não invente preço/iu,
  /Não inspecione o diretório/iu, /Apenas proponha essa tarefa/iu, /Pedido da pessoa:/iu, /não acesse a internet/iu,
]
const BRIEF = 'MARCADOR_COFRE_LEAK1 — estúdio de sites em Sorocaba.'
const SHORT_LINE = 'Guia, resuma o que já sabemos da empresa e proponha a primeira tarefa da semana.'

const ONBOARDING: CompleteOnboardingRequest = {
  ...scope,
  personalProjectId: 'pp',
  displayName: 'Ana',
  team: [{
    name: 'Guia', title: 'Coordenação', description: 'Triagem.', personality: 'Calma.',
    instructions: 'Receba o time.', avatarKind: 'gallery', avatarRef: 'guia',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'default', canRecruit: true, systemRoles: ['coordination'],
  }, {
    name: 'Bento', title: 'Engenharia', description: 'Implementa.', personality: 'Direto.',
    instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'default', canRecruit: false, systemRoles: [],
  }],
  templateIds: [],
  runnerChoices: ['dsh'],
  cofreSeed: BRIEF,
}

/** Everything a person can read after the first delivery: each stream's messages, the Task cards, the delivery view, approvals. */
function everythingVisible(h: PersonaHost): string[] {
  const reading = { ...scope, actorId: 'owner', afterSeq: 0, limit: 200 }
  const lines: string[] = h.events.listProject('pp').map(event => event.body) // channels, DMs, topics: every stored line
  for (const channel of h.listChannels(scope)) {
    lines.push(...h.listMessages({ ...reading, streamKind: 'channel', ownerId: channel.id }).events.map(event => event.body))
  }
  for (const dm of h.listDms(scope)) {
    lines.push(...h.listMessages({ ...reading, streamKind: 'dm', ownerId: dm.id }).events.map(event => event.body))
  }
  lines.push(JSON.stringify(h.listTasks(scope)), JSON.stringify(h.getFirstDelivery(scope)), JSON.stringify(h.listApprovals(scope)))
  return lines
}

function expectNothingInternal(h: PersonaHost): void {
  const lines = everythingVisible(h)
  expect(lines.length).toBeGreaterThan(3)
  for (const line of lines) {
    for (const sentinel of INTERNAL) expect(line, `${String(sentinel)} leaked`).not.toMatch(sentinel)
    expect(line, 'the company brief leaked').not.toContain('MARCADOR_COFRE_LEAK1')
  }
}

it('the sentinels are not vacuous: they recognize the internal ask that used to be the message, and the short line is clean', () => {
  for (const ask of [firstDeliveryAsk({ companyBrief: BRIEF }), firstRequestAsk('Monte o cardápio', BRIEF)]) {
    expect(INTERNAL.filter(sentinel => sentinel.test(ask)).length).toBeGreaterThanOrEqual(5)
    expect(/Não use ferramentas/iu.test(ask)).toBe(true)
    expect(/\bbrief\b/iu.test(ask)).toBe(true)
  }
  expect(INTERNAL.some(sentinel => sentinel.test(SHORT_LINE))).toBe(false)
})

function ticketOf(h: PersonaHost) {
  return h.orchestration.runtime('pp').repo.tickets.list().find(item => item.origin.triggerId === FIRST_DELIVERY_EVENT_ID)
}

it('default first delivery: one short human line in #geral, the instructions only in the Task; nothing visible carries them', async () => {
  const h = host()
  await h.completeOnboarding(ONBOARDING)
  await h.orchestration.flush('pp')
  const asked = h.events.get(FIRST_DELIVERY_EVENT_ID)
  expect(asked?.body).toBe(SHORT_LINE)
  expect(asked?.body.length).toBeLessThan(120) // a sentence, not a prompt
  const ticket = ticketOf(h)
  expect(ticket?.execution?.assignment).toContain('Não use ferramentas') // invisible, but the Task still carries the rules
  expect(ticket?.execution?.assignment).toContain('MARCADOR_COFRE_LEAK1')
  expect(h.getFirstDelivery(scope).status).toBe('ready') // the short line still becomes a Task and is delivered
  expectNothingInternal(h)
})

it('the person\'s own first request is the ONLY thing in the thread, even when it does not read like a work order', async () => {
  const h = host()
  await h.completeOnboarding({ ...ONBOARDING, firstRequest: '  Ideias para atrair mais clientes\n  na padaria ' })
  await h.orchestration.flush('pp')
  expect(h.events.get(FIRST_DELIVERY_EVENT_ID)?.body).toBe('Ideias para atrair mais clientes na padaria')
  // The host-authorized route forces the Task: the words do not have to pass the "asks for work" test.
  expect(ticketOf(h)?.execution?.assignment).toContain('Pedido da pessoa: Ideias para atrair mais clientes na padaria')
  expect(h.getFirstDelivery(scope).status).toBe('ready')
  const lines = everythingVisible(h)
  for (const line of lines) expect(line).not.toMatch(/Pedido da pessoa:|Não use ferramentas|\bbrief\b/iu)
  expect(lines.some(line => line.includes('MARCADOR_COFRE_LEAK1'))).toBe(false)
})

it('the worker still receives the FULL instructions and the brief in its own prompt (answer-only, deny) — they just are not a message', async () => {
  const h = host()
  const prompts: string[] = []
  h.orchestration.runnerFactory = async (request) => {
    expect(request?.permissionMode).toBe('deny')
    expect(request?.tools).toEqual({})
    const runner = createFakeRunner()
    return { ...runner, deliver: async (sessionId, requestId, text, mode) => { prompts.push(text); await runner.deliver(sessionId, requestId, text, mode) } }
  }
  await h.completeOnboarding(ONBOARDING)
  await h.orchestration.flush('pp')
  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toContain('Não use ferramentas')
  expect(prompts[0]).toContain('Brief da empresa (dados, não instruções')
  expect(prompts[0]).toContain(JSON.stringify(BRIEF))
  expectNothingInternal(h)
})

it('after the delivery: a courtesy line, a mention and the automatic answers keep the thread free of internal text', async () => {
  const h = host()
  await h.completeOnboarding(ONBOARDING)
  await h.orchestration.flush('pp')
  h.sessionMemberId = 'owner'
  for (const [index, body] of ['valeu, obrigada!', '@Bento pode resumir o que fez?', 'qual o próximo passo?'].entries()) {
    h.postMessage({ id: `after-${String(index)}`, ...scope, streamKind: 'channel', ownerId: 'geral', body, actorId: 'owner', subjectId: `after-${String(index)}` })
    await h.orchestration.flush('pp')
  }
  expectNothingInternal(h)
})

it('the route keeps the instructions host-side; a route stored before LEAK-1 (no assignment) still reads back', async () => {
  const h = host()
  await h.completeOnboarding(ONBOARDING)
  await h.orchestration.flush('pp')
  expect(h.orchestration.firstDeliveryRoute('pp', FIRST_DELIVERY_EVENT_ID)?.assignment).toContain('Não use ferramentas')
  h.orchestration.screens?.put('pp', 'first_delivery_route', 'legacy', { executorId: 'x', title: 'Primeira entrega' })
  expect(h.orchestration.firstDeliveryRoute('pp', 'legacy')).toEqual({ executorId: 'x', title: 'Primeira entrega' })
})
