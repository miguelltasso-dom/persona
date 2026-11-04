import { describe, expect, it } from 'vitest'
import type { Event, Session } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import {
  PRECISA_DE_VOCE,
  assertCliNeverPrompt,
  cliPermissionOf,
  cliPolicyOf,
  createClaudeRunner,
  isPermissionAsk,
  resolveRunner,
  type RunEvent,
  type StartTurnInput,
} from '../src/index.ts'

const input: StartTurnInput = {
  ticketId: 't',
  assignmentId: 'a',
  personaId: 'nina',
  cwd: 'C:/tmp/worktree',
  prompt: 'hi',
  model: 'haiku',
  permissionMode: 'deny',
}

async function collect(events: AsyncIterable<RunEvent>, limitMs = 1_500): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  const started = Date.now()
  for await (const event of events) {
    out.push(event)
    if (event.type === 'ended') break
    if (Date.now() - started > limitMs) break
  }
  return out
}

describe('cliPolicyOf', () => {
  it('never maps to prompt and throws when asked', () => {
    expect(() => { assertCliNeverPrompt('prompt') }).toThrow(/não aceita modo prompt/u)
    expect(cliPermissionOf('talk', { files: 'write' })).toBe('deny')
    expect(cliPermissionOf('task', { files: 'write' })).toBe('allow-once')
    expect(cliPermissionOf('task', { files: 'read' })).toBe('deny')
  })

  it('claude talk/deny disables skip-permissions and write tools', () => {
    const deny = cliPolicyOf('claude', {}, 'deny')
    expect(deny.launchArgs).toEqual(['--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--tools', ''])
    expect(deny.disallowedTools).toEqual(expect.arrayContaining(['Bash', 'Edit', 'Write', 'WebFetch']))
    const task = cliPolicyOf('claude', { files: 'write', shell: 'none' }, 'allow-once')
    expect(task.launchArgs).toEqual(['--permission-mode', 'acceptEdits'])
    expect(task.disallowedTools).toContain('Bash')
    expect(task.disallowedTools).not.toContain('Write')
  })

  it('codex pins sandbox; cursor never gets launchArgs; opencode has no denylist', () => {
    expect(cliPolicyOf('codex', {}, 'deny').sandbox).toBe('read-only')
    expect(cliPolicyOf('codex', { files: 'write' }, 'allow-once').sandbox).toBe('workspace-write')
    expect(cliPolicyOf('cursor', { files: 'read' }, 'deny').launchArgs).toEqual([])
    expect(cliPolicyOf('cursor', { files: 'read' }, 'deny').disallowedTools).toEqual(
      expect.arrayContaining(['Write', 'Bash']),
    )
    expect(cliPolicyOf('opencode', { files: 'write' }, 'allow-once').disallowedTools).toEqual([])
    expect(cliPolicyOf('opencode', { files: 'write' }, 'allow-once').launchArgs).toEqual([])
  })

  it('classifies runtime→app permission asks', () => {
    expect(isPermissionAsk({ kind: 'app_request', type: 'can_use_tool' })).toBe(true)
    expect(isPermissionAsk({ kind: 'text_delta' })).toBe(false)
    expect(isPermissionAsk({ kind: 'tool_call_started' })).toBe(false)
  })
})

describe('CLI permission ask never hangs', () => {
  it('ends blocked with Precisa de você when the runtime asks for approval', async () => {
    const inner = scriptedRuntime({ turn: () => undefined })
    const runtime = {
      ...inner,
      session: async () => {
        const session = await inner.session(
          { kind: 'available', via: 'bundled' },
          { cwd: input.cwd },
        )
        return {
          ...session,
          events: (listener: (event: Event) => void) => {
            listener({ kind: 'app_request', type: 'can_use_tool', requestId: 'permission-1' } as Event)
            return () => undefined
          },
          prompt: async () => new Promise<never>(() => undefined),
          records: () => [{
            kind: 'request', id: 'permission-1', direction: 'toApp',
            sessionId: session.id, agentPath: [], seq: 0, receivedAt: 0,
            body: { kind: 'native', type: 'can_use_tool', native: {
              request: { tool_name: 'Read', input: { file_path: 'DO_NOT_LOG_THIS_SECRET' } },
            } },
          }],
        } as Session
      },
    }
    const runner = createClaudeRunner({ runtime })
    const handle = await runner.start(input)
    const events = await collect(runner.stream(handle))
    expect(events.some(event => event.type === 'delta')).toBe(false)
    expect(events.at(-1)).toMatchObject({
      type: 'ended',
      report: {
        state: 'blocked',
        summary: 'Pedido de permissão recusado (Read).',
        question: `${PRECISA_DE_VOCE} Ação: Read.`,
      },
    })
    expect(JSON.stringify(events)).not.toContain('DO_NOT_LOG_THIS_SECRET')
  })

  it('resolveRunner refuses prompt on a CLI spec', async () => {
    await expect(resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'prompt',
      runtime: scriptedRuntime({ turn: (turn) => { turn.say('nope') } }),
      infra: { wait: async () => undefined },
    })).rejects.toThrow(/não aceita modo prompt/u)
  })
})
