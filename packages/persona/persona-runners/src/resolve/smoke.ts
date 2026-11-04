/**
 * One resolver round per ready CLI (D-022). Cheap model, short prompt, ≤10 execs.
 */

import type { Runtime } from '@botiverse/oar'
import type { CliKind, RunEvent } from '../contract.ts'
import { RunnerResolveError } from './errors.ts'
import { detectConnections, resetConnectionCache, type DetectConnectionsOptions } from './connections.ts'
import { resolveRunner, type PersonaRunnerSpec } from './resolve-runner.ts'

export const RESOLVER_SMOKE_PROMPT = 'Responda só OK.'
export const RESOLVER_SMOKE_MAX_EXEC = 10

const CHEAP: Record<CliKind, string> = {
  claude: 'haiku',
  // OAR lists gpt-5.5, but ChatGPT Codex rejects it at turn start. `default` lets the CLI pick.
  codex: 'default',
  opencode: 'opencode/beam-free',
  cursor: 'default',
}

export interface ResolverSmokeRow {
  id: CliKind | 'dsh'
  execs: number
  firstTokenMs?: number
  done?: boolean
  lastState?: string
  summary?: string
  kinds?: readonly string[]
  usage?: { inputTokens: number; outputTokens: number }
  error?: { code: string; message: string }
  skipped?: string
}

export interface ResolverSmokeOptions {
  real?: boolean
  runtimes?: Partial<Record<CliKind, Runtime>>
  cwd?: string
  connections?: DetectConnectionsOptions
  /** Limit the round to these CLIs (Codex re-smoke). */
  only?: readonly CliKind[]
}

async function firstToken(events: AsyncIterable<RunEvent>, limitMs = 8_000): Promise<{
  firstTokenMs?: number
  done: boolean
  lastState?: string
  summary?: string
  kinds: string[]
}> {
  const started = Date.now()
  let firstTokenMs: number | undefined
  let done = false
  let lastState: string | undefined
  let summary: string | undefined
  const kinds: string[] = []
  for await (const event of events) {
    kinds.push(event.type)
    if (event.type === 'delta' && firstTokenMs === undefined) firstTokenMs = Date.now() - started
    if (event.type === 'ended') {
      lastState = event.report.state
      summary = event.report.summary
      done = event.report.state !== 'failed' && event.report.state !== 'dropped'
      break
    }
    if (Date.now() - started > limitMs) break
  }
  const timing: {
    firstTokenMs?: number
    done: boolean
    lastState?: string
    summary?: string
    kinds: string[]
  } = { done, kinds }
  if (firstTokenMs !== undefined) timing.firstTokenMs = firstTokenMs
  if (lastState !== undefined) timing.lastState = lastState
  if (summary !== undefined) timing.summary = summary
  return timing
}

/**
 * One turn per installed+logged-in CLI through `resolveRunner`.
 * @param options - Injected runtimes for tests; `real` for PERSONA_REAL_CLI.
 */
export async function runResolverSmoke(options: ResolverSmokeOptions = {}): Promise<ResolverSmokeRow[]> {
  if (options.real === true && process.env.PERSONA_REAL_CLI !== '1') {
    throw new Error('set PERSONA_REAL_CLI=1 to run real CLI smokes')
  }
  resetConnectionCache()
  const cards = await detectConnections({
    ...options.connections,
    force: true,
    ...(options.runtimes === undefined ? {} : { runtimes: options.runtimes }),
  })
  const rows: ResolverSmokeRow[] = []
  for (const card of cards) {
    const cli = card.id
    if (cli === 'dsh' || cli === 'ollama' || cli === 'lmstudio') continue
    if (options.only !== undefined && !options.only.includes(cli)) continue
    if (!card.installed) {
      const row: ResolverSmokeRow = { id: cli, execs: 0, skipped: 'cli_not_found' }
      if (card.error !== undefined) row.error = card.error
      rows.push(row)
      continue
    }
    if (!card.loggedIn) {
      rows.push({
        id: cli,
        execs: 0,
        error: card.error ?? {
          code: 'not_logged_in',
          message: new RunnerResolveError('not_logged_in', cli).message,
        },
      })
      continue
    }
    const spec: PersonaRunnerSpec = { kind: 'cli', cli, model: CHEAP[cli] }
    try {
      const runner = await resolveRunner({
        spec,
        permissionMode: 'allow-once',
        autonomy: 'act',
        ...(options.runtimes?.[cli] === undefined ? {} : { runtime: options.runtimes[cli] }),
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
        infra: { wait: async () => undefined },
      })
      const handle = await runner.start({
        ticketId: `smoke-${cli}`,
        assignmentId: 'resolver-round',
        personaId: 'smoke',
        cwd: options.cwd ?? process.cwd(),
        prompt: RESOLVER_SMOKE_PROMPT,
        model: CHEAP[cli],
        permissionMode: 'allow-once',
      })
      const timing = await firstToken(runner.stream(handle), options.real === true ? 60_000 : 2_000)
      const usage = await runner.usage(handle)
      const row: ResolverSmokeRow = {
        id: cli,
        execs: 1,
        done: timing.done,
        usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
        kinds: timing.kinds,
      }
      if (timing.firstTokenMs !== undefined) row.firstTokenMs = timing.firstTokenMs
      if (timing.lastState !== undefined) row.lastState = timing.lastState
      if (timing.summary !== undefined) row.summary = timing.summary
      rows.push(row)
    } catch (error) {
      if (error instanceof RunnerResolveError) {
        rows.push({ id: cli, execs: 0, error: { code: error.code, message: error.message } })
        continue
      }
      rows.push({
        id: cli,
        execs: 0,
        error: { code: 'failed', message: error instanceof Error ? error.message : String(error) },
      })
    }
  }
  return rows
}

export interface WarmPairTiming {
  firstTokenMs?: number
  totalMs: number
  done: boolean
  lastState?: string
  kinds: string[]
}

export interface WarmPairRow {
  pair: number
  first: WarmPairTiming
  second: WarmPairTiming
}

/**
 * 3 pairs: 1st message (CLI boot) + 2nd message on the same warm session.
 * @param options - Real CLI only; cheap model, short prompts.
 */
export async function runWarmPairSmoke(options: ResolverSmokeOptions & {
  pairs?: number
  cli?: CliKind
} = {}): Promise<WarmPairRow[]> {
  if (options.real === true && process.env.PERSONA_REAL_CLI !== '1') {
    throw new Error('set PERSONA_REAL_CLI=1 to run real CLI smokes')
  }
  resetConnectionCache()
  const cli = options.cli ?? 'claude'
  const pairs = options.pairs ?? 3
  const cwd = options.cwd ?? process.cwd()
  const spec: PersonaRunnerSpec = { kind: 'cli', cli, model: CHEAP[cli] }
  const rows: WarmPairRow[] = []
  for (let pair = 1; pair <= pairs; pair += 1) {
    const runner = await resolveRunner({
      spec,
      permissionMode: 'allow-once',
      purpose: 'talk',
      personId: `warm-${String(pair)}`,
      projectId: 'warm-smoke',
      cwd,
      autonomy: 'act',
      ...(options.runtimes?.[cli] === undefined ? {} : { runtime: options.runtimes[cli] }),
      infra: { wait: async () => undefined },
    })
    const turn = async (prompt: string, assignmentId: string): Promise<WarmPairTiming> => {
      const started = Date.now()
      const handle = await runner.start({
        ticketId: `warm-${cli}-${assignmentId}`,
        assignmentId,
        personaId: `warm-${String(pair)}`,
        cwd,
        prompt,
        model: CHEAP[cli],
        permissionMode: 'allow-once',
      })
      const timing = await firstToken(runner.stream(handle), options.real === true ? 60_000 : 2_000)
      const row: WarmPairTiming = {
        totalMs: Date.now() - started,
        done: timing.done,
        kinds: timing.kinds,
      }
      if (timing.firstTokenMs !== undefined) row.firstTokenMs = timing.firstTokenMs
      if (timing.lastState !== undefined) row.lastState = timing.lastState
      return row
    }
    const first = await turn(RESOLVER_SMOKE_PROMPT, `first-${String(pair)}`)
    const second = await turn('Responda só 2.', `second-${String(pair)}`)
    rows.push({ pair, first, second })
    if (runner.dispose !== undefined) await runner.dispose()
  }
  return rows
}
