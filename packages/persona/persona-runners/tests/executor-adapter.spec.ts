import { describe, expect, it, vi } from 'vitest'
import { Engine, MemoryRepositories } from '@deepseek-ai/dsh-persona-engine'
import type { Assessor, Candidate, Executor, Outcome, Policy, Trigger } from '@deepseek-ai/dsh-persona-engine'
import { createExecutorAdapter, createFakeRunner, workerSessionId } from '../src/index.ts'

const member = { source: 'chat', id: 'alice' }
function trigger(id: string): Trigger {
  return {
    id, source: 'chat', threads: [{ source: 'chat', id: 't1' }], actor: member, human: true,
    at: `2026-09-23T00:00:${id.padStart(2, '0')}Z`, text: `message ${id}`,
    channel: { source: 'chat', thread: 't1', address: { message: id } }, meta: {},
  }
}

describe('Executor adapter over the session Runner port', () => {
  it('starts a run when the engine accepts a ticket and cancels it on stop', async () => {
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
    await vi.waitFor(() => { expect(runner.delivered.length).toBeGreaterThan(0) })
    const ticket = repo.tickets.list()[0]!
    expect(runner.session(workerSessionId(ticket.id))?.cwd).toBe(`C:/tmp/${ticket.id}`)
    adapter.stop(ticket, ticket.assignments[0]!, 'test-stop')
    await vi.waitFor(() => { expect(runner.status(workerSessionId(ticket.id))).toBe('idle') })
  })
})
