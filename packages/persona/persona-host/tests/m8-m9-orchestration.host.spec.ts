import {
  actingPortsFromComputerUse,
  createMcpGateway,
  type PersonaToolHooks,
  type RunEvent,
  type RunHandle,
  type StartTurnInput,
  type TurnRunner,
} from '@deepseek-ai/dsh-persona-runners'
import { describe, expect } from 'vitest'
import { ComputerRuns, type ComputerRun } from '../src/computer-runs.ts'
import { harnessMcpPorts } from '../src/harness-dispatch.ts'
import { productToolsOpener } from '../src/harness-turn.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

const hooks: PersonaToolHooks = { report: () => {}, recall: () => '', ask: () => {} }

interface ScriptedTurnControl {
  readonly runner: TurnRunner
  readonly started: StartTurnInput[]
  readonly cancelled: string[]
  release?: () => void
  readonly whenStarted: Promise<void>
}

function controlledTurnRunner(options: {
  readonly hold?: boolean
  readonly replyText?: string
}): ScriptedTurnControl {
  const started: StartTurnInput[] = []
  const cancelled: string[] = []
  let markStarted: (() => void) | undefined
  const whenStarted = new Promise<void>((resolve) => { markStarted = resolve })
  const handles = new Map<string, StartTurnInput>()
  let releaseFn: (() => void) | undefined
  const holdPromise = options.hold === true
    ? new Promise<void>((resolve) => { releaseFn = resolve })
    : Promise.resolve()

  const start = (input: StartTurnInput): Promise<RunHandle> => {
    started.push(input)
    const handle: RunHandle = {
      runId: `r-${input.ticketId}`,
      sessionId: input.ticketId,
      ticketId: input.ticketId,
      assignmentId: input.assignmentId,
      personaId: input.personaId,
      cwd: input.cwd,
      model: input.model,
    }
    handles.set(handle.runId, input)
    return Promise.resolve(handle)
  }

  const stream = (handle: RunHandle): AsyncIterable<RunEvent> => ({
    async *[Symbol.asyncIterator](): AsyncIterator<RunEvent> {
      yield { type: 'started', at: '2026-11-12T12:00:00.000Z', handle }
      markStarted?.()
      await holdPromise
      yield { type: 'delta', at: '2026-11-12T12:00:01.000Z', text: options.replyText ?? 'Feito remotamente.' }
      yield { type: 'ended', at: '2026-11-12T12:00:02.000Z', report: { state: 'ready', summary: options.replyText ?? 'Feito remotamente.' } }
    },
  })

  return {
    started,
    cancelled,
    whenStarted,
    release: () => { releaseFn?.() },
    runner: {
      capabilities: () => ({ kind: 'cli', stream: true, cancel: true, resume: false, usage: true, mcpTools: 'available', permission: 'explicit' }),
      health: async () => ({ ok: true, detail: 'ok' }),
      authenticate: async () => ({ ok: true, detail: 'ok' }),
      start,
      startTurn: start,
      resume: start,
      stream,
      events: stream,
      cancel: async (handleOrSession) => {
        cancelled.push(typeof handleOrSession === 'string' ? handleOrSession : handleOrSession.runId)
        releaseFn?.()
      },
      usage: async () => ({ inputTokens: 0, outputTokens: 0 }),
    },
  }
}

function seedHost(): ReturnType<typeof openJourney> {
  const h = openJourney('2026-11-12T12:00:00.000Z')
  h.orchestration.scripted = false
  h.orchestration.skipTriage = true
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  seedJourney(h, [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }])
  h.createPersona({
    id: 'nina',
    ...SCOPE,
    name: 'Nina',
    title: 'Execução',
    description: 'Execução',
    personality: 'Clara.',
    instructions: 'Ajude.',
    avatarKind: 'gallery',
    avatarRef: 'nina',
    runnerKind: 'cli',
    runnerCli: 'claude',
    runnerModel: 'haiku',
    canRecruit: false,
    createdBy: 'ana',
  })
  h.sessionMemberId = 'ana'
  return h
}

describe('M8 + M9 orchestration host wiring', () => {
  it('routes remote-home persona turns through remoteRunnerOf without entering local warmRunners pool', async () => {
    const h = seedHost()

    const remote = controlledTurnRunner({ replyText: 'Respondido da estação B.' })
    h.orchestration.remoteRunnerOf = personaId => (personaId === 'nina' ? remote.runner : undefined)

    h.postMessage({ id: 'm-rem-1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Nina verifique o arquivo no servidor remoto', actorId: 'ana', subjectId: 'm-rem-1' })
    await h.orchestration.flush('pp')

    expect(remote.started).toHaveLength(1)
    expect(h.orchestration.warmRunners.size).toBe(0)
    const messages = h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 100 }).events
    expect(messages.some(m => m.body.includes('Respondido da estação B.'))).toBe(true)
  })

  it('opens ComputerRuns for human turns, completes cleanly, aborts synchronously on stopTicketRun, and denies autonomous origins', async () => {
    const h = seedHost()

    const stored = new Map<string, ComputerRun>()
    const aborted: ComputerRun[] = []
    const runs = new ComputerRuns({
      now: () => 5_000,
      thisComputerId: () => 'pc-1',
      homeOf: () => 'pc-1',
      access: () => ({ allow: true }),
      projectState: () => 'open',
      targetVerdict: t => (t.windowHandle === 'hwnd-safe' ? { ok: true } : { ok: false, why: 'outside-window' }),
      requireTarget: true,
      abort: (run) => { aborted.push(run) },
      store: { put: (run) => { stored.set(run.runId, run) }, list: () => [...stored.values()] },
    })

    const gateway = createMcpGateway({
      hooks,
      harness: harnessMcpPorts(h.harness),
      onlyWired: true,
      acting: actingPortsFromComputerUse({
        held: () => false,
        screenshot: async () => 'shot',
        click: async () => 'click',
        type: async () => 'type',
      }),
    })
    const target = { windowHandle: 'hwnd-safe', processId: 101, title: 'App' }
    const rt = h.orchestration.runtime('pp')
    h.orchestration.computerRuns = runs
    h.orchestration.computerTargetOf = () => target
    h.orchestration.productToolsOf = () => productToolsOpener({
      gateway,
      toolLevel: 'none',
      taskTextOf: id => rt.repo.tickets.get(id)?.execution?.assignment ?? '',
    })

    // 1. Human origin completes cleanly and settles ComputerRun -> 'concluida'.
    const doneCtrl = controlledTurnRunner({ replyText: 'Cliquei no botão Salvar.' })
    h.orchestration.remoteRunnerOf = () => doneCtrl.runner
    h.postMessage({ id: 'm-hum-1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Nina preciso que você execute a ação e salve o arquivo', actorId: 'ana', subjectId: 'm-hum-1' })
    await h.orchestration.flush('pp')
    const firstTicket = rt.repo.tickets.list().find(t => t.origin.triggerId === 'm-hum-1')!
    expect(runs.byTicket(firstTicket.id)).toMatchObject({ state: 'concluida' })
    expect(doneCtrl.started[0]?.mcpTools?.tools.map(t => t.name).sort()).toEqual([
      'persona_ask',
      'persona_computer_click',
      'persona_computer_screenshot',
      'persona_computer_type',
    ])

    // 2. Synchronous stopTicketRun marks ComputerRun 'parando' + aborts signal immediately, then actReturned -> 'parada'.
    const holdCtrl = controlledTurnRunner({ hold: true })
    h.orchestration.remoteRunnerOf = () => holdCtrl.runner
    h.postMessage({ id: 'm-hum-2', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Nina preciso que você preencha o formulário do sistema', actorId: 'ana', subjectId: 'm-hum-2' })
    await holdCtrl.whenStarted
    const liveTicket = rt.repo.tickets.list().find(t => t.origin.triggerId === 'm-hum-2')!
    const liveRun = runs.byTicket(liveTicket.id)!
    expect(liveRun.state).toBe('rodando')
    const liveSignal = runs.signalOf(liveRun.runId)!
    expect(liveSignal.aborted).toBe(false)

    const stopPromise = h.orchestration.stopTicketRun('pp', liveTicket.id, 'Parado pelo teste')
    expect(runs.byTicket(liveTicket.id)?.state).toBe('parando')
    expect(liveSignal.aborted).toBe(true)
    expect(aborted.map(r => r.runId)).toContain(liveRun.runId)

    expect(await stopPromise).toBe(true)
    await h.orchestration.flush('pp')
    expect(runs.byTicket(liveTicket.id)?.state).toBe('parada')

    // 3. Autonomous routine origin never opens ComputerRun and never exposes persona_computer_*.
    const routineCtrl = controlledTurnRunner({ replyText: 'Rotina executada.' })
    h.orchestration.remoteRunnerOf = () => routineCtrl.runner
    h.postMessage({ id: 'routine-run:r1:1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Nina preciso que você faça a tarefa da rotina', actorId: 'ana', subjectId: 'routine-run:r1:1' })
    await h.orchestration.flush('pp')
    const routineTicket = rt.repo.tickets.list().find(t => t.origin.triggerId === 'routine-run:r1:1')!
    expect(runs.byTicket(routineTicket.id)).toBeUndefined()
    expect(runs.active()).toEqual([])
    expect(routineCtrl.started[0]?.mcpTools?.tools.map(t => t.name)).toEqual(['persona_ask'])
  })
})
