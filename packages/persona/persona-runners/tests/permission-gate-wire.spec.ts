/**
 * HT-8/HT-9: the gate wired through resolveRunner. The session is opened with the hook as flag settings (and never with an allow rule for
 * a guarded tool), and a turn that asked for something not allowed ends `blocked` with the detail left on the gate for the host's card.
 * Fake runtime; the real CLI behaviour is `scripts/ht89-dry.ts` and reports/ht89-permission-dry.md.
 */
import type { Runtime, SessionOptions } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { afterEach, describe, expect, it } from 'vitest'
import type { RunEvent, Runner, StartTurnInput } from '../src/contract.ts'
import { GATE_TOKEN_HEADER, NEEDS_APPROVAL_TEXT, PermissionGate } from '../src/resolve/permission-gate.ts'
import { resolveRunner } from '../src/resolve/resolve-runner.ts'
import { createSessionPool } from '../src/resolve/session-pool.ts'
import { argsHash } from '../src/resolve/tool-input.ts'

const gates: PermissionGate[] = []
afterEach(async () => { await Promise.all(gates.splice(0).map(async gate => gate.close())) })

const SEND = { hook_event_name: 'PreToolUse', tool_name: 'mcp__gmail__send_message', tool_input: { to: 'ana@x.com', body: 'oi' } }
const input: StartTurnInput = { ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp/gate', prompt: 'envie', model: 'haiku', permissionMode: 'allow-once' }

/** A runtime whose "model" asks the gate, like the CLI does before a tool call, then ends the turn. */
function runtimeCalling(gate: PermissionGate, calls: readonly Record<string, unknown>[]): { runtime: Runtime; opened: SessionOptions[]; answers: string[] } {
  const opened: SessionOptions[] = []
  const answers: string[] = []
  const base = scriptedRuntime({
    id: 'fake-cli',
    turn: async (turn) => {
      for (const call of calls) {
        const response = await fetch(gate.url, { method: 'POST', headers: { [GATE_TOKEN_HEADER]: 'tok' }, body: JSON.stringify(call) })
        const body = (await response.json()) as { hookSpecificOutput?: { permissionDecision?: string } }
        answers.push(body.hookSpecificOutput?.permissionDecision ?? 'none')
      }
      turn.say('ok')
    },
  })
  const openOriginal = base.session.bind(base)
  const runtime = Object.assign(base, {
    installation: async () => ({ kind: 'available', via: 'bundled' }),
    authStatus: async () => ({ kind: 'logged_in' }),
    listModels: async () => ({ kind: 'ok', models: [{ id: 'haiku' }] }),
    session: async (installation: unknown, options: SessionOptions) => { opened.push(options); return openOriginal(installation as never, options) },
  })
  return { runtime: runtime as unknown as Runtime, opened, answers }
}

async function turn(cli: 'claude' | 'codex', gate: PermissionGate, calls: readonly Record<string, unknown>[]): Promise<{ opened: SessionOptions[]; answers: string[]; ended: RunEvent | undefined; runner: Runner }> {
  const { runtime, opened, answers } = runtimeCalling(gate, calls)
  const runner = await resolveRunner({
    spec: { kind: 'cli', cli, model: 'haiku' }, permissionMode: 'allow-once', runtime, personId: 'nina', projectId: 'p1', cwd: 'C:/tmp/gate',
    pool: createSessionPool<Runner>(), infra: { wait: async () => undefined }, env: { PERSONA_CLI_ENV: 'native' }, permissionGate: gate,
  })
  const handle = await runner.start(input)
  let ended: RunEvent | undefined
  for await (const event of runner.stream(handle)) if (event.type === 'ended') { ended = event; break }
  return { opened, answers, ended, runner }
}

describe('the session is opened with the hook', () => {
  it('Claude gets the gate\'s settings as --settings, and no guarded tool is ever in an allow rule', async () => {
    const gate = await PermissionGate.start({ token: 'tok' })
    gates.push(gate)
    gate.arm()
    const { opened, runner } = await turn('claude', gate, [])
    const args = opened[0]?.launchArgs ?? []
    const at = args.indexOf('--settings')
    expect(at).toBeGreaterThanOrEqual(0)
    const settings = JSON.parse(args[at + 1] ?? '{}') as { hooks: { PreToolUse: { matcher: string; hooks: { type: string; url: string }[] }[] }; allowedHttpHookUrls: string[]; permissions?: unknown }
    expect(settings.hooks.PreToolUse[0]?.hooks[0]).toMatchObject({ type: 'http', url: gate.url })
    expect(settings.allowedHttpHookUrls).toEqual([gate.url])
    // fail-closed rule: the hook must be the ONLY thing that enables a controlled tool
    expect(settings.permissions).toBeUndefined()
    expect(args.join(' ')).not.toMatch(/--allowedTools|--allowed-tools/u)
    await runner.dispose?.()
  })

  it('another CLI gets no hook (it has no equivalent proven)', async () => {
    const gate = await PermissionGate.start({ token: 'tok' })
    gates.push(gate)
    const { opened, runner } = await turn('codex', gate, [])
    expect(opened[0]?.launchArgs ?? []).not.toContain('--settings')
    await runner.dispose?.()
  })
})

describe('a turn that asked for something not allowed ends blocked', () => {
  it('a blocked send: the turn ends `blocked`, the detail waits on the gate, and the gate is disarmed', async () => {
    const gate = await PermissionGate.start({ token: 'tok' })
    gates.push(gate)
    gate.arm({ preAllow: ['read'] })
    const { answers, ended, runner } = await turn('claude', gate, [SEND])
    expect(answers).toEqual(['deny'])
    expect(ended).toMatchObject({ type: 'ended', report: { state: 'blocked', summary: NEEDS_APPROVAL_TEXT, question: NEEDS_APPROVAL_TEXT } })
    const [request] = gate.takeRequests()
    expect(request).toMatchObject({ tool: 'mcp__gmail__send_message', actionClass: 'send', argsHash: argsHash(SEND.tool_input) })
    // the window is closed: a call after the turn is denied and records nothing
    const late = await fetch(gate.url, { method: 'POST', headers: { [GATE_TOKEN_HEADER]: 'tok' }, body: JSON.stringify(SEND) })
    expect(((await late.json()) as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision).toBe('deny')
    expect(gate.takeRequests()).toEqual([])
    await runner.dispose?.()
  })

  it('an approved call runs and the turn ends `ready`: nothing was left waiting', async () => {
    const gate = await PermissionGate.start({ token: 'tok' })
    gates.push(gate)
    gate.arm({ approved: [{ tool: SEND.tool_name, argsHash: argsHash(SEND.tool_input) }] })
    const { answers, ended, runner } = await turn('claude', gate, [SEND])
    expect(answers).toEqual(['allow'])
    expect(ended).toMatchObject({ report: { state: 'ready' } })
    expect(gate.takeRequests()).toEqual([])
    await runner.dispose?.()
  })

  it('a turn with no MCP call is untouched', async () => {
    const gate = await PermissionGate.start({ token: 'tok' })
    gates.push(gate)
    gate.arm()
    const { ended, runner } = await turn('claude', gate, [])
    expect(ended).toMatchObject({ report: { state: 'ready' } })
    await runner.dispose?.()
  })
})
