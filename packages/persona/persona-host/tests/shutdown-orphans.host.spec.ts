/**
 * Carbon P0-12 (sprint de correção): closing the host left Chrome trees and the `powershell.exe` that keeps Windows awake orphaned, and detached work was not awaited. The disposer
 * closes every Chrome, stops holding the machine awake and waits for detached background work BEFORE the store closes.
 * And evicting a warm runner ("Assumir controle") now stops a REAL OAR session runner: the open turn is cancelled and the CLI released.
 */
import { Context } from '@deepseek-ai/cordis'
import { createOarSessionRunner, type OarSessionOptions, type RunEvent, type RunHandle, type StartTurnInput } from '@deepseek-ai/dsh-persona-runners'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { it } from './host-harness.ts'

it('closing the host closes every Chrome, stops holding Windows awake and waits for detached work', async () => {
  const ctx = new Context()
  const h = new PersonaHost(ctx, { databasePath: '' })
  const calls: string[] = []
  h.browser.closeAll = () => { calls.push('browser.closeAll'); return Promise.resolve() }
  h.station.setRunning = (on: boolean) => { calls.push(`station.setRunning:${String(on)}`) }
  h.orchestration.whenBackgroundIdle = () => { calls.push('background.whenIdle'); return Promise.resolve() }
  await ctx.fiber.dispose()
  expect(calls).toEqual(expect.arrayContaining(['browser.closeAll', 'station.setRunning:false', 'background.whenIdle']))
})

it('evicting a warm runner disposes a real OAR session runner: the turn that was open is cancelled and the CLI released', async () => {
  const ctx = new Context()
  const h = new PersonaHost(ctx, { databasePath: '' })
  const cancelled: RunHandle[] = []
  let released = 0
  const gate = Promise.withResolvers<null>()
  const handleOf = (input: StartTurnInput): RunHandle => ({ runId: 'r', sessionId: 's', ticketId: input.ticketId, assignmentId: input.assignmentId, personaId: input.personaId, cwd: input.cwd, model: input.model })
  async function* play(handle: RunHandle): AsyncIterable<RunEvent> {
    yield { type: 'started', at: '2026-11-12T10:00:00.000Z', handle }
    await gate.promise
    yield { type: 'ended', at: '2026-11-12T10:00:00.000Z', report: { state: 'dropped', summary: 'cancelled' } }
  }
  const turn: OarSessionOptions['turn'] = {
    capabilities: () => ({ kind: 'dsh', stream: true, cancel: true, resume: true, usage: true, mcpTools: 'unavailable', permission: 'none' }),
    health: () => Promise.resolve({ ok: true, detail: 'fake' }), authenticate: () => Promise.resolve({ ok: true, detail: 'fake' }),
    start: input => Promise.resolve(handleOf(input)), startTurn: input => Promise.resolve(handleOf(input)), resume: input => Promise.resolve(handleOf(input)),
    stream: play, events: play,
    cancel: (handle) => { cancelled.push(handle); gate.resolve(null); return Promise.resolve() },
    usage: () => Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
    dispose: () => { released += 1; return Promise.resolve() },
  }
  const runner = createOarSessionRunner({ turn, personaId: 'nina', model: 'default', permissionMode: 'deny' })
  await runner.ensureSession('worker-t1', '.', 'Tarefa', 'worker')
  const delivering = runner.deliver('worker-t1', 'r1', 'faça o relatório', 'queue')
  for (let round = 0; round < 200 && runner.status('worker-t1') !== 'running'; round += 1) await new Promise(resolve => setTimeout(resolve, 5))
  h.orchestration.warmRunners.set('pp:nina:task', runner)
  expect(h.orchestration.evictWarmRunners('pp', 'nina')).toBe(1)
  for (let round = 0; round < 200 && released === 0; round += 1) await new Promise(resolve => setTimeout(resolve, 5)) // dispose runs without being awaited by the eviction
  expect(cancelled).toHaveLength(1)
  expect(released).toBe(1)
  await delivering.catch(() => undefined)
  await ctx.fiber.dispose()
})
