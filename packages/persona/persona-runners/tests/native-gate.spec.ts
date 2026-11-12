/**
 * COLHEITA 8 (Lumen): every Claude task that may save a file or run a command is behind the hook gate, not only the tasks that carry connectors. The runner opens a gate of
 * its own when the host brought none. Fake runtime that asks the hook the way the CLI does (real HTTP); the real binary is covered by `scripts/authority-dry.ts`.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Runtime, SessionOptions } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Runner, StartTurnInput } from '../src/contract.ts'
import { needsNativeGate, nativeGateFor } from '../src/authority/native-gate.ts'
import { PermissionGate } from '../src/resolve/permission-gate.ts'
import { resolveRunner } from '../src/resolve/resolve-runner.ts'
import { createSessionPool } from '../src/resolve/session-pool.ts'

let base = ''
let draft = ''
beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'persona-native-gate-'))
  draft = join(base, 'draft')
  mkdirSync(draft, { recursive: true })
})
afterAll(() => { rmSync(base, { recursive: true, force: true }) })

const gates: PermissionGate[] = []
afterEach(async () => { await Promise.all(gates.splice(0).map(async gate => gate.close())) })

type Answer = 'allow' | 'deny' | 'no-opinion'

interface Hook { readonly url: string; readonly headers: Record<string, string> }

/** The hook the session was opened with, read from the `--settings` the runner passed (what the CLI would read). */
function hookOf(options: SessionOptions | undefined): Hook | undefined {
  const args = options?.launchArgs ?? []
  const at = args.indexOf('--settings')
  if (at < 0) return undefined
  const settings = JSON.parse(args[at + 1] ?? '{}') as { hooks?: { PreToolUse?: { hooks: Hook[] }[] } }
  return settings.hooks?.PreToolUse?.[0]?.hooks[0]
}

async function ask(hook: Hook, tool: string, toolInput: Record<string, unknown>, cwd: string): Promise<Answer> {
  const response = await fetch(hook.url, {
    method: 'POST', headers: { 'content-type': 'application/json', ...hook.headers },
    body: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: toolInput, tool_use_id: 'tu', cwd }),
  })
  const body = (await response.json()) as { hookSpecificOutput?: { permissionDecision?: 'allow' | 'deny' } }
  return body.hookSpecificOutput?.permissionDecision ?? 'no-opinion'
}

/** A runtime whose "model" calls the hook once per scripted call, then ends the turn. */
function runtimeCalling(calls: readonly { tool: string; input: Record<string, unknown> }[], cwd: string): { runtime: Runtime; opened: SessionOptions[]; answers: Answer[] } {
  const opened: SessionOptions[] = []
  const answers: Answer[] = []
  const base = scriptedRuntime({
    id: 'fake-cli',
    turn: async (turn) => {
      const hook = hookOf(opened.at(-1))
      if (hook !== undefined) for (const call of calls) answers.push(await ask(hook, call.tool, call.input, cwd))
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

async function runnerFor(cli: 'claude' | 'codex', tools: Record<string, 'none' | 'read' | 'write'>, calls: readonly { tool: string; input: Record<string, unknown> }[], cwd: string = draft, permissionMode: 'allow-once' | 'deny' = 'allow-once', carriesBrowser = false) {
  const { runtime, opened, answers } = runtimeCalling(calls, cwd)
  const runner = await resolveRunner({
    spec: { kind: 'cli', cli, model: 'haiku' }, permissionMode, tools, runtime, personId: 'nina', projectId: 'p1', cwd, ...(carriesBrowser ? { carriesBrowser } : {}),
    pool: createSessionPool<Runner>(), infra: { wait: async () => undefined }, env: { PERSONA_CLI_ENV: 'native' },
  })
  const startInput: StartTurnInput = { ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd, prompt: 'faça o cartaz', model: 'haiku', permissionMode }
  const handle = await runner.start(startInput)
  for await (const event of runner.stream(handle)) if (event.type === 'ended') break
  return { runner, opened, answers }
}

describe('when a Claude task needs the runner\'s own gate', () => {
  it('only a Claude task (never a plain answer) whose persona may save files or run commands, or that carries the browser of item 17', () => {
    expect(needsNativeGate('claude', 'allow-once', { files: 'write' })).toBe(true)
    expect(needsNativeGate('claude', 'allow-once', { shell: 'read' })).toBe(true)
    expect(needsNativeGate('claude', 'allow-once', { shell: 'write', files: 'write' })).toBe(true)
    expect(needsNativeGate('claude', 'allow-once', { files: 'read' })).toBe(false)
    expect(needsNativeGate('claude', 'allow-once', {})).toBe(false)
    expect(needsNativeGate('claude', 'allow-once', undefined)).toBe(false)
    expect(needsNativeGate('claude', 'allow-once', {}, true)).toBe(true) // no file or shell grant, but the browser is attached to its turns
    expect(needsNativeGate('claude', 'deny', { files: 'write' }, true)).toBe(false)
    expect(needsNativeGate('codex', 'allow-once', { files: 'write' }, true)).toBe(false)
  })

  it('the host\'s gate wins and is only told the shell grant; another CLI gets none', async () => {
    const host = await PermissionGate.start({ token: 'tok' })
    gates.push(host)
    const picked = await nativeGateFor({ cli: 'claude', permissionMode: 'allow-once', tools: { shell: 'read' }, hostGate: host })
    expect(picked).toEqual({ gate: host, own: undefined })
    expect(await nativeGateFor({ cli: 'codex', permissionMode: 'allow-once', tools: { files: 'write' }, hostGate: undefined })).toEqual({ gate: undefined, own: undefined })
    expect(await nativeGateFor({ cli: 'claude', permissionMode: 'deny', tools: { files: 'write' }, hostGate: undefined })).toEqual({ gate: undefined, own: undefined })
  })
})

describe('resolveRunner with a persona that only saves files, no connector, no host gate (the common case)', () => {
  it('the session opens with the hook, and the hook keeps every write inside the draft of the turn', async () => {
    const { runner, opened, answers } = await runnerFor('claude', { files: 'write' }, [
      { tool: 'Write', input: { file_path: join(draft, 'cartaz.svg'), content: '<svg/>' } },
      { tool: 'Write', input: { file_path: join(base, 'pasta-real', 'cartaz.svg'), content: '<svg/>' } },
      { tool: 'Write', input: { file_path: '../escape.svg', content: '<svg/>' } },
    ])
    try {
      expect(hookOf(opened.at(-1))).toBeDefined()
      expect(answers).toEqual(['no-opinion', 'deny', 'deny'])
    } finally { await runner.dispose?.() }
  })

  it('a shell call is judged too, a secret read is refused, and a connector of the person is out of the mandate', async () => {
    const { runner, answers } = await runnerFor('claude', { files: 'write', shell: 'write' }, [
      { tool: 'Bash', input: { command: 'git status' } },
      { tool: 'Bash', input: { command: 'git push origin main' } }, // would wait for a card; this gate has none, so it is refused
      { tool: 'Bash', input: { command: 'cat .env' } },
      { tool: 'Read', input: { file_path: 'C:\\Users\\x\\.ssh\\id_rsa' } },
      { tool: 'mcp__gmail__send_email', input: { to: 'a@b.c' } },
      { tool: 'mcp__persona__persona_recall', input: {} }, // the product's own tools are not this gate's business
    ])
    try {
      expect(answers).toEqual(['no-opinion', 'deny', 'deny', 'deny', 'deny', 'no-opinion'])
    } finally { await runner.dispose?.() }
  })

  it('a persona with a read-only shell runs reads only', async () => {
    const { runner, answers } = await runnerFor('claude', { files: 'write', shell: 'read' }, [
      { tool: 'Bash', input: { command: 'git log --oneline' } },
      { tool: 'Bash', input: { command: 'mkdir x' } },
    ])
    try {
      expect(answers).toEqual(['no-opinion', 'deny'])
    } finally { await runner.dispose?.() }
  })

  it('a task with no draft folder (the placeholder `.`) can change nothing', async () => {
    const { runner, answers } = await runnerFor('claude', { files: 'write', shell: 'write' }, [
      { tool: 'Bash', input: { command: 'touch a.txt' } },
      { tool: 'Bash', input: { command: 'ls' } },
    ], '.')
    try {
      expect(answers).toEqual(['deny', 'no-opinion'])
    } finally { await runner.dispose?.() }
  })

  it('the gate dies with the runner: nothing keeps listening', async () => {
    const { runner, opened } = await runnerFor('claude', { files: 'write' }, [])
    const hook = hookOf(opened.at(-1))
    expect(hook).toBeDefined()
    await runner.dispose?.()
    await expect(ask(hook as Hook, 'Write', { file_path: join(draft, 'a.svg') }, draft)).rejects.toThrow()
  })
})

describe('no gate where none applies (nothing changes for the other cases)', () => {
  it('a plain answer, a persona with no file or shell grant and another CLI open without the hook', async () => {
    for (const [cli, tools, mode] of [['claude', { files: 'write' }, 'deny'], ['claude', {}, 'allow-once'], ['claude', { files: 'read' }, 'allow-once'], ['codex', { files: 'write' }, 'allow-once']] as const) {
      const { runner, opened } = await runnerFor(cli, { ...tools }, [], draft, mode)
      try {
        expect(hookOf(opened.at(-1))).toBeUndefined()
      } finally { await runner.dispose?.() }
    }
  })

  it('a Claude task with no file and no shell grant that carries the browser IS gated: the browser row applies and what it was never given is refused', async () => {
    const { runner, opened, answers } = await runnerFor('claude', {}, [
      { tool: 'mcp__browser__navigate_page', input: { url: 'https://example.com' } },
      { tool: 'mcp__browser__click', input: { uid: '1_2' } },
      { tool: 'mcp__browser__upload_file', input: { uid: '1_9', filePath: 'C:\\x\\a.png' } },
      { tool: 'mcp__gmail__send_email', input: { to: 'a@b.c' } },
    ], draft, 'allow-once', true)
    try {
      expect(hookOf(opened.at(-1))).toBeDefined()
      expect(answers).toEqual(['allow', 'allow', 'deny', 'deny'])
    } finally { await runner.dispose?.() }
  })
})
