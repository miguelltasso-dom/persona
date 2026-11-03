import { expect, it } from 'vitest'
import {
  Engine,
  MemoryPreRouteLog,
  MemoryRepositories,
  measurePreRoute,
  preRoute,
  runCoordEval,
} from '../src/index.ts'
import type { Assessor, Candidate, EngineOptions, Executor, Policy, Trigger } from '../src/index.ts'

const base = {
  senderId: 'ana',
  threadKey: 'chat:geral',
  at: 10_000,
  personas: [{ id: 'luna', name: 'Luna' }],
  budgetLeft: true,
  silenceUntil: 0,
  canCommand: () => true,
  window: [] as { text: string; senderId: string; threadKey: string; at: number }[],
}

it('duplicado exato/quase exato na janela é ignorado e deixa trilha', () => {
  const log = new MemoryPreRouteLog()
  log.remember({ text: 'Implemente o botão de salvar', senderId: 'ana', threadKey: 'chat:geral', at: 1_000 })
  const hit = preRoute({ ...base, text: 'implemente o botao de salvar!!!', window: log.window })
  expect(hit.rule).toBe('duplicate')
  expect(hit.modelCalled).toBe(false)
  expect(hit.action).toBe('ignore')
  log.record({ at: base.at, action: hit.action, rule: 'duplicate', why: hit.why, modelCalled: false })
  expect(log.trail[0]?.why).toMatch(/duplicado/)
  const off = preRoute({ ...base, text: 'implemente o botao de salvar!!!', window: log.window, rules: { duplicate: false } })
  expect(off.modelCalled).toBe(true)
})

it('@menção explícita roteia direto sem modelo', () => {
  const hit = preRoute({ ...base, text: '@Luna olha o contraste do botão' })
  expect(hit.rule).toBe('mention')
  expect(hit.personaId).toBe('luna')
  expect(hit.action).toBe('assign')
  expect(hit.modelCalled).toBe(false)
})

it('cortesia/ack não abre Tarefa', () => {
  for (const text of ['ok', 'valeu', 'obrigado', '👍']) {
    const hit = preRoute({ ...base, text })
    expect(hit.rule, text).toBe('courtesy')
    expect(hit.action).toBe('react')
    expect(hit.modelCalled).toBe(false)
  }
})

it('janela de silêncio ou orçamento esgotado é silent', () => {
  expect(preRoute({ ...base, budgetLeft: false, text: 'Implemente um extra' }).action).toBe('silent')
  expect(preRoute({ ...base, silenceUntil: 20_000, text: 'Implemente um extra' }).action).toBe('silent')
})

it('comandos /pausar /retomar /tarefa checam ACL', () => {
  expect(preRoute({ ...base, text: '/pausar' }).command).toBe('pausar')
  expect(preRoute({ ...base, text: '/retomar' }).modelCalled).toBe(false)
  expect(preRoute({ ...base, text: '/tarefa Arrume o login' }).title).toBe('Arrume o login')
  const denied = preRoute({ ...base, text: '/pausar', canCommand: () => false })
  expect(denied.action).toBe('ignore')
  expect(denied.why).toMatch(/ACL/)
})

it('F3: pré-roteador reduz chamadas de modelo sem perder acerto', async () => {
  const report = await runCoordEval()
  const pre = report.preRoute ?? measurePreRoute()
  expect(pre.beforeCorrect).toBe(report.total)
  expect(pre.afterCorrect).toBe(report.total)
  expect(pre.afterModelCalls).toBeLessThan(pre.beforeModelCalls)
  expect((pre.skipped.courtesy ?? 0) + (pre.skipped.silence ?? 0) + (pre.skipped.duplicate ?? 0)).toBeGreaterThan(0)
})

it('Eval não chama o assessor quando o pré-roteador decide', () => {
  const repo = new MemoryRepositories()
  const requests: Candidate[] = []
  const assessor: Assessor = { request: (candidate) => { requests.push(candidate) }, release: () => {} }
  const policy: Policy = {
    version: 'v1', paused: false, evalTimeoutMs: 60_000,
    gate: t => t.human ? { admissible: true, strength: 'explicit', basis: { via: 'listed' } } : { admissible: false, reason: 'not human' },
    revalidate: () => true,
    admitsInferred: () => true,
  }
  const executor: Executor = { start: () => {}, deliver: () => {}, stop: () => {} }
  const outbox: EngineOptions['outbox'] = { send: () => {}, status: () => undefined, withdraw: () => {} }
  const engine = new Engine({
    repo, assessor, executor, outbox, policy: () => policy,
    scope: { scope: () => ({ listened: true, observed: false }) },
    now: () => '2026-09-23T00:00:00.000Z',
    preRoute: () => ({ action: 'ignore', rule: 'courtesy', why: 'cortesia', modelCalled: false }),
  })
  const trigger: Trigger = {
    id: '1', source: 'chat', threads: [{ source: 'chat', id: 't1' }],
    actor: { source: 'chat', id: 'alice' }, human: true,
    at: '2026-09-23T00:00:01Z', text: 'ok',
    channel: { source: 'chat', thread: 't1', address: { message: '1' } }, meta: {},
  }
  engine.receive(trigger)
  engine.evaluateDue()
  expect(requests).toEqual([])
  expect(repo.tickets.list()).toEqual([])
})
