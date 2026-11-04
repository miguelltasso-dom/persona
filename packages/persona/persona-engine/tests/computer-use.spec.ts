import { expect, it } from 'vitest'
import { FakeClock } from '../src/executor/fake.ts'
import {
  YOU_TOOK_OVER,
  assertComputerUsePlan,
  classifyComputerAction,
  createMemorySharedControl,
  fakeActPort,
  fakeObservePort,
  fakePermissionPort,
  projectReplayForUi,
  runComputerUse,
  treeNames,
  verifyExpectation,
  type A11yNode,
  type ComputerUsePlan,
  type ComputerUseStep,
  type ScreenObservation,
} from '../src/index.ts'

const toast = (name: string, atMs: number, captureRef: string): ScreenObservation => ({
  atMs,
  captureRef,
  tree: {
    id: 'root',
    role: 'window',
    name: 'Cadastro de pedido',
    children: [
      { id: 'save', role: 'button', name: 'Salvar pedido' },
      { id: 'toast', role: 'status', name },
    ],
  },
})

const emptyForm = (atMs: number): ScreenObservation => ({
  atMs,
  captureRef: `file://local/empty-${String(atMs)}.png`,
  tree: {
    id: 'root',
    role: 'window',
    name: 'Cadastro de pedido',
    children: [{ id: 'save', role: 'button', name: 'Salvar pedido' }],
  },
})

const clickSave: ComputerUseStep = {
  id: 's1',
  intent: 'Salvar o pedido',
  action: { kind: 'click', target: 'Salvar pedido', x: 120, y: 80 },
  expectation: {
    after: 'depois de clicar em Salvar, aparece o toast Pedido salvo',
    nameIncludes: 'Pedido salvo',
    role: 'status',
  },
}

const typeClient: ComputerUseStep = {
  id: 's0',
  intent: 'Preencher o cliente',
  action: { kind: 'type', target: 'Cliente', text: 'Padaria Lua' },
  expectation: {
    after: 'depois de digitar, o campo Cliente mostra Padaria Lua',
    nameIncludes: 'Cliente',
    valueIncludes: 'Padaria Lua',
  },
}

function plan(steps: readonly ComputerUseStep[]): ComputerUsePlan {
  return { goal: 'Cadastrar pedido da Padaria Lua', personaId: 'nina', steps }
}

function filledClient(atMs: number): ScreenObservation {
  return {
    atMs,
    captureRef: `file://local/client-${String(atMs)}.png`,
    tree: {
      id: 'root',
      role: 'window',
      name: 'Cadastro de pedido',
      children: [
        { id: 'client', role: 'textbox', name: 'Cliente', value: 'Padaria Lua' },
        { id: 'save', role: 'button', name: 'Salvar pedido' },
      ],
    },
  }
}

it('verifies a two-step plan against the fake UIA tree', async () => {
  const clock = new FakeClock(1_000)
  const act = fakeActPort()
  const report = await runComputerUse({
    plan: plan([typeClient, clickSave]),
    observe: fakeObservePort([
      emptyForm(1_000),
      filledClient(1_100),
      filledClient(1_200),
      toast('Pedido salvo', 1_300, 'file://local/toast.png'),
    ]),
    act,
    permission: fakePermissionPort('allow'),
    control: createMemorySharedControl(),
    now: () => clock.now(),
  })
  expect(report.status).toBe('done')
  expect(report.stepsVerified).toBe(2)
  expect(act.actions.map(row => row.kind)).toEqual(['type', 'click'])
  expect(report.replay[1]?.expectation).toContain('toast Pedido salvo')
  expect(report.replay[1]?.saw.names).toContain('Pedido salvo')
})

it('retries when the toast is missing, then verifies (attempt limit)', async () => {
  const clock = new FakeClock(0)
  const report = await runComputerUse({
    plan: plan([clickSave]),
    observe: fakeObservePort([
      emptyForm(0),
      emptyForm(10),
      toast('Pedido salvo', 30, 'file://local/ok.png'),
    ]),
    act: fakeActPort(),
    permission: fakePermissionPort('allow'),
    control: createMemorySharedControl(),
    now: () => clock.now(),
    limits: { maxSteps: 4, maxAttemptsPerStep: 3, maxMs: 10_000, maxBudgetTokens: 100 },
  })
  expect(report.status).toBe('done')
  expect(report.attempts).toBe(2)
  expect(report.replay.map(row => row.result)).toEqual(['retry', 'verified'])
})

it('fails the step after the attempt limit and reports', async () => {
  const report = await runComputerUse({
    plan: plan([clickSave]),
    observe: fakeObservePort([emptyForm(0), emptyForm(1), emptyForm(2), emptyForm(3)]),
    act: fakeActPort(),
    permission: fakePermissionPort('allow'),
    control: createMemorySharedControl(),
    now: () => 0,
    limits: { maxSteps: 4, maxAttemptsPerStep: 2, maxMs: 10_000, maxBudgetTokens: 100 },
  })
  expect(report.status).toBe('failed')
  expect(report.replay.map(row => row.result)).toEqual(['retry', 'failed'])
  expect(report.message).toContain('não conferiu')
})

it('refuses a step without an explicit expectation or matcher', () => {
  expect(() => {
    assertComputerUsePlan(plan([{
      id: 'x',
      intent: 'Clicar',
      action: { kind: 'click', target: 'Ok', x: 0, y: 0 },
      expectation: { after: '' },
    }]))
  }).toThrow(/INVALID_COMPUTER_USE/)
  expect(() => {
    assertComputerUsePlan(plan([{
      id: 'x',
      intent: 'Clicar',
      action: { kind: 'click', target: 'Ok', x: 0, y: 0 },
      expectation: { after: 'depois de clicar aparece algo' },
    }]))
  }).toThrow(/INVALID_COMPUTER_USE/)
})

it('pauses immediately when the human moves the mouse; resume is explicit', async () => {
  const control = createMemorySharedControl()
  control.humanTookOver()
  expect(control.snapshot()).toEqual({
    owner: 'human',
    reason: 'human_input',
    message: YOU_TOOK_OVER,
  })
  const act = fakeActPort()
  const paused = await runComputerUse({
    plan: plan([clickSave]),
    observe: fakeObservePort([emptyForm(0), toast('Pedido salvo', 1, 'x')]),
    act,
    permission: fakePermissionPort('allow'),
    control,
    now: () => 0,
  })
  expect(paused.status).toBe('paused')
  expect(paused.message).toBe(YOU_TOOK_OVER)
  expect(act.actions).toEqual([])
  expect(paused.control.owner).toBe('human')

  control.resume()
  expect(control.snapshot().owner).toBe('persona')
  expect(control.snapshot().reason).toBe('resumed')
  const resumed = await runComputerUse({
    plan: plan([clickSave]),
    observe: fakeObservePort([emptyForm(0), toast('Pedido salvo', 1, 'x')]),
    act,
    permission: fakePermissionPort('allow'),
    control,
    now: () => 1,
  })
  expect(resumed.status).toBe('done')
  expect(act.actions).toHaveLength(1)
})

it('treats an in-flight act that reports takeover as a pause (no further steps)', async () => {
  const act = fakeActPort(() => ({ ok: false, detail: YOU_TOOK_OVER }))
  const report = await runComputerUse({
    plan: plan([typeClient, clickSave]),
    observe: fakeObservePort([emptyForm(0)]),
    act,
    permission: fakePermissionPort('allow'),
    control: createMemorySharedControl(),
    now: () => 0,
  })
  expect(report.status).toBe('paused')
  expect(act.actions).toHaveLength(1)
  expect(report.stepsVerified).toBe(0)
})

it('records what it saw, did, and the result so the UI can replay', async () => {
  const report = await runComputerUse({
    plan: plan([clickSave]),
    observe: fakeObservePort([
      emptyForm(0),
      toast('Pedido salvo', 1, 'file://local/after.png'),
    ]),
    act: fakeActPort(),
    permission: fakePermissionPort('allow'),
    control: createMemorySharedControl(),
    now: () => 42,
  })
  const ui = projectReplayForUi(report.replay)
  expect(ui).toHaveLength(1)
  expect(ui[0]).toMatchObject({
    stepId: 's1',
    attempt: 1,
    atMs: 42,
    did: { kind: 'click', target: 'Salvar pedido' },
    expectation: 'depois de clicar em Salvar, aparece o toast Pedido salvo',
    result: 'verified',
  })
  expect(ui[0]?.saw.beforeRef).toContain('empty')
  expect(ui[0]?.saw.afterRef).toBe('file://local/after.png')
  expect(ui[0]?.saw.names).toEqual(['Cadastro de pedido', 'Salvar pedido', 'Pedido salvo'])
})

it('gates each external/sensitive step through the MCP-shaped permission port', async () => {
  expect(classifyComputerAction({ kind: 'wait', ms: 10 })).toBeUndefined()
  expect(classifyComputerAction({ kind: 'click', target: 'x', x: 1, y: 1 })).toBe('computer_act')
  expect(classifyComputerAction({ kind: 'type', target: 'x', text: 'sk-secret' })).toBe('credentials')

  const deniedAct = fakeActPort()
  const denied = await runComputerUse({
    plan: plan([clickSave]),
    observe: fakeObservePort([emptyForm(0)]),
    act: deniedAct,
    permission: fakePermissionPort('deny'),
    control: createMemorySharedControl(),
    now: () => 0,
  })
  expect(denied.status).toBe('denied')
  expect(deniedAct.actions).toEqual([])

  const askedAct = fakeActPort()
  const asked = await runComputerUse({
    plan: plan([clickSave]),
    observe: fakeObservePort([emptyForm(0)]),
    act: askedAct,
    permission: fakePermissionPort('ask'),
    control: createMemorySharedControl(),
    now: () => 0,
  })
  expect(asked.status).toBe('needs_approval')
  expect(asked.message).toBe('Precisa de você')
  expect(askedAct.actions).toEqual([])
})

it('stops at time, step, and token budget limits', async () => {
  const clock = new FakeClock(0)
  const timed = await runComputerUse({
    plan: plan([clickSave]),
    observe: fakeObservePort([emptyForm(0)]),
    act: fakeActPort(),
    permission: fakePermissionPort('allow'),
    control: createMemorySharedControl(),
    now: () => clock.now(),
    limits: { maxSteps: 4, maxAttemptsPerStep: 2, maxMs: 0, maxBudgetTokens: 100 },
  })
  expect(timed.status).toBe('limit')
  expect(timed.message).toContain('tempo')

  const tooMany = await runComputerUse({
    plan: plan([typeClient, clickSave]),
    observe: fakeObservePort([emptyForm(0)]),
    act: fakeActPort(),
    permission: fakePermissionPort('allow'),
    control: createMemorySharedControl(),
    now: () => 0,
    limits: { maxSteps: 1, maxAttemptsPerStep: 2, maxMs: 10_000, maxBudgetTokens: 100 },
  })
  expect(tooMany.status).toBe('limit')
  expect(tooMany.message).toContain('passos')

  const budget = await runComputerUse({
    plan: plan([clickSave]),
    observe: fakeObservePort([emptyForm(0), toast('Pedido salvo', 1, 'x')]),
    act: fakeActPort(),
    permission: fakePermissionPort('allow'),
    control: createMemorySharedControl(),
    now: () => 0,
    spendTokens: () => 50,
    limits: { maxSteps: 4, maxAttemptsPerStep: 2, maxMs: 10_000, maxBudgetTokens: 40 },
  })
  expect(budget.status).toBe('limit')
  expect(budget.message).toContain('orçamento')
})

it('walks a fake accessibility tree for names used in replay', () => {
  const tree: A11yNode = {
    id: 'r',
    role: 'window',
    name: 'App',
    children: [{ id: 'b', role: 'button', name: 'Salvar' }],
  }
  expect(treeNames(tree)).toEqual(['App', 'Salvar'])
  expect(verifyExpectation(
    { atMs: 0, captureRef: 'x', tree },
    { after: 'depois de abrir, o botão Salvar está visível', nameIncludes: 'Salvar', role: 'button' },
  ).ok).toBe(true)
})
