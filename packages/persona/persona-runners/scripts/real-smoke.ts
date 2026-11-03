/**
 * Opt-in real CLI smokes (D9). Requires PERSONA_REAL_CLI=1.
 * Cheap models, short prompts, native login, ≤3 executions per CLI. Never prints tokens or emails.
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createRuntimeRegistry,
  defaultRuntimes,
  type AvailableInstallation,
  type Runtime,
} from '@botiverse/oar'
import {
  createClaudeRunner,
  createCodexRunner,
  createCursorRunner,
  createOpencodeRunner,
  restoreNativeCliLogin,
  type RunEvent,
  type RunHandle,
  type StartTurnInput,
  type TurnRunner,
} from '../src/index.ts'

const CHEAP: Record<string, string> = {
  claude: 'haiku',
  codex: 'gpt-5.5',
  opencode: 'opencode/beam-free',
}

const MAX_EXEC = 3
const TRIVIAL = 'Reply with exactly the two letters OK and nothing else.'
const RESUME = 'Reply with exactly the three letters OK2 and nothing else.'
const LONG = 'Reply with exactly the two letters OK and nothing else.'

function redact(text: string): string {
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, '[redacted-email]')
    .replace(/\b(?:sk-|tok-|key-|Bearer\s+)[A-Za-z0-9._-]{8,}\b/gu, '[redacted-secret]')
}

function authKind(status: unknown): { kind: string; plan?: string } {
  if (status === null || typeof status !== 'object') return { kind: 'unknown' }
  const record = status as Record<string, unknown>
  const account = record.account
  const plan = account !== null && typeof account === 'object' && typeof (account as { plan?: unknown }).plan === 'string'
    ? (account as { plan: string }).plan
    : undefined
  const out: { kind: string; plan?: string } = { kind: typeof record.kind === 'string' ? record.kind : 'unknown' }
  if (plan !== undefined) out.plan = plan
  return out
}

async function collect(events: AsyncIterable<RunEvent>, limitMs: number): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  const deadline = Date.now() + limitMs
  for await (const event of events) {
    out.push(event)
    if (event.type === 'ended' || Date.now() > deadline) break
  }
  return out
}

function summarize(events: RunEvent[]): { types: string[]; lastState?: string; deltas: number } {
  const types = events.map(event => event.type)
  const ended = events.findLast(event => event.type === 'ended')
  return {
    types,
    ...(ended?.type === 'ended' ? { lastState: ended.report.state } : {}),
    deltas: events.filter(event => event.type === 'delta').length,
  }
}

async function runCli(
  id: 'claude' | 'codex' | 'opencode' | 'cursor',
  runtime: Runtime,
  cwd: string,
): Promise<Record<string, unknown>> {
  let execs = 0
  const bump = (): void => {
    execs += 1
    if (execs > MAX_EXEC) throw new Error(`${id} exceeded ${String(MAX_EXEC)} executions`)
  }

  let installation: AvailableInstallation | undefined
  try {
    const snap = runtime.installation === undefined ? { kind: 'unsupported' as const } : await runtime.installation()
    if (snap.kind !== 'available') return { id, skipped: true, reason: `installation ${snap.kind}`, execs }
    installation = snap
  } catch (error) {
    return { id, skipped: true, reason: redact(error instanceof Error ? error.message : String(error)), execs }
  }

  let auth: { kind: string; plan?: string } = { kind: 'skipped' }
  if (runtime.authStatus !== undefined) {
    try {
      auth = authKind(await runtime.authStatus(installation, { timeoutMs: 20_000 }))
    } catch (error) {
      auth = { kind: 'error' }
      void error
    }
  }
  if (id === 'cursor' && auth.kind !== 'logged_in') {
    return { id, skipped: true, reason: `cursor auth ${auth.kind} (no interactive login)`, auth, execs }
  }

  const model = CHEAP[id] ?? 'default'
  const factory = (): TurnRunner => {
    if (id === 'claude') return createClaudeRunner({ runtime, installation })
    if (id === 'codex') return createCodexRunner({ runtime, installation })
    if (id === 'opencode') return createOpencodeRunner({ runtime, installation })
    return createCursorRunner({ runtime, installation })
  }
  const base = (assignmentId: string, prompt: string, resumeSessionId?: string): StartTurnInput => {
    const input: StartTurnInput = {
      ticketId: `d9-${id}`,
      assignmentId,
      personaId: 'smoke',
      cwd,
      prompt,
      model,
      permissionMode: 'deny',
    }
    if (resumeSessionId !== undefined) input.resumeSessionId = resumeSessionId
    return input
  }

  const trivial: Record<string, unknown> = { model }
  try {
    bump()
    const runner = factory()
    const handle = await runner.start(base('trivial', TRIVIAL))
    const events = await collect(runner.stream(handle), 90_000)
    const usage = await runner.usage(handle)
    trivial.ok = events.some(event => event.type === 'ended' && event.report.state !== 'failed')
    trivial.stream = summarize(events)
    trivial.usage = { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
    trivial.sessionIdPresent = handle.sessionId.length > 0

    bump()
    const resumed = await runner.resume(base('resume', RESUME, handle.sessionId))
    const resumeEvents = await collect(runner.stream(resumed), 90_000)
    trivial.resume = {
      ok: resumeEvents.some(event => event.type === 'ended' && event.report.state !== 'failed'),
      stream: summarize(resumeEvents),
    }
  } catch (error) {
    trivial.ok = false
    trivial.error = redact(error instanceof Error ? error.message : String(error))
  }

  const cancel: Record<string, unknown> = {}
  try {
    bump()
    const runner = factory()
    const handle: RunHandle = await runner.start(base('cancel', LONG))
    const iter = runner.stream(handle)[Symbol.asyncIterator]()
    const first = await Promise.race([
      iter.next(),
      new Promise<{ done: true; value: undefined }>((resolve) => { setTimeout(() => { resolve({ done: true, value: undefined }) }, 20_000) }),
    ])
    await runner.cancel(handle)
    const rest: RunEvent[] = []
    if (first.done !== true && first.value !== undefined) rest.push(first.value)
    for (;;) {
      const step = await Promise.race([
        iter.next(),
        new Promise<{ done: true; value: undefined }>((resolve) => { setTimeout(() => { resolve({ done: true, value: undefined }) }, 15_000) }),
      ])
      if (step.done === true) break
      if (step.value !== undefined) rest.push(step.value)
      if (step.value?.type === 'ended') break
    }
    cancel.ok = rest.some(event => event.type === 'ended' && event.report.state === 'dropped')
      || rest.some(event => event.type === 'started')
    cancel.stream = summarize(rest)
  } catch (error) {
    cancel.ok = false
    cancel.error = redact(error instanceof Error ? error.message : String(error))
  }

  return { id, auth, model, execs, trivial, cancel }
}

async function main(): Promise<void> {
  if (process.env.PERSONA_REAL_CLI !== '1') {
    process.stderr.write('set PERSONA_REAL_CLI=1 to run real CLI smokes\n')
    process.exit(2)
  }
  restoreNativeCliLogin()
  const cwd = await mkdtemp(join(tmpdir(), 'persona-d9-'))
  const reports: Record<string, unknown>[] = []

  for (const id of ['claude', 'codex', 'opencode'] as const) {
    const runtime = defaultRuntimes.get(id)
    if (runtime === undefined) {
      reports.push({ id, skipped: true, reason: 'not in defaultRuntimes', execs: 0 })
      continue
    }
    reports.push(await runCli(id, runtime, cwd))
  }

  try {
    const { createCursorRuntime } = await import('@botiverse/oar')
    const registry = createRuntimeRegistry([
      ...defaultRuntimes.list(),
      createCursorRuntime({ sdk: () => import('@cursor/sdk') }),
    ])
    reports.push(await runCli('cursor', registry.require('cursor'), cwd))
  } catch (error) {
    reports.push({
      id: 'cursor',
      skipped: true,
      reason: redact(error instanceof Error ? error.message : String(error)),
      execs: 0,
    })
  }

  process.stdout.write(`${JSON.stringify({
    probedAt: new Date().toISOString(),
    cwd,
    flag: 'PERSONA_REAL_CLI=1',
    note: 'token/email redacted; cheap models; native login; ≤3 execs per CLI',
    runtimes: reports,
  }, null, 2)}\n`)
  process.exit(0)
}

await main()
