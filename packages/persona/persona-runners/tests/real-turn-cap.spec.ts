import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  REAL_TURN_CAP_ENV,
  REAL_TURN_LEDGER_ENV,
  RealTurnCapError,
  isRealTurnCapError,
  realTurnCapFromEnv,
  resolveRunner,
  withRealTurnCap,
  type DshAgentPort,
} from '../src/index.ts'
import type { RunHandle, Runner, StartTurnInput } from '../src/contract.ts'
import { createOarSessionRunner } from '../src/oar/session.ts'

const run = promisify(execFile)

const input: StartTurnInput = {
  ticketId: 't1', assignmentId: 'a1', personaId: 'nina', cwd: 'C:/tmp', prompt: 'hi', model: 'haiku', permissionMode: 'deny',
}

function fakeInner(): Runner & { calls: Record<'start' | 'startTurn' | 'resume' | 'prime', number> } {
  const calls = { start: 0, startTurn: 0, resume: 0, prime: 0 }
  const handle = (): RunHandle => ({ runId: 'r', sessionId: 's', ticketId: 't1', assignmentId: 'a1', personaId: 'nina', cwd: 'C:/tmp', model: 'haiku' })
  return {
    calls,
    capabilities: () => ({}) as never,
    health: async () => ({ ok: true, detail: 'ok' }),
    authenticate: async () => ({ ok: true, detail: 'ok' }),
    start: async () => { calls.start += 1; return handle() },
    startTurn: async () => { calls.startTurn += 1; return handle() },
    stream: async function *() { /* no events */ },
    events: async function *() { /* no events */ },
    cancel: async () => undefined,
    resume: async () => { calls.resume += 1; return handle() },
    usage: async () => ({ inputTokens: 0, outputTokens: 0 }) as never,
    prime: async () => { calls.prime += 1; return handle() },
  }
}

let dir: string
let ledger: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'real-turn-cap-'))
  ledger = join(dir, 'ledger', 'turns.json')
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const turnsInLedger = (): number => (JSON.parse(readFileSync(ledger, 'utf8')) as { turns: number }).turns
const expectRefusal = async (promise: Promise<unknown>, reason: string): Promise<RealTurnCapError> => {
  const error = await promise.then(() => undefined, (caught: unknown) => caught)
  expect(isRealTurnCapError(error)).toBe(true)
  expect((error as RealTurnCapError).reason).toBe(reason)
  expect((error as RealTurnCapError).message).toMatch(/^Precisa de você: /u)
  expect((error as RealTurnCapError).message).not.toMatch(/ledger|cli|json|arquivo|erro|exception/iu)
  return error as RealTurnCapError
}

describe('withRealTurnCap', () => {
  it('cap=1 allows one turn and refuses the second without starting the CLI', async () => {
    const inner = fakeInner()
    const runner = withRealTurnCap(inner, { cap: 1, ledgerPath: ledger })
    await runner.startTurn(input)
    const refusal = await expectRefusal(runner.start(input), 'cap_reached')
    expect(refusal.message).toContain('1 de 1')
    await expectRefusal(runner.startTurn(input), 'cap_reached')
    await expectRefusal(runner.resume(input), 'cap_reached')
    expect(inner.calls).toEqual({ start: 0, startTurn: 1, resume: 0, prime: 0 })
    expect(turnsInLedger()).toBe(1)
  })

  it('counts every model turn of a warm session (start, startTurn and resume) but not prime', async () => {
    const inner = fakeInner()
    const runner = withRealTurnCap(inner, { cap: 3, ledgerPath: ledger })
    await runner.prime!(input)
    await runner.start(input)
    await runner.resume({ ...input, resumeSessionId: 's' })
    await runner.resume({ ...input, resumeSessionId: 's' })
    expect(turnsInLedger()).toBe(3)
    await expectRefusal(runner.resume(input), 'cap_reached')
    expect(inner.calls).toEqual({ start: 1, startTurn: 0, resume: 2, prime: 1 })
    const entries = (JSON.parse(readFileSync(ledger, 'utf8')) as { entries: Array<{ kind: string; ticketId: string }> }).entries
    expect(entries.map(entry => entry.kind)).toEqual(['start', 'resume', 'resume'])
    expect(entries[0]?.ticketId).toBe('t1')
  })

  it('persists across process restarts and temporary homes (a new wrapper reads the same ledger)', async () => {
    const first = fakeInner()
    await withRealTurnCap(first, { cap: 2, ledgerPath: ledger }).start(input)
    const second = fakeInner()
    const restarted = withRealTurnCap(second, { cap: 2, ledgerPath: ledger })
    await restarted.start(input)
    await expectRefusal(withRealTurnCap(fakeInner(), { cap: 2, ledgerPath: ledger }).start(input), 'cap_reached')
    expect(turnsInLedger()).toBe(2)
    expect(second.calls.start).toBe(1)
  })

  it.each([
    ['not json', 'not json'],
    ['empty file', ''],
    ['array', '[]'],
    ['null', 'null'],
    ['no version', '{"turns":0,"entries":[]}'],
    ['negative turns', '{"version":1,"turns":-1,"entries":[]}'],
    ['fractional turns', '{"version":1,"turns":0.5,"entries":[]}'],
    ['turns as text', '{"version":1,"turns":"0","entries":[]}'],
    ['entries missing', '{"version":1,"turns":0}'],
    ['truncated write', '{"version":1,"turns":0,"entr'],
  ])('fails closed on a corrupt ledger (%s) and leaves it untouched', async (_name, content) => {
    mkdirSync(join(dir, 'ledger'), { recursive: true })
    writeFileSync(ledger, content)
    const inner = fakeInner()
    await expectRefusal(withRealTurnCap(inner, { cap: 5, ledgerPath: ledger }).start(input), 'ledger_corrupt')
    expect(inner.calls.start).toBe(0)
    expect(readFileSync(ledger, 'utf8')).toBe(content)
  })

  it('fails closed when the ledger path is a directory or cannot be created', async () => {
    mkdirSync(ledger, { recursive: true })
    const inner = fakeInner()
    await expectRefusal(withRealTurnCap(inner, { cap: 5, ledgerPath: ledger }).start(input), 'ledger_unavailable')
    const blocker = join(dir, 'blocker')
    writeFileSync(blocker, 'a file where a directory is needed')
    await expectRefusal(withRealTurnCap(inner, { cap: 5, ledgerPath: join(blocker, 'x', 'turns.json') }).start(input), 'ledger_unavailable')
    expect(inner.calls.start).toBe(0)
  })

  it.each([
    ['no ledger path', { cap: 3, ledgerPath: undefined }],
    ['empty ledger path', { cap: 3, ledgerPath: '' }],
    ['relative ledger path', { cap: 3, ledgerPath: 'turns.json' }],
    ['cap 0', { cap: 0, ledgerPath: '<ledger>' }],
    ['negative cap', { cap: -1, ledgerPath: '<ledger>' }],
    ['fractional cap', { cap: 1.5, ledgerPath: '<ledger>' }],
    ['NaN cap', { cap: Number.NaN, ledgerPath: '<ledger>' }],
  ])('refuses everything when misconfigured (%s)', async (_name, options) => {
    const inner = fakeInner()
    const runner = withRealTurnCap(inner, { cap: options.cap, ledgerPath: options.ledgerPath === '<ledger>' ? ledger : options.ledgerPath })
    await expectRefusal(runner.startTurn(input), 'misconfigured')
    await expectRefusal(runner.resume(input), 'misconfigured')
    expect(inner.calls).toEqual({ start: 0, startTurn: 0, resume: 0, prime: 0 })
    expect(existsSync(ledger)).toBe(false)
  })
})

describe('atomicity', () => {
  it('leaves no temp or lock file behind and always a valid ledger', async () => {
    const runner = withRealTurnCap(fakeInner(), { cap: 5, ledgerPath: ledger })
    for (let turn = 1; turn <= 5; turn += 1) {
      await runner.start(input)
      expect(turnsInLedger()).toBe(turn)
      expect(readdirSync(join(dir, 'ledger'))).toEqual(['turns.json'])
    }
  })

  it('concurrent turns in one process admit exactly the cap', async () => {
    const inner = fakeInner()
    const runner = withRealTurnCap(inner, { cap: 4, ledgerPath: ledger })
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => runner.startTurn(input)))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(4)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(8)
    expect(inner.calls.startTurn).toBe(4)
    expect(turnsInLedger()).toBe(4)
  })

  it('concurrent processes admit exactly the cap (cross-process lock)', async () => {
    const module = pathToFileURL(join(import.meta.dirname, '../src/resolve/real-turn-cap.ts')).href
    const script = `
      import { reserveRealTurn } from ${JSON.stringify(module)}
      let ok = 0
      for (let i = 0; i < 6; i += 1) {
        try { reserveRealTurn({ cap: 10, ledgerPath: ${JSON.stringify(ledger)} }, { kind: 'start', input: ${JSON.stringify(input)} }); ok += 1 } catch {}
      }
      process.stdout.write(String(ok))`
    const outputs = await Promise.all(Array.from({ length: 4 }, () => run(process.execPath, ['--input-type=module', '-e', script])))
    expect(outputs.reduce((sum, { stdout }) => sum + Number(stdout), 0)).toBe(10)
    expect(turnsInLedger()).toBe(10)
    expect(readdirSync(join(dir, 'ledger'))).toEqual(['turns.json'])
  }, 60_000)

  it('ignores orphan temp files from a crashed writer and steals a stale lock', async () => {
    mkdirSync(join(dir, 'ledger'), { recursive: true })
    writeFileSync(`${ledger}.999.dead.tmp`, '{"version":1,"turns":99')
    const staleLock = `${ledger}.lock`
    writeFileSync(staleLock, '')
    const old = new Date(Date.now() - 120_000)
    utimesSync(staleLock, old, old)
    const inner = fakeInner()
    await withRealTurnCap(inner, { cap: 1, ledgerPath: ledger }).start(input)
    expect(inner.calls.start).toBe(1)
    expect(turnsInLedger()).toBe(1)
    expect(existsSync(staleLock)).toBe(false)
  })

  it('fails closed when a live lock is never released', async () => {
    mkdirSync(join(dir, 'ledger'), { recursive: true })
    writeFileSync(`${ledger}.lock`, '')
    const inner = fakeInner()
    await expectRefusal(withRealTurnCap(inner, { cap: 1, ledgerPath: ledger }).start(input), 'ledger_unavailable')
    expect(inner.calls.start).toBe(0)
    expect(existsSync(ledger)).toBe(false)
  }, 30_000)
})

describe('host session over the capped runner (what the engine sees)', () => {
  it('refuses the second delivery, frees the session, and a retry is a real attempt that is refused again', async () => {
    const inner = fakeInner()
    const session = createOarSessionRunner({
      turn: withRealTurnCap(inner, { cap: 1, ledgerPath: ledger }),
      personaId: 'nina', model: 'haiku', permissionMode: 'deny',
    })
    const seen: string[] = []
    session.onEvent(event => seen.push(event.type))
    await session.ensureSession('worker-t1', 'C:/tmp', 'Tarefa', 'worker')
    await session.deliver('worker-t1', 'launch:a1', 'faça', 'queue')
    expect(inner.calls.start).toBe(1)

    const refusal = await session.deliver('worker-t1', 'input-2', 'mais uma', 'steer').then(() => undefined, (caught: unknown) => caught)
    expect(isRealTurnCapError(refusal)).toBe(true)
    // The engine stores String(error) as the delivery failure the person reads.
    expect(String(refusal)).toBe((refusal as RealTurnCapError).message)
    expect(String(refusal)).toMatch(/^Precisa de você: /u)
    expect(session.status('worker-t1')).toBe('idle')
    expect(seen.at(-1)).toBe('idle')

    // Same request again (queue retry): must NOT be swallowed as "already delivered".
    const again = await session.deliver('worker-t1', 'input-2', 'mais uma', 'steer').then(() => undefined, (caught: unknown) => caught)
    expect(isRealTurnCapError(again)).toBe(true)
    expect(inner.calls.start).toBe(1)
    expect(turnsInLedger()).toBe(1)
  })
})

describe('realTurnCapFromEnv', () => {
  it('is off (no effect) when the variable is unset, even if the ledger is set', () => {
    expect(realTurnCapFromEnv({})).toBeUndefined()
    expect(realTurnCapFromEnv({ [REAL_TURN_LEDGER_ENV]: ledger })).toBeUndefined()
  })

  it('reads an integer >= 1 and the ledger path', () => {
    expect(realTurnCapFromEnv({ [REAL_TURN_CAP_ENV]: '3', [REAL_TURN_LEDGER_ENV]: ledger })).toEqual({ cap: 3, ledgerPath: ledger })
    expect(realTurnCapFromEnv({ [REAL_TURN_CAP_ENV]: ' 2 ' })).toEqual({ cap: 2, ledgerPath: undefined })
  })

  it.each(['', '0', '-1', '1.5', 'abc', '1e3', '0x10'])('turns a set but invalid value (%j) into a refuse-all cap', (value) => {
    expect(realTurnCapFromEnv({ [REAL_TURN_CAP_ENV]: value, [REAL_TURN_LEDGER_ENV]: ledger })?.cap).toBe(0)
  })
})

function sayingRuntime() {
  const base = scriptedRuntime({ id: 'fake-cli', turn: (turn) => { turn.say('OK') } })
  return Object.assign(base, {
    installation: async () => ({ kind: 'available', via: 'bundled', version: '2.1.317 (fake-persona-e2e)' }),
    authStatus: async () => ({ kind: 'logged_in' }),
    listModels: async () => ({ kind: 'ok', models: [{ id: 'haiku' }, { id: 'scripted-1' }] }),
    accountUsage: async () => ({ windows: [] }),
  })
}

const dshAgent = (): DshAgentPort => ({
  start: async () => ({
    sessionId: 'dsh-1',
    events: (async function *() { yield { type: 'ended' as const, text: 'OK' } })(),
  }),
  resume: async () => ({ sessionId: 'dsh-1', events: (async function *() { yield { type: 'ended' as const, text: 'OK' } })() }),
  cancel: async () => undefined,
  usage: async () => ({ inputTokens: 1, outputTokens: 1 }),
})

describe('resolveRunner wiring', () => {
  it('real CLI runner: the cap applies before the CLI starts a turn', async () => {
    const runner = await resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'deny',
      runtime: sayingRuntime(),
      infra: { wait: async () => undefined },
      env: { [REAL_TURN_CAP_ENV]: '1', [REAL_TURN_LEDGER_ENV]: ledger },
    })
    const handle = await runner.start(input)
    for await (const event of runner.stream(handle)) void event
    await expectRefusal(runner.start(input), 'cap_reached')
    expect(turnsInLedger()).toBe(1)
  })

  it('without the variable the real CLI runner behaves as before and writes no ledger', async () => {
    const runner = await resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'deny',
      runtime: sayingRuntime(),
      infra: { wait: async () => undefined },
      env: { [REAL_TURN_LEDGER_ENV]: ledger },
    })
    for (let turn = 0; turn < 3; turn += 1) {
      const handle = await runner.start(input)
      for await (const event of runner.stream(handle)) void event
    }
    expect(existsSync(ledger)).toBe(false)
  })

  it('set but without a ledger path, the real CLI runner refuses every turn', async () => {
    const runner = await resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'deny',
      runtime: sayingRuntime(),
      infra: { wait: async () => undefined },
      env: { [REAL_TURN_CAP_ENV]: '5' },
    })
    await expectRefusal(runner.start(input), 'misconfigured')
  })

  it('dsh and the scripted triage stand-in ignore the cap', async () => {
    const env = { [REAL_TURN_CAP_ENV]: '1', [REAL_TURN_LEDGER_ENV]: ledger }
    const dsh = await resolveRunner({
      spec: { kind: 'dsh', model: 'deepseek-chat' } as never,
      permissionMode: 'deny',
      agent: dshAgent(),
      env,
    })
    for (let turn = 0; turn < 3; turn += 1) {
      const handle = await dsh.start(input)
      for await (const event of dsh.stream(handle)) void event
    }
    const triage = await resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'deny',
      runtime: sayingRuntime(),
      turnKind: 'triage',
      triageCallsAlready: 99,
      env,
    })
    await triage.start(input)
    await triage.start(input)
    expect(existsSync(ledger)).toBe(false)
  })

  it('prewarm opens the session without counting a turn', async () => {
    const inner = fakeInner()
    await withRealTurnCap(inner, { cap: 1, ledgerPath: ledger }).prime!(input)
    expect(existsSync(ledger)).toBe(false)
    expect(inner.calls.prime).toBe(1)
  })
})
