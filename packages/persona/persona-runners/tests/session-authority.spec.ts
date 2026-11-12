/**
 * Carbon P0-03a (colheita snapshot 1), the runners' half: the session facade hands every turn the authority the host derived for ITS Task (a routine and an unattended run are not a person),
 * and the runner's own gate arms with it. RED first: `StartTurnInput` had no authority, so the native gate armed every turn as `person`.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Runtime, SessionOptions } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { AuthorityKind } from '../src/authority/authority-table.ts'
import type { Runner, StartTurnInput } from '../src/contract.ts'
import {
  CLAUDE_CAPABILITIES,
  createOarSessionRunner,
  type RunEvent,
  type TurnRunner,
} from '../src/index.ts'
import { PermissionGate } from '../src/resolve/permission-gate.ts'
import { resolveRunner } from '../src/resolve/resolve-runner.ts'
import { createSessionPool } from '../src/resolve/session-pool.ts'

function recordingTurn(): { turn: TurnRunner; started: StartTurnInput[] } {
  const started: StartTurnInput[] = []
  const turn: TurnRunner = {
    capabilities: () => CLAUDE_CAPABILITIES,
    health: async () => ({ ok: true, detail: 'x' }),
    authenticate: async () => ({ ok: true, detail: 'x' }),
    start: async (input) => {
      started.push(input)
      return { runId: 'r1', sessionId: 's1', ticketId: input.ticketId, assignmentId: input.assignmentId, personaId: input.personaId, cwd: input.cwd, model: input.model }
    },
    startTurn: async input => turn.start(input),
    stream: async function *(): AsyncIterable<RunEvent> { yield { type: 'ended', at: 'now', report: { state: 'ready', summary: 'ok' } } },
    events: async function *(): AsyncIterable<RunEvent> { yield { type: 'ended', at: 'now', report: { state: 'ready', summary: 'ok' } } },
    cancel: async () => undefined,
    resume: async input => turn.start(input),
    usage: async () => ({ inputTokens: 0, outputTokens: 0 }),
  }
  return { turn, started }
}

describe('the session facade hands each turn the authority of ITS Task', () => {
  it('asks the host per turn (the runner is warm across Tasks) and carries the answer in StartTurnInput', async () => {
    const { turn, started } = recordingTurn()
    const runner = createOarSessionRunner({
      turn, personaId: 'nina', model: 'm', permissionMode: 'deny', purpose: 'talk',
      authorityFor: ({ ticketId }) => (ticketId === 't-routine' ? 'routine' : ticketId === 't-event' ? 'unattended' : 'person'),
    })
    await runner.ensureSession('worker-t-routine', 'C:/tmp/a', 'Rotina', 'worker')
    await runner.deliver('worker-t-routine', 'r1', 'rode a rotina', 'queue')
    await runner.ensureSession('worker-t-event', 'C:/tmp/b', 'Evento', 'worker')
    await runner.deliver('worker-t-event', 'r2', 'responda', 'queue')
    await runner.ensureSession('worker-t-person', 'C:/tmp/c', 'Pedido', 'worker')
    await runner.deliver('worker-t-person', 'r3', 'faça', 'queue')
    expect(started.map(input => input.authority)).toEqual(['routine', 'unattended', 'person'])
  })

  it('without an opener nothing is said (the gates then default to a person, as before)', async () => {
    const { turn, started } = recordingTurn()
    const runner = createOarSessionRunner({ turn, personaId: 'nina', model: 'm', permissionMode: 'deny', purpose: 'talk' })
    await runner.ensureSession('worker-t1', 'C:/tmp/a', 'Pedido', 'worker')
    await runner.deliver('worker-t1', 'r1', 'faça', 'queue')
    expect(Object.hasOwn(started[0] ?? {}, 'authority')).toBe(false)
  })
})

let base = ''
let draft = ''
beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'persona-turn-authority-'))
  draft = join(base, 'draft')
  mkdirSync(draft, { recursive: true })
})
afterAll(() => { rmSync(base, { recursive: true, force: true }) })

const gates: PermissionGate[] = []
afterEach(async () => { await Promise.all(gates.splice(0).map(async gate => gate.close())) })

type Answer = 'allow' | 'deny' | 'no-opinion'
interface Hook { readonly url: string; readonly headers: Record<string, string> }

function hookOf(options: SessionOptions | undefined): Hook | undefined {
  const args = options?.launchArgs ?? []
  const at = args.indexOf('--settings')
  if (at < 0) return undefined
  const settings = JSON.parse(args[at + 1] ?? '{}') as { hooks?: { PreToolUse?: { hooks: Hook[] }[] } }
  return settings.hooks?.PreToolUse?.[0]?.hooks[0]
}

async function ask(hook: Hook, tool: string, toolInput: Record<string, unknown>): Promise<Answer> {
  const response = await fetch(hook.url, {
    method: 'POST', headers: { 'content-type': 'application/json', ...hook.headers },
    body: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: toolInput, tool_use_id: 'tu', cwd: draft }),
  })
  const body = (await response.json()) as { hookSpecificOutput?: { permissionDecision?: 'allow' | 'deny' } }
  return body.hookSpecificOutput?.permissionDecision ?? 'no-opinion'
}

/** A fake CLI whose "model" asks the hook for the same two browser calls once per turn. */
async function turnAs(authority: AuthorityKind | undefined): Promise<Answer[]> {
  const opened: SessionOptions[] = []
  const answers: Answer[] = []
  const scripted = scriptedRuntime({
    id: 'fake-cli',
    turn: async (turn) => {
      const hook = hookOf(opened.at(-1))
      if (hook !== undefined) {
        answers.push(await ask(hook, 'mcp__browser__take_snapshot', {}))
        answers.push(await ask(hook, 'mcp__browser__click', { uid: '1_2' }))
      }
      turn.say('ok')
    },
  })
  const openOriginal = scripted.session.bind(scripted)
  const runtime = Object.assign(scripted, {
    installation: async () => ({ kind: 'available', via: 'bundled' }),
    authStatus: async () => ({ kind: 'logged_in' }),
    listModels: async () => ({ kind: 'ok', models: [{ id: 'haiku' }] }),
    session: async (installation: unknown, options: SessionOptions) => { opened.push(options); return openOriginal(installation as never, options) },
  }) as unknown as Runtime
  const runner = await resolveRunner({
    spec: { kind: 'cli', cli: 'claude', model: 'haiku' }, permissionMode: 'allow-once', tools: { files: 'write' }, runtime, personId: 'nina', projectId: 'p1', cwd: draft, carriesBrowser: true,
    pool: createSessionPool<Runner>(), infra: { wait: async () => undefined }, env: { PERSONA_CLI_ENV: 'native' },
  })
  try {
    const input: StartTurnInput = { ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: draft, prompt: 'faça', model: 'haiku', permissionMode: 'allow-once', ...(authority === undefined ? {} : { authority }) }
    const handle = await runner.start(input)
    for await (const event of runner.stream(handle)) if (event.type === 'ended') break
  } finally {
    await runner.dispose?.()
  }
  return answers
}

describe('the runner\'s own gate arms every turn with the authority the turn carries', () => {
  it('a routine and an unattended turn may look in the browser but not click; a person turn (or none said) may click', async () => {
    expect(await turnAs('routine')).toEqual(['allow', 'deny'])
    expect(await turnAs('unattended')).toEqual(['allow', 'deny'])
    expect(await turnAs('person')).toEqual(['allow', 'allow'])
    expect(await turnAs(undefined)).toEqual(['allow', 'allow'])
  })
})
