import { afterEach, describe, expect, it } from 'vitest'
import {
  allowsTool,
  classifyToolAccess,
  createDshRunner,
  disposeRunnerSessions,
  effectiveToolLevel,
  resolveRunner,
  withToolLevel,
  type DshAgentPort,
  type RunEvent,
} from '../src/index.ts'

afterEach(async () => {
  await disposeRunnerSessions()
})

const input = {
  ticketId: 't',
  assignmentId: 'a',
  personaId: 'nina',
  cwd: 'C:/tmp',
  prompt: 'hi',
  model: 'haiku',
  permissionMode: 'deny' as const,
}

function agentThatCalls(name: string): DshAgentPort {
  return {
    start: async () => ({
      sessionId: 's1',
      events: (async function *() {
        yield { type: 'tool' as const, name }
        yield { type: 'ended' as const, text: 'did it' }
      })(),
    }),
    resume: async () => ({
      sessionId: 's1',
      events: (async function *() {
        yield { type: 'ended' as const, text: 'ok' }
      })(),
    }),
    cancel: async () => undefined,
    usage: async () => ({ inputTokens: 1, outputTokens: 1 }),
  }
}

async function collect(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

describe('tool level classifier', () => {
  it('ranks none < read < write', () => {
    expect(classifyToolAccess('read')).toBe('read')
    expect(classifyToolAccess('persona_recall')).toBe('read')
    expect(classifyToolAccess('bash')).toBe('write')
    expect(classifyToolAccess('write')).toBe('write')
    expect(classifyToolAccess('persona_report')).toBe('write')
    expect(classifyToolAccess('persona_browser_read')).toBe('read')
    expect(classifyToolAccess('persona_computer_screenshot')).toBe('read')
    expect(classifyToolAccess('persona_browser_act')).toBe('write')
    expect(classifyToolAccess('persona_computer_click')).toBe('write')
    expect(classifyToolAccess('persona_telegram_send')).toBe('write')
    expect(classifyToolAccess('brain_search')).toBe('read')
    // the CLI's own schema lookup (deferred MCP tools): a read, any case; a tool it merely looks like is still unknown = write
    expect(classifyToolAccess('ToolSearch')).toBe('read')
    expect(classifyToolAccess('toolsearch')).toBe('read')
    expect(classifyToolAccess('ToolSearchAndRun')).toBe('write')
    expect(classifyToolAccess('Tool')).toBe('write')
    expect(classifyToolAccess('brain_read')).toBe('read')
    expect(classifyToolAccess('brain_propose')).toBe('write')
    expect(classifyToolAccess('gestor_hire')).toBe('write')
    expect(classifyToolAccess('gestor_assemble')).toBe('write')
    expect(allowsTool('none', 'read')).toBe(false)
    expect(allowsTool('read', 'read')).toBe(true)
    expect(allowsTool('read', 'bash')).toBe(false)
    expect(allowsTool('write', 'bash')).toBe(true)
    expect(effectiveToolLevel({})).toBe('none')
    expect(effectiveToolLevel({ read: 'read', bash: 'none' })).toBe('read')
    expect(effectiveToolLevel({ read: 'read', bash: 'write' })).toBe('write')
  })
})

describe('withToolLevel', () => {
  it('blocks a write tool when the runner is none or read', async () => {
    const inner = createDshRunner({ agent: agentThatCalls('bash'), infra: { wait: async () => undefined } })
    for (const level of ['none', 'read'] as const) {
      const runner = withToolLevel(inner, level)
      const handle = await runner.start(input)
      const events = await collect(runner.stream(handle))
      expect(events.some(event => event.type === 'ended' && event.report.state === 'blocked')).toBe(true)
      expect(events.at(-1)).toMatchObject({
        type: 'ended',
        report: { state: 'blocked', summary: `Ferramenta bash recusada no nível ${level}.` },
      })
    }
  })

  it('allows a read tool at read and a write tool at write', async () => {
    const readRunner = withToolLevel(
      createDshRunner({ agent: agentThatCalls('read'), infra: { wait: async () => undefined } }),
      'read',
    )
    const readHandle = await readRunner.start(input)
    const readEvents = await collect(readRunner.stream(readHandle))
    expect(readEvents.some(event => event.type === 'report' && event.report.summary === 'tool:read')).toBe(true)
    expect(readEvents.at(-1)).toMatchObject({ type: 'ended', report: { state: 'ready' } })

    const writeRunner = withToolLevel(
      createDshRunner({ agent: agentThatCalls('bash'), infra: { wait: async () => undefined } }),
      'write',
    )
    const writeHandle = await writeRunner.start(input)
    const writeEvents = await collect(writeRunner.stream(writeHandle))
    expect(writeEvents.at(-1)).toMatchObject({ type: 'ended', report: { state: 'ready' } })
  })

  it('GUARD (OPT-10b): a read persona is NOT stopped at the CLI ToolSearch; the turn goes on past it to the next read tool, and at none it still stops', async () => {
    // The CLI defers the schemas of a connector with many tools, so the model must call ToolSearch BEFORE the connector. If ToolSearch were "unknown = write" a read persona
    // would end 'blocked' there ("Ferramenta ToolSearch recusada no nível read") and no connector read could ever happen.
    const agentThatCallsInOrder = (names: readonly string[]): DshAgentPort => ({
      start: async () => ({
        sessionId: 's1',
        events: (async function *() {
          for (const name of names) yield { type: 'tool' as const, name }
          yield { type: 'ended' as const, text: 'did it' }
        })(),
      }),
      resume: async () => ({ sessionId: 's1', events: (async function *() { yield { type: 'ended' as const, text: 'ok' } })() }),
      cancel: async () => undefined,
      usage: async () => ({ inputTokens: 1, outputTokens: 1 }),
    })
    const seen = (events: RunEvent[]) => events.filter(event => event.type === 'report').map(event => (event as Extract<RunEvent, { type: 'report' }>).report.summary)
    const readRunner = withToolLevel(createDshRunner({ agent: agentThatCallsInOrder(['ToolSearch', 'read']), infra: { wait: async () => undefined } }), 'read')
    const events = await collect(readRunner.stream(await readRunner.start(input)))
    expect(events.at(-1)).toMatchObject({ type: 'ended', report: { state: 'ready' } })
    expect(seen(events)).toEqual(['tool:ToolSearch', 'tool:read'])
    // a tool that only LOOKS like it is still refused at read (unknown = write)
    const lookalike = withToolLevel(createDshRunner({ agent: agentThatCallsInOrder(['ToolSearchAndRun']), infra: { wait: async () => undefined } }), 'read')
    expect((await collect(lookalike.stream(await lookalike.start(input)))).at(-1)).toMatchObject({ type: 'ended', report: { state: 'blocked', summary: 'Ferramenta ToolSearchAndRun recusada no nível read.' } })
    // and with no tools granted at all, nothing passes, ToolSearch included
    const none = withToolLevel(createDshRunner({ agent: agentThatCallsInOrder(['ToolSearch']), infra: { wait: async () => undefined } }), 'none')
    expect((await collect(none.stream(await none.start(input)))).at(-1)).toMatchObject({ type: 'ended', report: { state: 'blocked', summary: 'Ferramenta ToolSearch recusada no nível none.' } })
  })

  it('HT-0: exempts exactly the product tools THIS turn was offered, and nothing else', async () => {
    const offeredSet = (name: string) => ({
      tools: [{ name, description: 'x', inputSchema: { type: 'object' }, handler: async () => ({ content: 'ok' }) }],
    })
    for (const level of ['none', 'read'] as const) {
      // offered by the turn: passes (the gateway lease, not the native grant, decides it)
      const offered = withToolLevel(createDshRunner({ agent: agentThatCalls('mcp__persona__persona_report'), infra: { wait: async () => undefined } }), level)
      const ok = await collect(offered.stream(await offered.start({ ...input, mcpTools: offeredSet('persona_report') })))
      expect(ok.at(-1)).toMatchObject({ type: 'ended', report: { state: 'ready' } })
      // same name, turn offered nothing: refused
      const bare = withToolLevel(createDshRunner({ agent: agentThatCalls('mcp__persona__persona_report'), infra: { wait: async () => undefined } }), level)
      const refused = await collect(bare.stream(await bare.start(input)))
      expect(refused.at(-1)).toMatchObject({ type: 'ended', report: { state: 'blocked' } })
      // a different tool than the one offered: refused
      const other = withToolLevel(createDshRunner({ agent: agentThatCalls('mcp__persona__persona_ask'), infra: { wait: async () => undefined } }), level)
      const wrong = await collect(other.stream(await other.start({ ...input, mcpTools: offeredSet('persona_report') })))
      expect(wrong.at(-1)).toMatchObject({ type: 'ended', report: { state: 'blocked' } })
      // a native tool is never exempted by the offer
      const native = withToolLevel(createDshRunner({ agent: agentThatCalls('bash'), infra: { wait: async () => undefined } }), level)
      const bash = await collect(native.stream(await native.start({ ...input, mcpTools: offeredSet('persona_report') })))
      expect(bash.at(-1)).toMatchObject({ type: 'ended', report: { state: 'blocked', summary: `Ferramenta bash recusada no nível ${level}.` } })
    }
  })

  it('resolveRunner reduces a persona tools map to the highest grant', async () => {
    const runner = await resolveRunner({
      spec: { kind: 'dsh', model: 'default' },
      permissionMode: 'deny',
      tools: { files: 'read', recall: 'read' },
      agent: agentThatCalls('bash'),
      infra: { wait: async () => undefined },
    })
    const handle = await runner.start(input)
    const events = await collect(runner.stream(handle))
    expect(events.at(-1)).toMatchObject({
      type: 'ended',
      report: { state: 'blocked', summary: 'Ferramenta bash recusada no nível read.' },
    })
  })

  it('resolveRunner applies toolLevel none', async () => {
    const runner = await resolveRunner({
      spec: { kind: 'dsh', model: 'default' },
      permissionMode: 'deny',
      toolLevel: 'none',
      agent: agentThatCalls('read'),
      infra: { wait: async () => undefined },
    })
    const handle = await runner.start(input)
    const events = await collect(runner.stream(handle))
    expect(events.at(-1)).toMatchObject({
      type: 'ended',
      report: { state: 'blocked', summary: 'Ferramenta read recusada no nível none.' },
    })
  })
})
