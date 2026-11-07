/**
 * OPT-10b: the tap that lets a measurement round see that a connector really answered, without touching the adapter. Proven on OAR's scripted runtime
 * (which emits the same `tool_call_started` / `tool_call_ended` events a real CLI does) through the real Claude runner.
 */
import { scriptedRuntime } from '@botiverse/oar/testing'
import { describe, expect, it } from 'vitest'
import { createClaudeRunner, type RunEvent, type StartTurnInput } from '../src/index.ts'
import { CLI_PLUMBING_TOOLS, ToolObserver, callsForCriterion, observeRuntime } from '../src/oar/tool-observer.ts'

const CAL = 'mcp__claude_ai_Google_Calendar__list_events'
const MAIL_SEND = 'mcp__claude_ai_Gmail__send_message'

const input = (): StartTurnInput => ({ ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp/c', prompt: 'Qual o meu próximo compromisso?', model: 'haiku', permissionMode: 'deny' })

async function run(script: (turn: { tool: (name: string, input: string, run?: () => unknown) => Promise<void>; say: (text: string) => void }) => void | Promise<void>, observer: ToolObserver): Promise<RunEvent[]> {
  const runner = createClaudeRunner({ runtime: observeRuntime(scriptedRuntime({ id: 'fake-cli', turn: async (turn) => { await script(turn) } }), observer) })
  const handle = await runner.start(input())
  const events: RunEvent[] = []
  for await (const event of runner.stream(handle)) events.push(event)
  await runner.dispose?.()
  return events
}

describe('the observer sees the tool calls of a real runner turn, and the turn is untouched', () => {
  it('a connector call that answered: server, tool, class, ok — and the answer is the persona\'s, unchanged', async () => {
    const observer = new ToolObserver()
    const events = await run(async (turn) => {
      await turn.tool(CAL, '{"calendarId":"primary"}', () => 'Reunião de planejamento, 14:00')
      turn.say('Seu próximo compromisso é a reunião de planejamento às 14h.')
    }, observer)
    expect(events.at(-1)).toMatchObject({ type: 'ended', report: { state: 'ready' } })
    expect(events.filter(event => event.type === 'delta').map(event => event.type === 'delta' ? event.text : '').join('')).toContain('reunião de planejamento')
    expect(observer.report()).toEqual([{ tool: CAL, server: 'claude_ai_Google_Calendar', name: 'list_events', actionClass: 'send', ok: true, ended: true, sensitive: false }])
  })

  it('classifies by the pre-flight: with the server\'s readOnly proof the call is a read, without it it fails closed as a send', async () => {
    const proven = new ToolObserver(tool => (tool === CAL ? { readOnlyHint: true } : undefined))
    await run(async (turn) => { await turn.tool(CAL, '{}', () => 'x') }, proven)
    expect(proven.report()[0]?.actionClass).toBe('read')
  })

  it('a call that failed is ok:false; a write is classed as a write; two servers are told apart', async () => {
    const observer = new ToolObserver()
    await run(async (turn) => {
      await turn.tool(CAL, '{}', () => 'agenda').catch(() => undefined)
      await turn.tool(MAIL_SEND, '{"to":"x"}', () => { throw new Error('denied by policy') }).catch(() => undefined)
    }, observer)
    const rows = observer.report()
    expect(rows.map(row => [row.server, row.name, row.actionClass, row.ok])).toEqual([
      ['claude_ai_Google_Calendar', 'list_events', 'send', true],
      ['claude_ai_Gmail', 'send_message', 'send', false],
    ])
  })

  it('a tool the host calls sensitive is SEEN but its result never stays in memory (nothing to compare, nothing to leak)', async () => {
    const observer = new ToolObserver(undefined, tool => tool.includes('get_message'))
    await run(async (turn) => {
      await turn.tool('mcp__claude_ai_Gmail__get_message', '{"id":"1"}', () => 'Assunto: segredo de família')
      await turn.tool('mcp__claude_ai_Gmail__list_labels', '{}', () => 'INBOX, SENT, Contas')
    }, observer)
    expect(observer.report().map(row => [row.name, row.sensitive, row.ok])).toEqual([['get_message', true, true], ['list_labels', false, true]])
    expect(observer.anyResult('claude_ai_Gmail', text => text.includes('segredo'))).toBe(false)
    expect(observer.anyResult('claude_ai_Gmail', text => text.includes('Contas'))).toBe(true)
  })

  it('the one question of the results is a boolean, asked in memory; the report carries no result and no argument', async () => {
    const observer = new ToolObserver()
    await run(async (turn) => { await turn.tool(CAL, '{"q":"segredo-de-argumento"}', () => 'Dentista às 9h com a doutora Helena') }, observer)
    expect(observer.anyResult('claude_ai_Google_Calendar', text => text.includes('Helena'))).toBe(true)
    expect(observer.anyResult('claude_ai_Google_Calendar', text => text.includes('inexistente'))).toBe(false)
    expect(observer.anyResult('claude_ai_Gmail', () => true)).toBe(false) // another server's results are not asked about
    const shown = JSON.stringify(observer.report())
    expect(shown).not.toMatch(/Helena|Dentista|segredo-de-argumento/u)
  })

  it('a turn with no tool call reports none; reset forgets; a non-tool event or junk is ignored', async () => {
    const observer = new ToolObserver()
    await run((turn) => { turn.say('Não há compromissos.') }, observer)
    expect(observer.report()).toEqual([])
    observer.tap(null)
    observer.tap({ kind: 'text_delta', text: 'x' })
    observer.tap({ kind: 'tool_call_ended', callId: 'sem-inicio' })
    expect(observer.report()).toEqual([])
    await run(async (turn) => { await turn.tool(CAL, '{}', () => 'a') }, observer)
    expect(observer.report()).toHaveLength(1)
    observer.reset()
    expect(observer.report()).toEqual([])
  })

  it('built-in tools are reported as builtin', () => {
    const observer = new ToolObserver()
    observer.tap({ kind: 'tool_call_started', callId: 'c1', tool: 'Bash' })
    observer.tap({ kind: 'tool_call_ended', callId: 'c1', result: 'ok', content: [{ type: 'text', text: 'ok' }] })
    expect(observer.report()).toEqual([{ tool: 'Bash', server: 'builtin', name: 'Bash', actionClass: 'send', ok: true, ended: true, sensitive: false }])
  })
})

describe('callsForCriterion: the CLI\'s own schema lookup is plumbing, not a call the task makes', () => {
  const run = async (script: Parameters<typeof run0>[0]): Promise<ToolObserver> => {
    const observer = new ToolObserver()
    await run0(script, observer)
    return observer
  }
  const run0 = async (script: (turn: { tool: (name: string, input: string, run?: () => unknown) => Promise<void>; say: (text: string) => void }) => void | Promise<void>, observer: ToolObserver): Promise<void> => {
    const runner = createClaudeRunner({ runtime: observeRuntime(scriptedRuntime({ id: 'fake-cli', turn: async (turn) => { await script(turn) } }), observer) })
    const handle = await runner.start(input())
    for await (const event of runner.stream(handle)) void event
    await runner.dispose?.()
  }

  it('ToolSearch is left out of the calls but counts as a request; the connector call stays; a built-in like Bash is still a call', async () => {
    expect(CLI_PLUMBING_TOOLS.has('ToolSearch')).toBe(true)
    const observer = await run(async (turn) => {
      await turn.tool('ToolSearch', '{"query":"select:mcp__fixture_mail__list_labels"}', () => 'schema')
      await turn.tool('mcp__fixture_mail__list_labels', '{}', () => 'INBOX')
      await turn.tool('Bash', '{"command":"ls"}', () => 'x')
    })
    const seen = callsForCriterion(observer.report(), new Set())
    expect(seen.calls.map(call => [call.server, call.name])).toEqual([['fixture_mail', 'list_labels'], ['builtin', 'Bash']])
    expect(seen.requests).toBe(4) // three calls, each followed by one more request, plus the first
  })

  it('a call the gate refused is marked denied (by its full name); nothing else changes', () => {
    const report = [
      { tool: 'mcp__fixture_mail__send_message', server: 'fixture_mail', name: 'send_message', actionClass: 'send' as const, ok: undefined, ended: true, sensitive: false },
      { tool: 'mcp__fixture_mail__list_labels', server: 'fixture_mail', name: 'list_labels', actionClass: 'read' as const, ok: true, ended: true, sensitive: false },
    ]
    const seen = callsForCriterion(report, new Set(['mcp__fixture_mail__send_message']))
    expect(seen.calls.map(call => [call.name, call.denied])).toEqual([['send_message', true], ['list_labels', false]])
    expect(callsForCriterion([], new Set())).toEqual({ calls: [], requests: 1 })
  })
})
