import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  STOPPED_COMPUTER_USE,
  runComputerUse,
  type ComputerUsePlan,
  type ComputerUseTarget,
  type SharedControlPort,
  type StepPermissionPort,
} from '@deepseek-ai/dsh-persona-engine'
import {
  createMcpGateway,
  openTurnTools,
  type PendingApproval,
} from '@deepseek-ai/dsh-persona-runners'
import {
  PERSONA_COMPUTER_USE_IPC,
  createComputerUseIpcBridge,
  createProcessComputerUseTransport,
  type ComputerUseIpcBridge,
  type ComputerUseIpcTransport,
} from '../src/computer-use-ipc.ts'

const target: ComputerUseTarget = { windowHandle: '197382', processId: 9000, title: 'Fixture' }

interface RecordedWire {
  readonly sent: Record<string, unknown>[]
  readonly transport: ComputerUseIpcTransport
  readonly deliverFromMain: (message: unknown) => void
  readonly setConnected: (connected: boolean) => void
}

function fakeWire(): RecordedWire {
  const sent: Record<string, unknown>[] = []
  const listeners = new Set<(message: unknown) => void>()
  let connected = true
  return {
    sent,
    transport: {
      connected: () => connected,
      send: (message) => {
        if (!connected) return false
        sent.push(JSON.parse(JSON.stringify(message)) as Record<string, unknown>)
        return true
      },
      onMessage: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    deliverFromMain: (message) => {
      for (const listener of listeners) listener(message)
    },
    setConnected: (next) => { connected = next },
  }
}

const bridges: ComputerUseIpcBridge[] = []
afterEach(() => {
  for (const bridge of bridges.splice(0)) bridge.dispose()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('M9/C3 computer-use IPC bridge (host-child -> Electron main)', () => {
  it('runs engine runComputerUse loop end-to-end across IPC (observe + act with target verification)', async () => {
    const wire = fakeWire()
    const bridge = createComputerUseIpcBridge({ transport: wire.transport })
    bridges.push(bridge)

    const plan: ComputerUsePlan = {
      goal: 'Salvar documento',
      personaId: 'bia',
      target,
      steps: [{
        id: 's1',
        intent: 'clicar Salvar',
        action: { kind: 'click', target: 'Salvar', x: 10, y: 20 },
        expectation: { after: 'Salvar feito', nameIncludes: 'Feito', role: 'Text' },
      }],
    }
    const control: SharedControlPort = {
      snapshot: () => ({ owner: 'persona', reason: 'running', message: '' }),
    }
    const permission: StepPermissionPort = {
      request: async () => ({ decision: 'allow' }),
    }

    let stepCalls = 0
    const unsub = wire.transport.onMessage(() => undefined)
    unsub()

    const reportPromise = runComputerUse({
      plan,
      observe: bridge.observe,
      act: bridge.act,
      permission,
      control,
      target,
      requireTarget: true,
      now: () => 1_000 + stepCalls * 10,
    })

    await vi.waitFor(() => { expect(wire.sent).toHaveLength(1) })
    expect(wire.sent[0]).toMatchObject({
      type: PERSONA_COMPUTER_USE_IPC,
      op: 'observe',
      target,
    })
    wire.deliverFromMain({
      type: PERSONA_COMPUTER_USE_IPC,
      requestId: wire.sent[0]!.requestId,
      op: 'observe',
      observation: {
        atMs: 1_000,
        captureRef: 'shot-1',
        target,
        tree: { id: 'win', role: 'Window', name: 'Fixture', children: [{ id: 'b', role: 'Button', name: 'Salvar' }] },
      },
    })

    await vi.waitFor(() => { expect(wire.sent).toHaveLength(2) })
    expect(wire.sent[1]).toMatchObject({
      type: PERSONA_COMPUTER_USE_IPC,
      op: 'act',
      action: { kind: 'click', target: 'Salvar', x: 10, y: 20 },
      target,
    })
    wire.deliverFromMain({
      type: PERSONA_COMPUTER_USE_IPC,
      requestId: wire.sent[1]!.requestId,
      op: 'act',
      result: { ok: true, detail: 'ok' },
    })

    await vi.waitFor(() => { expect(wire.sent).toHaveLength(3) })
    stepCalls += 1
    expect(wire.sent[2]).toMatchObject({
      type: PERSONA_COMPUTER_USE_IPC,
      op: 'observe',
      target,
    })
    wire.deliverFromMain({
      type: PERSONA_COMPUTER_USE_IPC,
      requestId: wire.sent[2]!.requestId,
      op: 'observe',
      observation: {
        atMs: 1_010,
        captureRef: 'shot-2',
        target,
        tree: { id: 'win', role: 'Window', name: 'Fixture', children: [{ id: 't', role: 'Text', name: 'Feito' }] },
      },
    })

    const report = await reportPromise
    expect(report.status).toBe('done')
    expect(report.stepsVerified).toBe(1)
    expect(report.target).toEqual(target)
  })

  it('bridges McpGateway ActingPorts (screenshot, click, type) over IPC and propagates runId + target cleanly', async () => {
    const wire = fakeWire()
    const bridge = createComputerUseIpcBridge({ transport: wire.transport })
    bridges.push(bridge)

    const approvals: PendingApproval[] = []
    const gateway = createMcpGateway({
      hooks: { report: () => {}, recall: () => '', ask: () => {} },
      onApproval: (approval) => { approvals.push(approval) },
      acting: bridge.acting,
      onlyWired: true,
    })

    const controller = new AbortController()
    const unwatch = bridge.watchRun('run-7', controller.signal, 'bia')
    const opened = openTurnTools(gateway, {
      run: { personaId: 'bia', ticketId: 'tk-1', assignmentId: 'as-1' },
      toolLevel: 'write',
      worktree: '.',
      authority: 'person',
      computer: { runId: 'run-7', target, signal: controller.signal },
    })
    expect(opened).toBeDefined()
    if (opened === undefined) {
      unwatch()
      return
    }

    try {
      const shotTool = opened.tools.find(t => t.name === 'persona_computer_screenshot')
      const clickTool = opened.tools.find(t => t.name === 'persona_computer_click')
      const typeTool = opened.tools.find(t => t.name === 'persona_computer_type')

      const shotPromise = shotTool!.handler({})
      await vi.waitFor(() => { expect(wire.sent).toHaveLength(1) })
      expect(wire.sent[0]).toEqual({
        type: PERSONA_COMPUTER_USE_IPC,
        requestId: wire.sent[0]!.requestId,
        op: 'screenshot',
        runId: 'run-7',
        personaId: 'bia',
        target,
      })
      wire.deliverFromMain({
        type: PERSONA_COMPUTER_USE_IPC,
        requestId: wire.sent[0]!.requestId,
        op: 'screenshot',
        content: 'window-shot-data',
      })
      await expect(shotPromise).resolves.toEqual({ content: 'window-shot-data' })

      const pendingClick = await clickTool!.handler({ x: 42, y: 84 })
      expect(pendingClick.content).toContain('Aprovação pedida: computer_act')
      expect(wire.sent).toHaveLength(1)

      const approveClickPromise = gateway.approve(approvals[0]!.id)
      await vi.waitFor(() => { expect(wire.sent).toHaveLength(2) })
      expect(wire.sent[1]).toEqual({
        type: PERSONA_COMPUTER_USE_IPC,
        requestId: wire.sent[1]!.requestId,
        op: 'click',
        x: 42,
        y: 84,
        runId: 'run-7',
        personaId: 'bia',
        target,
      })
      wire.deliverFromMain({
        type: PERSONA_COMPUTER_USE_IPC,
        requestId: wire.sent[1]!.requestId,
        op: 'click',
        content: 'ok',
      })
      await expect(approveClickPromise).resolves.toMatchObject({ content: 'ok' })

      await typeTool!.handler({ text: 'olá' })
      const approveTypePromise = gateway.approve(approvals[1]!.id)
      await vi.waitFor(() => { expect(wire.sent).toHaveLength(3) })
      expect(wire.sent[2]).toEqual({
        type: PERSONA_COMPUTER_USE_IPC,
        requestId: wire.sent[2]!.requestId,
        op: 'type',
        text: 'olá',
        runId: 'run-7',
        personaId: 'bia',
        target,
      })
      wire.deliverFromMain({
        type: PERSONA_COMPUTER_USE_IPC,
        requestId: wire.sent[2]!.requestId,
        op: 'type',
        content: 'ok',
      })
      await expect(approveTypePromise).resolves.toMatchObject({ content: 'ok' })

      bridge.end('run-7')
      expect(wire.sent.at(-1)).toEqual({
        type: PERSONA_COMPUTER_USE_IPC,
        op: 'end',
        runId: 'run-7',
      })

      const explicitCtx = { runId: 'run-x', personaId: 'alice', target }
      const explicitObs = bridge.observe.observe(explicitCtx)
      await vi.waitFor(() => { expect(wire.sent.at(-1)?.op).toBe('observe') })
      expect(wire.sent.at(-1)).toMatchObject({ op: 'observe', runId: 'run-x', personaId: 'alice' })
      wire.deliverFromMain({
        type: PERSONA_COMPUTER_USE_IPC,
        requestId: wire.sent.at(-1)!.requestId,
        op: 'observe',
        observation: {
          atMs: 1_000,
          captureRef: 'none',
          target,
          tree: { id: 'win', role: 'Window', name: 'Fixture' },
        },
      })
      await expect(explicitObs).resolves.toMatchObject({ target })
    } finally {
      unwatch()
      await opened.close?.()
    }
  })

  it('settles in-flight observe/act/acting calls synchronously when AbortSignal or stop(runId) fires and forwards op=stop to main', async () => {
    const wire = fakeWire()
    const bridge = createComputerUseIpcBridge({ transport: wire.transport })
    bridges.push(bridge)

    const controller = new AbortController()
    const actPromise = bridge.act.act({ kind: 'click', target: 'Salvar', x: 1, y: 2 }, { target, signal: controller.signal })
    const obsPromise = bridge.observe.observe({ target, signal: controller.signal })
    await vi.waitFor(() => { expect(wire.sent).toHaveLength(2) })

    controller.abort()

    await expect(actPromise).resolves.toEqual({ ok: false, detail: STOPPED_COMPUTER_USE })
    const stoppedObs = await obsPromise
    expect(stoppedObs.target).toBeUndefined()
    expect(stoppedObs.captureRef).toBe('none')
    expect(wire.sent.filter(m => m.op === 'stop')).toEqual([
      { type: PERSONA_COMPUTER_USE_IPC, op: 'stop', requestId: wire.sent[0]!.requestId },
      { type: PERSONA_COMPUTER_USE_IPC, op: 'stop', requestId: wire.sent[1]!.requestId },
    ])

    // Late replies after abort must be ignored cleanly
    wire.deliverFromMain({
      type: PERSONA_COMPUTER_USE_IPC,
      requestId: wire.sent[0]!.requestId,
      op: 'act',
      result: { ok: true, detail: 'ok' },
    })

    // Pre-aborted call never sends IPC
    const beforeCount = wire.sent.length
    await expect(bridge.acting.computerClick?.(1, 2, { runId: 'r-pre', target, signal: controller.signal })).resolves.toBe('parado a pedido')
    expect(wire.sent).toHaveLength(beforeCount)

    // Explicit stop(runId) cancels in-flight calls tagged with runId and notifies main once for the runId
    const clickInFlight = bridge.acting.computerClick?.(5, 6, { runId: 'run-99', target })
    await vi.waitFor(() => { expect(wire.sent).toHaveLength(beforeCount + 1) })
    bridge.stop('run-99')
    await expect(clickInFlight).resolves.toBe('parado a pedido')
    expect(wire.sent.at(-1)).toEqual({ type: PERSONA_COMPUTER_USE_IPC, op: 'stop', runId: 'run-99' })
  })

  it('tracks main held state notifications synchronously and notifies onHeldChange', async () => {
    const wire = fakeWire()
    const heldTransitions: boolean[] = []
    const bridge = createComputerUseIpcBridge({
      transport: wire.transport,
      onHeldChange: (held) => { heldTransitions.push(held) },
    })
    bridges.push(bridge)

    expect(bridge.held()).toBe(false)
    wire.deliverFromMain({ type: PERSONA_COMPUTER_USE_IPC, op: 'held', held: true })
    expect(bridge.held()).toBe(true)
    expect(heldTransitions).toEqual([true])

    // While held, click/type are refused synchronously without IPC
    const beforeSent = wire.sent.length
    await expect(bridge.acting.computerClick?.(10, 10, { runId: 'r1', target })).resolves.toBe('humano no controle')
    await expect(bridge.acting.computerType?.('abc', { runId: 'r1', target })).resolves.toBe('humano no controle')
    expect(wire.sent).toHaveLength(beforeSent)

    wire.deliverFromMain({ type: PERSONA_COMPUTER_USE_IPC, op: 'held', held: false })
    expect(bridge.held()).toBe(false)
    expect(heldTransitions).toEqual([true, false])
  })

  it('fails closed on malformed replies, timeouts, disconnect, and cleans process listeners on dispose', async () => {
    vi.useFakeTimers()
    const sentMessages: unknown[] = []
    const emitter = new EventEmitter()
    const channel = {
      connected: true,
      send: (message: unknown, callback?: (error: Error | null) => void) => {
        sentMessages.push(message)
        callback?.(null)
        return true
      },
      on: (event: 'message' | 'disconnect', listener: (...args: unknown[]) => void) => emitter.on(event, listener),
      off: (event: 'message' | 'disconnect', listener: (...args: unknown[]) => void) => emitter.off(event, listener),
    }

    const beforeMessageListeners = emitter.listenerCount('message')
    const beforeDisconnectListeners = emitter.listenerCount('disconnect')
    const transport = createProcessComputerUseTransport(channel)
    const bridge = createComputerUseIpcBridge({ transport, timeoutMs: 100 })
    bridges.push(bridge)

    // 1. Timeout fails closed with zero leaked timers
    const timedAct = bridge.act.act({ kind: 'click', target: 'Salvar', x: 0, y: 0 }, { target })
    await vi.advanceTimersByTimeAsync(100)
    await expect(timedAct).resolves.toEqual({ ok: false, detail: 'executor-unavailable' })
    expect(vi.getTimerCount()).toBe(0)

    // 2. Unrelated garbage is ignored while malformed observe payload for matching requestId fails closed immediately
    const obsPromise = bridge.observe.observe({ target })
    const req = sentMessages.at(-1) as { requestId: number }
    emitter.emit('message', { type: 'other-ipc', requestId: req.requestId })
    emitter.emit('message', {
      type: PERSONA_COMPUTER_USE_IPC,
      requestId: req.requestId,
      op: 'observe',
      observation: {
        atMs: 1_000,
        captureRef: 'x',
        target: { windowHandle: '', processId: -1 },
        tree: { id: 'win', role: 'Window', name: 'Bad' },
      },
    })
    const obs = await obsPromise
    expect(obs.target).toBeUndefined()
    expect(obs.captureRef).toBe('none')
    expect(vi.getTimerCount()).toBe(0)

    // 3. Parent IPC disconnect settles in-flight calls immediately without waiting timeout
    const inflightShot = bridge.acting.computerScreenshot?.({ target })
    channel.connected = false
    emitter.emit('disconnect')
    await expect(inflightShot).resolves.toBe('executor-unavailable')
    expect(vi.getTimerCount()).toBe(0)

    bridge.dispose()
    expect(emitter.listenerCount('message')).toBe(beforeMessageListeners)
    expect(emitter.listenerCount('disconnect')).toBe(beforeDisconnectListeners)

    // 4. After dispose / disconnected, calls fail closed cleanly
    await expect(bridge.act.act({ kind: 'wait', ms: 10 }, { target })).resolves.toEqual({
      ok: false,
      detail: 'executor-unavailable',
    })
    await expect(bridge.acting.computerScreenshot?.({ target })).resolves.toBe('executor-unavailable')
  })
})
