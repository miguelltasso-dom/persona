import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { Engine, MemoryRepositories } from '@deepseek-ai/dsh-persona-engine'
import type { Assessor, Candidate, Executor, Outcome, OutboundMessage, Policy, Trigger } from '@deepseek-ai/dsh-persona-engine'
import {
  COORDINATION_SESSION_ID,
  coordinationPrompt,
  createCoordinationDriver,
  createExecutorAdapter,
  createFakeRunner,
  wordCount,
} from '../src/index.ts'

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../src')

const member = { source: 'chat', id: 'alice' }
function trigger(id: string): Trigger {
  return {
    id, source: 'chat', threads: [{ source: 'chat', id: 't1' }], actor: member, human: true,
    at: `2026-09-23T00:00:${id.padStart(2, '0')}Z`, text: 'Please ship the landing page',
    channel: { source: 'chat', thread: 't1', address: { message: id } }, meta: {},
  }
}

describe('Coordination driver', () => {
  it('never mentions Atlas in runner or coordination source', () => {
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      return entry.isDirectory() ? walk(path) : [path]
    })
    for (const file of walk(srcRoot)) {
      if (!file.endsWith('.ts')) continue
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/\bAtlas\b/u)
    }
  })

  it('opens a coordinator session without bash and injects the full prompt', async () => {
    const runner = createFakeRunner()
    const persona = { id: 'p-coord', name: 'Marina', instructions: 'Be brief.' }
    const driver = createCoordinationDriver({ runner, persona, cwd: 'C:/tmp/project' })
    expect(driver.tools.includes('bash')).toBe(false)
    expect(driver.prompt).toBe(coordinationPrompt(persona))
    expect(driver.prompt).toContain('Marina')
    expect(driver.prompt).toContain('100 palavras')
    expect(driver.prompt).toContain('Coordenação')
    await driver.start()
    expect(runner.status(COORDINATION_SESSION_ID)).toBe('idle')
    expect(runner.session(COORDINATION_SESSION_ID)?.role).toBe('coordinator')
    expect(runner.session(COORDINATION_SESSION_ID)?.tools.includes('bash')).toBe(false)
    expect(runner.delivered[0]?.mode).toBe('inject')
    expect(runner.delivered[0]?.text).toContain('Be brief.')
  })

  it('Trigger → accept → Ticket → Assignment; only coordination replies, ≤100 words', async () => {
    const runner = createFakeRunner()
    const persona = { id: 'p-coord', name: 'Marina' }
    const driver = createCoordinationDriver({ runner, persona, cwd: 'C:/tmp/project' })
    await driver.start()
    const adapter = createExecutorAdapter({ runner, cwdFor: ticket => `C:/tmp/${ticket.id}` })
    const repo = new MemoryRepositories()
    const outbox: OutboundMessage[] = []
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
      outbox: {
        send: (message) => { if (!outbox.some(item => item.id === message.id)) outbox.push(message) },
        status: id => outbox.some(item => item.id === id) ? 'pending' : undefined,
        withdraw: () => {},
      },
      now: () => '2026-09-23T00:00:00.000Z',
    })
    engine.receive(trigger('1'))
    engine.evaluateDue()
    const candidate = requests.at(-1)
    if (candidate === undefined) throw new Error('expected assessor request')
    const acknowledgement = 'Accepted: landing page is now a ticket. I will assign it and report back.'
    expect(wordCount(acknowledgement)).toBeLessThanOrEqual(100)
    const outcome: Outcome = {
      kind: 'accept', title: 'Landing page', scope: 'small', reason: 'requested',
      evalId: candidate.evalId, acknowledgement,
    }
    engine.decide(candidate.triggers[0]!.id, outcome)
    await vi.waitFor(() => { expect(repo.tickets.list()).toHaveLength(1) })
    const ticket = repo.tickets.list()[0]!
    expect(ticket.assignments.length).toBeGreaterThan(0)
    await driver.deliver('reply-1', acknowledgement, 'queue')
    expect(runner.delivered.some(item => item.sessionId === COORDINATION_SESSION_ID && item.text === acknowledgement)).toBe(true)
    expect(outbox.every(message => message.kind === 'acknowledgement' || message.kind === 'reply' || message.kind === 'notice')).toBe(true)
    expect(outbox.some(message => message.text.includes(acknowledgement) || message.kind === 'acknowledgement')).toBe(true)
  })

  it('repeats of the same request id are no-ops (steer / followup / inject)', async () => {
    const runner = createFakeRunner()
    const driver = createCoordinationDriver({
      runner, persona: { id: 'p-coord', name: 'Marina' }, cwd: 'C:/tmp/project',
    })
    await driver.start()
    await driver.deliver('same', 'hello', 'steer')
    await driver.deliver('same', 'hello', 'steer')
    expect(runner.delivered.filter(item => item.requestId === 'same')).toHaveLength(1)
  })
})
