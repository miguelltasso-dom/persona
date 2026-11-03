import { describe, expect, it, vi } from 'vitest'
import { Engine, MemoryRepositories } from '@deepseek-ai/dsh-persona-engine'
import type { Assessor, Candidate, Executor, Outcome, Policy, Trigger } from '@deepseek-ai/dsh-persona-engine'
import type { Runner as EngineRunner } from '@deepseek-ai/dsh-persona-engine'
import {
  createDshSessionRunner,
  createExecutorAdapter,
  createFakeRunner,
  ROUTER_FORBIDDEN_TOOLS,
  toolsForRole,
  workerSessionId,
  type DshBoundSession,
  type DshSessionPort,
} from '../src/index.ts'

const member = { source: 'chat', id: 'alice' }
function trigger(id: string): Trigger {
  return {
    id, source: 'chat', threads: [{ source: 'chat', id: 't1' }], actor: member, human: true,
    at: `2026-09-23T00:00:${id.padStart(2, '0')}Z`, text: `message ${id}`,
    channel: { source: 'chat', thread: 't1', address: { message: id } }, meta: {},
  }
}

describe('Forge Runner port — fake adapter', () => {
  it('is assignable to the engine Runner type', () => {
    const runner: EngineRunner = createFakeRunner()
    expect(runner.capabilities()).toMatchObject({ steer: true, background: true, resume: true })
  })

  it('strips bash from the coordinator allowlist', () => {
    expect(toolsForRole('coordinator', ['bash', 'read', 'persona_route'])).toEqual(['read', 'persona_route'])
    expect(ROUTER_FORBIDDEN_TOOLS).toEqual(['bash'])
  })

  it('ensureSession + deliver is idempotent on requestId and reports inputTaken', async () => {
    const runner = createFakeRunner()
    const events: string[] = []
    runner.onEvent((event) => { events.push(`${event.type}:${event.requestId ?? ''}`) })
    await runner.ensureSession('worker-t1', 'C:/tmp/t1', 'Fix', 'worker')
    await runner.deliver('worker-t1', 'in-1', 'do it', 'queue')
    await runner.deliver('worker-t1', 'in-1', 'do it again', 'queue')
    expect(runner.delivered).toHaveLength(1)
    expect(runner.status('worker-t1')).toBe('idle')
    expect(events.filter(item => item.startsWith('inputTaken'))).toEqual(['inputTaken:in-1'])
  })

  it('steer / inject stay non-blocking and cancel keeps the inbox when asked', async () => {
    const runner = createFakeRunner({ holdUntilIdle: true })
    await runner.ensureSession('s', 'C:/tmp', 'n', 'worker')
    await runner.deliver('s', 'a', 'one', 'steer')
    await runner.deliver('s', 'b', 'silent', 'inject')
    expect(runner.status('s')).toBe('running')
    const idle = runner.whenIdle('s')
    await runner.cancel('s', { keepInbox: true })
    await idle
    expect(runner.status('s')).toBe('idle')
  })

  it('promotes a slow shell to a background job without blocking deliver', async () => {
    const runner = createFakeRunner({ backgroundAfterMs: 5_000 })
    await runner.ensureSession('s', 'C:/tmp', 'n', 'worker')
    const started = Date.now()
    await runner.deliver('s', 'job-1', 'bash elapsed 6000', 'queue')
    expect(Date.now() - started).toBeLessThan(200)
    expect(runner.background?.running('s')).toEqual(['job-1'])
  })
})

describe('Forge Runner port — DSH adapter', () => {
  function scriptedPort(): { port: DshSessionPort; followups: string[]; cancelled: string[] } {
    const followups: string[] = []
    const cancelled: string[] = []
    const port: DshSessionPort = {
      create: async ({ id }) => {
        let status: 'idle' | 'running' = 'idle'
        const jobs: string[] = []
        const listeners = new Set<(event: { type: string; requestId?: string; elapsedMs?: number; tool?: string }) => void>()
        const session: DshBoundSession = {
          id,
          status: () => status,
          followup: (requestId, text) => {
            followups.push(`${requestId}:${text}`)
            status = 'running'
            for (const listener of listeners) listener({ type: 'inputTaken', requestId })
            if (/elapsed (\d+)/u.exec(text) !== null && Number(/elapsed (\d+)/u.exec(text)![1]) > 5_000) {
              jobs.push(requestId)
              for (const listener of listeners) listener({ type: 'running', requestId, tool: 'bash', elapsedMs: 6_000 })
            }
            status = 'idle'
            for (const listener of listeners) listener({ type: 'idle', requestId })
          },
          steer: (requestId, text) => { session.followup(requestId, text) },
          inject: (requestId, text) => { session.followup(requestId, `inject:${text}`) },
          cancel: async () => { cancelled.push(id); status = 'idle' },
          whenIdle: async () => {},
          onEvent: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
          usage: () => ({ inputTokens: 4, outputTokens: 6 }),
          runningJobs: () => jobs.slice(),
          untilQuiet: async () => { jobs.length = 0 },
          killJob: async () => { jobs.length = 0 },
          stopSubagents: async () => { jobs.length = 0 },
        }
        return session
      },
    }
    return { port, followups, cancelled }
  }

  it('maps followup/steer/inject by request id and records usage', async () => {
    const { port, followups } = scriptedPort()
    const runner = createDshSessionRunner({ agent: port })
    await runner.ensureSession('worker-9', 'C:/tmp/9', 'Ship', 'worker')
    await runner.deliver('worker-9', 'r1', 'hello', 'queue')
    await runner.deliver('worker-9', 'r1', 'hello', 'queue')
    expect(followups).toEqual(['r1:hello'])
    expect(await runner.usage('worker-9')).toEqual({ inputTokens: 4, outputTokens: 6 })
  })

  it('tracks a >5s shell as a background job and cancels the session', async () => {
    const { port, cancelled } = scriptedPort()
    const runner = createDshSessionRunner({ agent: port })
    await runner.ensureSession('s', 'C:/tmp', 'n', 'worker')
    await runner.deliver('s', 'slow', 'bash elapsed 6000', 'queue')
    expect(runner.background?.running('s')).toEqual(['slow'])
    await runner.cancel('s', { keepInbox: false })
    expect(cancelled).toEqual(['s'])
  })
})

describe('Executor conformance (Forge start / deliver / stop)', () => {
  it('starts a worker session when the engine accepts a ticket and stops it on cancel', async () => {
    const runner = createFakeRunner()
    const adapter = createExecutorAdapter({
      runner,
      cwdFor: ticket => `C:/tmp/${ticket.id}`,
    })
    const repo = new MemoryRepositories()
    const requests: Candidate[] = []
    const assessor: Assessor = { request: (candidate) => { requests.push(candidate) } }
    const executor: Executor = {
      start: (ticket, assignment) => { adapter.start(ticket, assignment) },
      deliver: (ticket, assignment) => { adapter.deliver(ticket, assignment) },
      stop: (ticket, assignment, reason) => { adapter.stop(ticket, assignment, reason) },
    }
    const policy: Policy = {
      version: 'v1', paused: false, evalTimeoutMs: 60_000,
      gate: () => ({ admissible: true, strength: 'explicit', basis: { via: 'listed' } }),
      revalidate: () => true,
      admitsInferred: () => true,
    }
    const engine = new Engine({
      repo,
      scope: { scope: () => ({ listened: true, observed: false }) },
      policy: () => policy,
      assessor,
      executor,
      outbox: { send: () => {}, status: () => undefined, withdraw: () => {} },
      now: () => '2026-09-23T00:00:00.000Z',
    })
    engine.receive(trigger('1'))
    engine.evaluateDue()
    const candidate = requests.at(-1)
    if (candidate === undefined) throw new Error('expected assessor request')
    const outcome: Outcome = { kind: 'accept', title: 'Fix', scope: 'small', reason: 'requested', evalId: candidate.evalId }
    engine.decide(candidate.triggers[0]!.id, outcome)
    await vi.waitFor(() => { expect(runner.status(workerSessionId(repo.tickets.list()[0]!.id))).not.toBe('missing') })
    const ticket = repo.tickets.list()[0]!
    expect(runner.session(workerSessionId(ticket.id))?.cwd).toBe(`C:/tmp/${ticket.id}`)
    adapter.stop(ticket, ticket.assignments[0]!, 'test-stop')
    await vi.waitFor(() => { expect(runner.status(workerSessionId(ticket.id))).toBe('idle') })
  })
})
