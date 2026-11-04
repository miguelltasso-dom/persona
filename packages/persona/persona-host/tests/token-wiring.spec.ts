/**
 * Contract tests for the token levers wired into the host (persona-spec/contracts/token-wiring.md, Tally).
 * One block per wiring (W4 first). The first-delivery path must not move.
 */
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const CLOCK = '2026-11-04T15:00:00.000Z'

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'atlas', name: 'Atlas', title: 'Coordenação',
    description: 'Coordena.', personality: 'Calmo.', instructions: 'Despache.',
    avatarKind: 'gallery', avatarRef: 'atlas', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana',
    systemRoles: ['coordination'],
  })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

function message(id: string, body: string): Parameters<PersonaHost['orchestration']['talkLayers']>[0] {
  return {
    id, streamId: 'channel:geral', workspaceId: 'ws', projectId: 'pp',
    seq: 1, type: 'message', body, actorId: 'ana', subjectId: 's',
    occurredAt: CLOCK, deleted: false,
  }
}

const NOTES = [
  'a vitrine é trocada às sextas com fotos novas e legenda curta de sempre para o Instagram da Padaria.',
  'a vitrine da sexta leva bolo de fubá, pão de queijo e a promoção do combo café e pão do mês corrente.',
  'vitrine de natal leva panetone e chocotone com preço da tabela do Cofre, sem desconto sem aprovação.',
  'a vitrine do dia dos namorados leva cupcakes de morango e brigadeiro de colher em embalagem kraft.',
  'a vitrine precisa de limpeza todo dia ao fechar; produto de vidro fica no armário do fundo da loja.',
  'vitrine refrigerada tem o termostato ajustado em 4 graus; anotar a temperatura na planilha do turno.',
  'a vitrine de domingo repete o cardápio de sábado sem os bolos, que só saem sob encomenda antecipada.',
  'a vitrine do café da manhã destaca pão na chapa, queijo minas e geleia caseira nas manhãs de semana.',
  'a vitrine de sábado inclui o pão de fermentação natural e a encomenda das 9h da Ana Souza em separado.',
]
const EVIDENCE = 'encomenda das 9h da Ana Souza'

it('W4: the recall that answers the question survives the budget (foldHostTalkUsed gets event.body)', () => {
  const h = host()
  seed(h)
  const speaker = h.product.getPersona('atlas')!
  const used = NOTES.map((body, index) => ({
    id: `note-${String(index).padStart(2, '0')}`, kind: 'memory', body, required: false, restricted: false,
  }))
  const asked = h.orchestration.talkLayers(message('e1', 'Como está a vitrine de sábado e a encomenda da Ana Souza?'), speaker, used)
  expect(asked.text).toContain(EVIDENCE)
  // The evidence row is LAST in id order: the old head clip (200 tokens) dropped it.
  const head = NOTES.join('\n').slice(0, 800)
  expect(head).not.toContain(EVIDENCE)
})

it('W4: the stable prefix does not move with the question, and the required vault stays in it', () => {
  const h = host()
  seed(h)
  const speaker = h.product.getPersona('atlas')!
  const used = [
    { id: 'rule-1', kind: 'constraint', body: 'Nunca inventar preço.', required: true, restricted: false },
    ...NOTES.map((body, index) => ({ id: `note-${String(index)}`, kind: 'memory', body, required: false, restricted: false })),
  ]
  const a = h.orchestration.talkLayers(message('e1', 'Como está a vitrine de sábado?'), speaker, used)
  const b = h.orchestration.talkLayers(message('e2', 'E o cardápio de domingo?'), speaker, used)
  expect(a.prefix).toBe(b.prefix)
  expect(a.prefix).toContain('Nunca inventar preço.')
  expect(a.text).not.toBe(b.text)
})

it('W4: restricted rows still never reach the prompt, whatever the question says', () => {
  const h = host()
  seed(h)
  const speaker = h.product.getPersona('atlas')!
  const used = [
    { id: 'secret', kind: 'memory', body: 'segredo da vitrine: senha do cofre 1234', required: false, restricted: true },
    ...NOTES.map((body, index) => ({ id: `note-${String(index)}`, kind: 'memory', body, required: false, restricted: false })),
  ]
  const layers = h.orchestration.talkLayers(message('e1', 'Qual o segredo da vitrine e a senha do cofre?'), speaker, used)
  expect(layers.text).not.toContain('senha do cofre 1234')
})

interface Delivery { readonly purpose: string; readonly sessionId: string }
interface Request { readonly purpose: string; readonly toolCount: number }

function seedTeam(h: PersonaHost): void {
  seed(h)
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'bento', name: 'Bento', title: 'Engenharia',
    description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
}

/** Fake runners that remember which purpose each delivery went to. */
function spyFactory(h: PersonaHost, failAnswerOnlyTalk = false): { deliveries: Delivery[]; requests: Request[] } {
  const deliveries: Delivery[] = []
  const requests: Request[] = []
  h.orchestration.runnerFactory = async (request) => {
    const purpose = request?.purpose ?? 'none'
    const toolCount = Object.keys(request?.tools ?? {}).length
    requests.push({ purpose, toolCount })
    if (failAnswerOnlyTalk && purpose === 'talk' && toolCount === 0) throw new Error('cheap runner unavailable')
    const { createFakeRunner } = await import('@deepseek-ai/dsh-persona-runners')
    const inner = createFakeRunner()
    return new Proxy(inner, {
      get(target, prop, receiver) {
        if (prop === 'deliver') {
          return async (sessionId: string, requestId: string, text: string, mode: 'queue' | 'steer' | 'inject') => {
            deliveries.push({ purpose, sessionId })
            return await target.deliver(sessionId, requestId, text, mode)
          }
        }
        return Reflect.get(target, prop, receiver) as unknown
      },
    })
  }
  return { deliveries, requests }
}

const WORK = { workspaceId: 'ws', projectId: 'pp', streamKind: 'channel' as const, ownerId: 'geral' }

it('W1: triage rides the cheap answer-only runner; the executor keeps the task runner', async () => {
  const h = host()
  seedTeam(h)
  const spy = spyFactory(h)
  h.postMessage({
    id: 'm-work', ...WORK, body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 't', occurredAt: CLOCK,
  })
  await h.orchestration.flush('pp')
  const triage = spy.deliveries.filter(row => row.sessionId === 'coordination')
  const worker = spy.deliveries.filter(row => row.sessionId.startsWith('worker-'))
  expect(triage.length).toBeGreaterThan(0)
  expect(triage.every(row => row.purpose === 'talk')).toBe(true)
  expect(worker.length).toBeGreaterThan(0)
  expect(worker.every(row => row.purpose === 'task')).toBe(true)
  expect(spy.requests.some(row => row.purpose === 'talk' && row.toolCount === 0)).toBe(true)
})

it('W1: when the cheap runner cannot resolve, triage falls back to the executor runner and the work still runs', async () => {
  const h = host()
  seedTeam(h)
  const spy = spyFactory(h, true)
  h.postMessage({
    id: 'm-fallback', ...WORK, body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 't', occurredAt: CLOCK,
  })
  await h.orchestration.flush('pp')
  const triage = spy.deliveries.filter(row => row.sessionId === 'coordination')
  expect(triage.length).toBeGreaterThan(0)
  expect(triage.every(row => row.purpose === 'task')).toBe(true)
  expect(spy.deliveries.some(row => row.sessionId.startsWith('worker-'))).toBe(true)
})
