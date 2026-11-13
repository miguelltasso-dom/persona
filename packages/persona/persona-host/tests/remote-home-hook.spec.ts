import { describe, expect, it, vi } from 'vitest'
import type { PersonaRunnerSpec, TurnRunner } from '@deepseek-ai/dsh-persona-runners'
import { createRemoteRunnerOf, isRemoteDmPrivateError, RemoteDmPrivateError } from '../src/computers/remote-home-hook.ts'
import type { ExecutorSpec } from '../src/computers/executor-protocol.ts'

/**
 * D-116 executor, the hook where the orchestration picks the runner of a persona whose home is another computer (Keel 20:52, Lumen's gate): A's turn in B NEVER carries a private DM. The decision is on A and
 * fails closed: a conversation that is a DM, or one A cannot tell, is refused in the person's own words before anything is sent; a channel conversation goes to the persona's home.
 */
const REMOTE = new Set(['nina'])
const runner = { tag: 'runner-de-B' } as unknown as TurnRunner

function rig(over: { conversation?: 'channel' | 'dm' | undefined; built?: boolean } = {}) {
  const runnerFor = vi.fn((_personaId: string, _spec?: ExecutorSpec) => runner)
  const conversationOf = vi.fn((_projectId: string, _ticketId: string) => (over.conversation === undefined ? undefined : { streamKind: over.conversation }))
  const hook = createRemoteRunnerOf({
    turns: () => (over.built === false ? undefined : { isRemote: personaId => REMOTE.has(personaId), runnerFor }),
    conversationOf,
  })
  return { hook, runnerFor, conversationOf }
}
const dsh: PersonaRunnerSpec = { kind: 'dsh', model: 'm' }
const claude: PersonaRunnerSpec = { kind: 'cli', cli: 'claude', model: 'sonnet' }

describe('who it is for', () => {
  it('a persona that lives HERE, or the computers not being built on this PC, is not remote: no runner, the orchestration runs her as always', () => {
    const { hook, runnerFor } = rig()
    expect(hook('ana', dsh, { projectId: 'p', thread: 'channel:geral' })).toBeUndefined()
    expect(rig({ built: false }).hook('nina', dsh, { projectId: 'p', thread: 'channel:geral' })).toBeUndefined()
    expect(runnerFor).not.toHaveBeenCalled()
  })
})

describe('the happy path: a channel conversation or a task of a channel goes to the persona\'s home', () => {
  it('a conversation reply in a channel (thread `channel:<id>`, with or without a subject) gets the runner of her home, with the engine she asked for as a hint', () => {
    const { hook, runnerFor } = rig()
    expect(hook('nina', claude, { projectId: 'p', thread: 'channel:geral' })).toBe(runner)
    expect(hook('nina', dsh, { projectId: 'p', thread: 'channel:geral#assunto-1' })).toBe(runner)
    expect(runnerFor.mock.calls).toEqual([['nina', { kind: 'cli', cli: 'claude' }], ['nina', { kind: 'dsh' }]])
  })

  it('a Task whose conversation is a channel goes to her home', () => {
    const { hook, conversationOf } = rig({ conversation: 'channel' })
    expect(hook('nina', claude, { projectId: 'p', ticketId: 't1' })).toBe(runner)
    expect(conversationOf).toHaveBeenCalledWith('p', 't1')
  })

  it('an engine the executor protocol does not name travels as "a CLI" (B decides with the account it has)', () => {
    const { hook, runnerFor } = rig()
    hook('nina', { kind: 'cli', cli: 'gemini', model: 'x' } as unknown as PersonaRunnerSpec, { projectId: 'p', thread: 'channel:geral' })
    expect(runnerFor).toHaveBeenCalledWith('nina', { kind: 'cli' })
  })
})

describe('a private DM never goes to another computer', () => {
  it.each([
    ['a Task born in a DM', { projectId: 'p', ticketId: 't1' }, 'dm' as const],
    ['a conversation reply in a DM', { projectId: 'p', thread: 'dm:gus' }, undefined],
    ['a conversation reply in a DM subject', { projectId: 'p', thread: 'dm:gus#assunto' }, undefined],
  ])('%s is refused with the person\'s own sentence, and nothing is sent', (_label, context, conversation) => {
    const { hook, runnerFor } = rig({ conversation })
    let caught: unknown
    try { hook('nina', claude, context) } catch (error) { caught = error }
    expect(isRemoteDmPrivateError(caught)).toBe(true)
    expect((caught as RemoteDmPrivateError).code).toBe('dm_private')
    expect((caught as Error).message).toMatch(/particular/u)
    expect(runnerFor).not.toHaveBeenCalled()
  })

  it.each([
    ['no context at all (an old caller)', undefined],
    ['neither a Task nor a conversation', { projectId: 'p' }],
    ['a Task A cannot find the conversation of', { projectId: 'p', ticketId: 'fantasma' }],
  ])('%s fails CLOSED: A cannot tell it is not a DM, so it is refused', (_label, context) => {
    const { hook, runnerFor } = rig({ conversation: undefined })
    expect(() => hook('nina', claude, context)).toThrow(RemoteDmPrivateError)
    expect(runnerFor).not.toHaveBeenCalled()
  })

  it('the refusal is a typed error the orchestration can read, not a stranger\'s exception', () => {
    expect(isRemoteDmPrivateError(new RemoteDmPrivateError())).toBe(true)
    expect(isRemoteDmPrivateError(new Error('x'))).toBe(false)
    expect(isRemoteDmPrivateError({ code: 'dm_private' })).toBe(false)
  })
})
