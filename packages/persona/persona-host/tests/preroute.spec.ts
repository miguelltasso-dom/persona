import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite pedidos claros.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.product.updatePersona({
    ...h.product.getPersona('coord')!,
    systemRoles: ['coordination'],
  }, 'pp')
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

function post(h: PersonaHost, id: string, body: string, at: string): void {
  h.postMessage({
    id, ...scope, streamKind: 'channel', ownerId: 'geral',
    body, actorId: 'ana', subjectId: id, occurredAt: at,
  })
}

function channelBodies(h: PersonaHost): string[] {
  return h.listMessages({
    ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 50,
  }).events.map(row => row.body)
}

it('cortesia não abre Tarefa; pedido claro ainda abre', () => {
  const h = host()
  seed(h)
  post(h, 'm-ok', 'ok', '2026-11-03T15:00:00.000Z')
  expect(h.listTasks(scope)).toEqual([])
  expect(h.orchestration.runtime('pp').lastRoute?.rule).toBe('courtesy')
  post(h, 'm-work', 'preciso de um README no projeto', '2026-11-03T15:00:01.000Z')
  expect(h.listTasks(scope).length).toBe(1)
})

it('duplicado na janela não abre Tarefa', () => {
  const h = host()
  seed(h)
  post(h, 'm-1', 'Melhora a home?', '2026-11-03T15:00:00.000Z')
  expect(h.listTasks(scope)).toEqual([])
  post(h, 'm-2', 'Melhora a home?', '2026-11-03T15:01:00.000Z')
  expect(h.listTasks(scope)).toEqual([])
  expect(h.orchestration.runtime('pp').lastRoute?.rule).toBe('duplicate')
})

it('@menção não abre Tarefa (fala com a persona citada)', () => {
  const h = host()
  seed(h)
  post(h, 'm-at', '@Guia oi, tudo bem?', '2026-11-03T15:00:00.000Z')
  expect(h.orchestration.runtime('pp').lastRoute?.rule).toBe('mention')
  expect(h.listTasks(scope)).toEqual([])
})

it('/tarefa aceita sem passar pelo assessor', () => {
  const h = host()
  seed(h)
  post(h, 'm-cmd', '/tarefa Arrume o login', '2026-11-03T15:00:02.000Z')
  expect(h.orchestration.runtime('pp').lastRoute?.rule).toBe('command')
  expect(h.orchestration.runtime('pp').candidates).toEqual([])
  expect(h.listTasks(scope).some(task => task.title === 'Arrume o login')).toBe(true)
})

it('passa à colega vira Tarefa sem modelo', () => {
  const h = host()
  seed(h)
  post(h, 'm-h', 'Passa isso para a colega de escrita.', '2026-11-03T15:00:00.000Z')
  expect(h.orchestration.runtime('pp').lastRoute?.rule).toBe('handoff')
  expect(h.listTasks(scope).length).toBe(1)
})

it('janela de silêncio da Coordenação não abre Tarefa', () => {
  const h = host()
  seed(h)
  h.setAutonomy({
    ...scope, personaId: 'coord', mode: 'propose', proposalBudget: 3, tokenBudget: 50_000, executionBudget: 8,
    silenceStart: '00:00', silenceEnd: '23:59',
  })
  post(h, 'm-sil', 'preciso de um README no projeto', '2026-11-03T15:00:00.000Z')
  expect(h.listTasks(scope)).toEqual([])
  expect(h.orchestration.runtime('pp').lastRoute?.rule).toBe('silence')
})

it('orçamento esgotado da Coordenação silencia o pedido', () => {
  const h = host()
  seed(h)
  h.setAutonomy({
    ...scope, personaId: 'coord', mode: 'propose', proposalBudget: 3, tokenBudget: 0, executionBudget: 8,
    silenceStart: '', silenceEnd: '',
  })
  post(h, 'm-bud', 'preciso de um README no projeto', '2026-11-03T15:00:00.000Z')
  expect(h.listTasks(scope)).toEqual([])
  expect(h.orchestration.runtime('pp').lastRoute?.rule).toBe('silence')
})

it('janela persistida: runtime novo recarrega o window', () => {
  const h = host()
  seed(h)
  post(h, 'm-1', 'Implemente o botão de salvar', '2026-11-03T15:00:00.000Z')
  expect(h.orchestration.runtime('pp').routeLog.window.length).toBe(1)
  h.orchestration.runtimes.clear()
  const restored = h.orchestration.runtime('pp')
  expect(restored.routeLog.window[0]?.text).toBe('Implemente o botão de salvar')
  const hit = restored.route({
    id: 'm-2',
    source: 'channel',
    threads: [{ source: 'channel', id: 'geral' }],
    actor: { source: 'channel', id: 'ana' },
    human: true,
    at: '2026-11-03T15:01:00.000Z',
    text: 'implemente o botao de salvar!!!',
    meta: {},
  }, {
    personas: () => [{ id: 'coord', name: 'Guia' }],
    budgetLeft: () => true,
    silenceUntil: () => 0,
    canCommand: () => true,
  })
  expect(hit.rule).toBe('duplicate')
})

it('convidado não dispara /tarefa; membro não pausa', () => {
  const h = host()
  seed(h)
  h.createMember({
    id: 'gia', workspaceId: 'ws', projectId: 'pp', displayName: 'Gia', handle: 'gia', role: 'guest',
  })
  h.createMember({
    id: 'bob', workspaceId: 'ws', projectId: 'pp', displayName: 'Bob', handle: 'bob', role: 'member',
  })
  h.postMessage({
    id: 'm-g', ...scope, streamKind: 'channel', ownerId: 'geral',
    body: '/tarefa Arrume o login', actorId: 'gia', subjectId: 'm-g',
    occurredAt: '2026-11-03T15:00:00.000Z',
  })
  expect(h.listTasks(scope)).toEqual([])
  expect(h.orchestration.runtime('pp').lastRoute?.action).toBe('ignore')
  h.postMessage({
    id: 'm-p', ...scope, streamKind: 'channel', ownerId: 'geral',
    body: '/pausar', actorId: 'bob', subjectId: 'm-p',
    occurredAt: '2026-11-03T15:00:02.000Z',
  })
  expect(h.orchestration.runtime('pp').lastRoute?.action).toBe('ignore')
  expect(h.orchestration.runtime('pp').lastRoute?.command).toBe('pausar')
  expect(h.orchestration.isPersonaPaused('pp', 'coord')).toBe(false)
})

it('dono /pausar pausa a Coordenação e /retomar devolve o trabalho', () => {
  const h = host()
  seed(h)
  post(h, 'm-pause', '/pausar', '2026-11-03T15:00:00.000Z')
  expect(h.orchestration.runtime('pp').lastRoute?.command).toBe('pausar')
  expect(h.orchestration.isPersonaPaused('pp', 'coord')).toBe(true)
  expect(h.getPersonaCard({ ...scope, personaId: 'coord' }).nowKind).toBe('offline')
  expect(channelBodies(h).some(body => body.includes('Guia pausada'))).toBe(true)
  post(h, 'm-work', 'preciso de um README no projeto', '2026-11-03T15:00:01.000Z')
  expect(h.listTasks(scope)).toEqual([])
  expect(channelBodies(h).some(body => body.includes('está pausada'))).toBe(true)
  post(h, 'm-resume', '/retomar', '2026-11-03T15:00:02.000Z')
  expect(h.orchestration.isPersonaPaused('pp', 'coord')).toBe(false)
  expect(h.getPersonaCard({ ...scope, personaId: 'coord' }).nowKind).not.toBe('offline')
  post(h, 'm-after', 'preciso de um README no projeto', '2026-11-03T15:00:03.000Z')
  expect(h.listTasks(scope).length).toBe(1)
})
