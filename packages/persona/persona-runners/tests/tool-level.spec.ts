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
