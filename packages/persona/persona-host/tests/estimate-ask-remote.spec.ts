/**
 * The Remote `estimateAsk` (D-076): the composer and step 5 ask the host before sending. It resolves the persona (the DM's
 * persona, or the coordination), the engine she runs on and the host switches, calls no model, and gives the same lane and
 * the same number of calls the host then takes (`estimate-ask-host.spec.ts` checks the second half).
 */
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const CLOCK = '2026-11-04T15:00:00.000Z'
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost, cli: 'claude' | 'dsh' = 'claude'): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    ...SCOPE, id: 'atlas', name: 'Atlas', title: 'Coordenação',
    description: 'Coordena.', personality: 'Calmo.', instructions: 'Despache.',
    avatarKind: 'gallery', avatarRef: 'atlas', runnerKind: cli === 'dsh' ? 'dsh' : 'cli', runnerCli: cli === 'dsh' ? '' : cli,
    runnerModel: 'haiku', canRecruit: false, createdBy: 'ana', systemRoles: ['coordination'],
  })
  h.createPersona({
    ...SCOPE, id: 'bento', name: 'Bento', title: 'Engenharia',
    description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: cli === 'dsh' ? 'dsh' : 'cli', runnerCli: cli === 'dsh' ? '' : cli,
    runnerModel: 'haiku', canRecruit: true, createdBy: 'ana',
  })
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
  h.createDm({ id: 'dm-bento', ...SCOPE, participantA: 'ana', participantB: 'bento' })
}

const CHANNEL = { ...SCOPE, streamKind: 'channel' as const, ownerId: 'geral' }

it('the Remote answers locally, with the engine of the persona and the lanes of the host', () => {
  const h = host()
  seed(h)
  let runnersResolved = 0
  h.orchestration.runnerFactory = async () => {
    runnersResolved += 1
    const { createFakeRunner } = await import('@deepseek-ai/dsh-persona-runners')
    return createFakeRunner()
  }
  const question = h.estimateAsk({ ...CHANNEL, texto: 'Qual o horário do standup?' })
  expect(question).toMatchObject({ tipo: 'conversa', chamadas: { min: 1, max: 1 }, rotulo: '1 chamada da sua IA', origin: 'estimate', tempo: null })
  const work = h.estimateAsk({ ...CHANNEL, texto: 'Pesquise 3 concorrentes e compare preços.' })
  expect(work).toMatchObject({ tipo: 'trabalho', chamadas: { min: 1, max: 1 }, baseDoVendorIncluida: false })
  expect(work.detalhe).toEqual([{ papel: 'execucao', nivel: 'seu-modelo' }])
  expect(h.estimateAsk({ ...CHANNEL, texto: 'valeu!' })).toMatchObject({ tipo: 'sem-chamada', rotulo: 'Sem chamada da sua IA' })
  expect(runnersResolved).toBe(0)
})

it('the first delivery of step 5 never counts a triage call, even with the triage switched back on', () => {
  const h = host()
  seed(h)
  h.orchestration.skipTriage = false
  try {
    const first = h.estimateAsk({ ...CHANNEL, texto: 'Resuma o Cofre em 5 pontos e proponha a primeira tarefa.', primeiraEntrega: true })
    expect(first.detalhe.map(call => call.papel)).toEqual(['execucao'])
    const normal = h.estimateAsk({ ...CHANNEL, texto: 'Monte o cardápio da semana com preços' })
    expect(normal.detalhe.map(call => call.papel)).toEqual(['triagem', 'execucao'])
    expect(normal.rotulo).toBe('2 chamadas da sua IA')
  } finally {
    h.orchestration.skipTriage = true
  }
})

it('an "ok" is a reaction when nothing is pending and a conversation when the persona asked something', () => {
  const h = host()
  seed(h)
  expect(h.estimateAsk({ ...CHANNEL, texto: 'ok' }).tipo).toBe('sem-chamada')
  h.events.append({
    id: 'asks', ...SCOPE, streamKind: 'channel', ownerId: 'geral', type: 'message',
    body: 'Posso começar o cardápio de sábado?', actorId: 'atlas', subjectId: 's', occurredAt: CLOCK,
  })
  expect(h.estimateAsk({ ...CHANNEL, texto: 'ok' })).toMatchObject({ tipo: 'conversa', chamadas: { min: 1, max: 1 } })
  // another stream is not affected by that question
  expect(h.estimateAsk({ ...SCOPE, streamKind: 'dm', ownerId: 'dm-bento', texto: 'ok' }).tipo).toBe('sem-chamada')
})

it('says "não sei" with no engine connected or an empty field, and never invents a number', () => {
  const h = host()
  seed(h, 'dsh')
  const none = h.estimateAsk({ ...CHANNEL, texto: 'Monte o cardápio' })
  expect(none).toMatchObject({ tipo: 'nao-sei', chamadas: null, tokens: null, custo: null, tempo: null, origin: 'unknown', rotulo: 'Conecte uma IA para estimar' })
  h.orchestration.loggedCliOf = () => 'claude'
  expect(h.estimateAsk({ ...CHANNEL, texto: 'Monte o cardápio' }).tipo).toBe('trabalho')
  expect(h.estimateAsk({ ...CHANNEL, texto: '   ' }).tipo).toBe('nao-sei')
})

it('a DM is answered by the persona of the DM: her prompt sizes the tokens', () => {
  const h = host()
  seed(h)
  const small = h.estimateAsk({ ...SCOPE, streamKind: 'dm', ownerId: 'dm-bento', texto: 'Monte o cardápio' })
  h.product.updatePersona({ ...h.product.getPersona('bento')!, instructions: 'Regra importante. '.repeat(200) }, 'pp')
  const heavy = h.estimateAsk({ ...SCOPE, streamKind: 'dm', ownerId: 'dm-bento', texto: 'Monte o cardápio' })
  expect(heavy.tokens!.min).toBeGreaterThan(small.tokens!.min)
})
