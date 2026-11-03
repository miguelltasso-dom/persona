import { describe, expect, it } from 'vitest'
import { Engine, MemoryRepositories } from '@deepseek-ai/dsh-persona-engine'
import type { Assessor, Candidate, Executor, Outcome, Policy, Trigger } from '@deepseek-ai/dsh-persona-engine'
import { personaMcpTools, servePersonaMcpTools } from '../src/index.ts'

const member = { source: 'chat', id: 'alice' }
function trigger(id: string): Trigger {
  return {
    id, source: 'chat', threads: [{ source: 'chat', id: 't1' }], actor: member, human: true,
    at: `2026-09-23T00:00:${id.padStart(2, '0')}Z`, text: `message ${id}`,
    channel: { source: 'chat', thread: 't1', address: { message: id } }, meta: {},
  }
}

describe('Persona MCP tools (D3)', () => {
  it('uses the run identity, refuses a forged actor, and reports onto the ticket', async () => {
    const repo = new MemoryRepositories()
    const requests: Candidate[] = []
    const assessor: Assessor = { request: (candidate) => { requests.push(candidate) } }
    const executor: Executor = { start: () => {}, deliver: () => {}, stop: () => {} }
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
    const candidate = requests.at(-1)!
    const outcome: Outcome = { kind: 'accept', title: 'Fix', scope: 'small', reason: 'requested', evalId: candidate.evalId }
    engine.decide(candidate.triggers[0]!.id, outcome)
    const ticket = repo.tickets.list()[0]!
    engine.assignmentStarted(ticket.id, ticket.assignments[0]!.id)
    const run = { personaId: 'p-nina', ticketId: ticket.id, assignmentId: ticket.assignments[0]!.id }
    const served = await servePersonaMcpTools(
      async input => ({ mcpServers: { persona: input.name }, close: async () => {} }),
      run,
      {
        report: ({ run: identity, state, summary }) => {
          engine.report(identity.ticketId, { state: state === 'ready' ? 'ready' : 'progress', summary })
        },
        recall: ({ query }) => `memory:${query}`,
        ask: () => {},
      },
    )
    const report = served.tools.find(tool => tool.name === 'persona_report')!
    const forged = await report.handler({ personaId: 'intruder', summary: 'nope', state: 'ready' })
    expect(forged.content).toBe('forged actor refused')
    const ok = await report.handler({ summary: 'landing drafted', state: 'ready' })
    expect(ok.content).toBe('reported')
    expect(repo.tickets.get(ticket.id)?.assignments[0]?.report?.summary).toBe('landing drafted')
    const recall = served.tools.find(tool => tool.name === 'persona_recall')!
    expect((await recall.handler({ query: 'tone' })).content).toBe('memory:tone')
  })

  it('personaMcpTools ignores a forged ticketId in the arguments', async () => {
    const tools = personaMcpTools(
      { personaId: 'p1', ticketId: 't-real', assignmentId: 'a1' },
      { report: () => {}, recall: () => '', ask: () => {} },
    )
    const report = tools.find(tool => tool.name === 'persona_report')!
    expect((await report.handler({ ticketId: 't-forged', summary: 'x' })).content).toBe('forged actor refused')
  })
})
