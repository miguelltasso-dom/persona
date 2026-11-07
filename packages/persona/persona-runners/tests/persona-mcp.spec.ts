import { describe, expect, it } from 'vitest'
import { Engine, MemoryRepositories } from '@deepseek-ai/dsh-persona-engine'
import type { Assessor, Candidate, Executor, Outcome, Policy, Trigger } from '@deepseek-ai/dsh-persona-engine'
import { personaMcpTools, servePersonaMcpTools, toWorkerReport } from '../src/index.ts'

const member = { source: 'chat', id: 'alice' }
function trigger(id: string): Trigger {
  return {
    id, source: 'chat', threads: [{ source: 'chat', id: 't1' }], actor: member, human: true,
    at: `2026-09-23T00:00:${id.padStart(2, '0')}Z`, text: `message ${id}`,
    channel: { source: 'chat', thread: 't1', address: { message: id } }, meta: {},
  }
}

describe('Persona MCP tools (D3)', () => {
  it('passes explicitly supplied report facts to the host without inventing audience or origin', async () => {
    const calls: Array<{ facts?: unknown }> = []
    const tools = personaMcpTools(
      { personaId: 'p1', ticketId: 't1', assignmentId: 'a1' },
      { report: (input) => { calls.push(input) }, recall: () => '', ask: () => {} },
    )
    const report = tools.find(tool => tool.name === 'persona_report')!
    const facts = [{ kind: 'decision', title: 'Escolha', body: 'Cor lilás', evidence: 'Cor lilás' }]
    await report.handler({ summary: 'Cor lilás', facts })
    await report.handler({ summary: 'sem fatos' })
    await report.handler({ summary: 'vazio', facts: [] })
    expect(calls[0]?.facts).toEqual(facts)
    expect(Object.hasOwn(calls[1]!, 'facts')).toBe(false)
    expect(calls[2]?.facts).toEqual([])
    expect(report.inputSchema.properties).toHaveProperty('facts')
    const event = { type: 'ended' as const, at: 'now', report: { state: 'ready' as const, summary: 'Cor lilás', facts } }
    expect(toWorkerReport(event).facts).toEqual(facts)
  })

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

  it('persona_ask carries the structured form untouched, the assumption, and hands the host sentence back to the model', async () => {
    const seen: Array<{ question: string; questions?: unknown; assumption?: string }> = []
    const tools = personaMcpTools(
      { personaId: 'p1', ticketId: 't1', assignmentId: 'a1' },
      { report: () => {}, recall: () => '', ask: (input) => { seen.push(input); return input.assumption === undefined ? undefined : 'Registrei a suposição.' } },
    )
    const ask = tools.find(tool => tool.name === 'persona_ask')!
    // plain, as before
    expect((await ask.handler({ question: 'Qual pasta?' })).content).toBe('asked')
    expect(Object.hasOwn(seen[0]!, 'questions')).toBe(false)
    // one question with options (the model's own words; the host validates)
    await ask.handler({ question: 'Qual canal?', options: ['Email', 'WhatsApp'], multiple: true })
    expect(seen[1]).toEqual({ run: expect.anything(), question: 'Qual canal?', questions: { question: 'Qual canal?', options: ['Email', 'WhatsApp'], multiple: true } })
    // a sequence
    const questions = [{ question: 'A?', options: ['x', 'y'] }, { question: 'B?' }]
    await ask.handler({ questions })
    expect(seen[2]?.questions).toEqual(questions)
    // an assumption comes back as the host's sentence
    expect((await ask.handler({ assumption: 'Vou usar a pasta padrão.' })).content).toBe('Registrei a suposição.')
    expect(seen[3]?.assumption).toBe('Vou usar a pasta padrão.')
    // the schema advertises the structured fields and stays open for the rest
    expect(ask.inputSchema.properties).toMatchObject({ question: {}, options: {}, multiple: {}, questions: {}, assumption: {} })
    // a forged identity is still refused
    expect((await ask.handler({ ticketId: 'forged', question: 'x' })).content).toBe('forged actor refused')
  })

  it('advertises only tools at or below the persona grant', () => {
    const hooks = { report: () => {}, recall: () => '', ask: () => {} }
    const run = { personaId: 'p1', ticketId: 't1', assignmentId: 'a1' }
    expect(personaMcpTools(run, hooks, 'none').map(tool => tool.name)).toEqual([])
    expect(personaMcpTools(run, hooks, 'read').map(tool => tool.name)).toEqual(['persona_recall', 'persona_ask'])
    expect(personaMcpTools(run, hooks, 'write').map(tool => tool.name)).toEqual([
      'persona_report', 'persona_recall', 'persona_ask',
    ])
  })
})
