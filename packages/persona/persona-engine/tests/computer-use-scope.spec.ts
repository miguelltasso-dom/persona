// M9 / Lumen P2 (TOCTOU) + Keel 15:33: o laço chama a matriz UMA vez por passo (antes do cartão) e IMEDIATAMENTE antes de CADA ação.
// A matriz é a do computer-scope.ts (única). VERMELHO primeiro: o stage do computer-use.ts ainda não tem `scope`.
import { describe, expect, it } from 'vitest'
import {
  createMemorySharedControl,
  fakeActPort,
  fakeObservePort,
  fakePermissionPort,
  runComputerUse,
  type ComputerUsePlan,
  type ComputerUseStep,
  type DesktopObservePort,
  type ScopePort,
  type ScreenObservation,
  type StepPermissionPort,
} from '../src/computer-use.ts'
import { createComputerScopeGuard, type ComputerDescriptor, type ComputerUsePersona } from '../src/computer-scope.ts'

const bia = 'bia'
const okScreen: ScreenObservation = {
  atMs: 0,
  captureRef: 'file://local/ok.png',
  tree: { id: 'root', role: 'window', name: 'Bloco de Notas', children: [{ id: 'ok', role: 'status', name: 'ok' }] },
}
const step = (id: string): ComputerUseStep => ({
  id,
  intent: `passo ${id}`,
  action: { kind: 'click', target: 'ok', x: 1, y: 1 },
  expectation: { after: 'aparece ok', nameIncludes: 'ok', role: 'status' },
})
const plan: ComputerUsePlan = { goal: 'três cliques', personaId: 'p2', steps: [step('s1'), step('s2'), step('s3')] }

function run(scope: ScopePort | undefined, permission: StepPermissionPort = fakePermissionPort('allow')) {
  let t = 0
  const act = fakeActPort()
  const report = runComputerUse({
    plan,
    observe: fakeObservePort([okScreen]),
    act,
    permission,
    control: createMemorySharedControl(),
    now: () => (t += 1),
    ...(scope === undefined ? {} : { scope }),
  })
  return { report, act }
}

/** Um ScopePort que conta as perguntas e passa a negar na N-ésima. */
function denyingAt(n: number, reason = 'commander-not-allowed'): ScopePort & { readonly calls: () => number } {
  let calls = 0
  return {
    calls: () => calls,
    check() {
      calls += 1
      return calls >= n ? { allow: false, reason } : { allow: true }
    },
  }
}

describe('executor-calls-guard-every-step', () => {
  it('sem scope o laço é o de sempre (compatível com o que já existe)', async () => {
    const { report, act } = run(undefined)
    expect((await report).status).toBe('done')
    expect(act.actions).toHaveLength(3)
  })

  it('pergunta no começo de cada passo E imediatamente antes de cada ação (2 por passo)', async () => {
    const scope = denyingAt(Number.POSITIVE_INFINITY)
    const { report, act } = run(scope)
    expect((await report).status).toBe('done')
    expect(act.actions).toHaveLength(3)
    expect(scope.calls()).toBe(6)
  })

  it('passa a negar no começo do passo 3: os passos 1 e 2 agiram, o 3 não; status denied com o motivo', async () => {
    const scope = denyingAt(5)
    const { report, act } = run(scope)
    const done = await report
    expect(done.status).toBe('denied')
    expect(done.message).toBe('scope:commander-not-allowed')
    expect(act.actions).toHaveLength(2)
    const last = done.replay[done.replay.length - 1]
    expect(last).toMatchObject({ stepId: 's3', result: 'denied', detail: 'scope:commander-not-allowed' })
  })

  it('passa a negar IMEDIATAMENTE antes de agir no passo 3 (TOCTOU): não age', async () => {
    const scope = denyingAt(6, 'computer-use-off')
    const { report, act } = run(scope)
    const done = await report
    expect(done.status).toBe('denied')
    expect(done.message).toBe('scope:computer-use-off')
    expect(act.actions).toHaveLength(2)
  })

  it('cartão de aprovação demorado: a permissão some enquanto esperava; ao aprovar, a ação NÃO acontece', async () => {
    let allowed: readonly string[] = [bia]
    const persona: ComputerUsePersona = { id: 'p2', audience: 'team', creatorId: 'ana', homeComputerId: 'pcA', computerUse: true }
    const computer: ComputerDescriptor = { computerId: 'pcA', kind: 'team', ownerId: 'ana', teamComputerUse: true }
    const guard = createComputerScopeGuard({ persona: () => persona, computer: () => computer, allowedIds: () => allowed })
    const slowApproval: StepPermissionPort = {
      request() {
        allowed = [] // o dono tirou o comandante da lista enquanto o cartão estava aberto
        return Promise.resolve({ decision: 'allow' as const })
      },
    }
    const { report, act } = run({ check: () => guard.check(bia) }, slowApproval)
    const done = await report
    expect(done.status).toBe('denied')
    expect(done.message).toBe('scope:commander-not-allowed')
    expect(act.actions).toHaveLength(0)
  })

  it('scope que lança = recusa (unreadable), nunca age', async () => {
    const { report, act } = run({
      check() {
        throw new Error('store fora')
      },
    })
    const done = await report
    expect(done.status).toBe('denied')
    expect(done.message).toBe('scope:unreadable')
    expect(act.actions).toHaveLength(0)
  })

  it('a regra dura de verdade: persona da equipe num PC pessoal = zero ações e zero cartões', async () => {
    const persona: ComputerUsePersona = { id: 'p2', audience: 'team', creatorId: 'ana', homeComputerId: 'pcA', computerUse: true }
    const personalPc: ComputerDescriptor = { computerId: 'pcA', kind: 'personal', ownerId: 'ana', teamComputerUse: false }
    const guard = createComputerScopeGuard({ persona: () => persona, computer: () => personalPc, allowedIds: () => ['ana', bia] })
    let cards = 0
    const counting: StepPermissionPort = {
      request() {
        cards += 1
        return Promise.resolve({ decision: 'allow' as const })
      },
    }
    const { report, act } = run({ check: () => guard.check(bia) }, counting)
    const done = await report
    expect(done.status).toBe('denied')
    expect(done.message).toBe('scope:team-persona-on-personal-pc')
    expect(act.actions).toHaveLength(0)
    expect(cards).toBe(0)
  })

  it('regra 1 com alvo ligado: nenhum observe acontece (nem a janela do alvo é lida) e o alvo vai no relatório', async () => {
    const persona: ComputerUsePersona = { id: 'p2', audience: 'team', creatorId: 'ana', homeComputerId: 'pcA', computerUse: true }
    const personalPc: ComputerDescriptor = { computerId: 'pcA', kind: 'personal', ownerId: 'ana', teamComputerUse: false }
    const guard = createComputerScopeGuard({ persona: () => persona, computer: () => personalPc, allowedIds: () => ['ana', bia] })
    let observed = 0
    const inner = fakeObservePort([okScreen])
    const observe: DesktopObservePort = {
      observe(context) {
        observed += 1
        return inner.observe(context)
      },
    }
    const act = fakeActPort()
    let t = 0
    const done = await runComputerUse({
      plan,
      observe,
      act,
      permission: fakePermissionPort('allow'),
      control: createMemorySharedControl(),
      now: () => (t += 1),
      scope: { check: () => guard.check(bia) },
      target: { windowHandle: '197382', processId: 9000 },
      requireTarget: true,
    })
    expect(done.status).toBe('denied')
    expect(done.message).toBe('scope:team-persona-on-personal-pc')
    expect(observed).toBe(0)
    expect(act.actions).toHaveLength(0)
    expect(done.target).toEqual({ windowHandle: '197382', processId: 9000 })
  })
})
