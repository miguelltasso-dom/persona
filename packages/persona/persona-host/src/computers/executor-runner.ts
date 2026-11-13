/**
 * D-116 / decision B (Keel 18:04): the persona runs on computer B as an EXECUTOR and the project stays on the owner's PC. This is B's side of the runner: the façade the `TurnExecutor` calls (`ComputersHostDeps.runner`).
 *
 * It resolves the persona's runner with B's OWN account and CLI (the same `resolveRunner` every persona of B uses, never a parallel path), in a scratch folder, with NO native tools (the product tools of the turn are proxies that go back
 * to A; a shell or an editor on B would be the persona touching a machine she was only lent). The engine A asked for is a HINT: honored when B has it, otherwise B's own engine runs. It keeps one runner per
 * (persona, engine, model, effort) warm between turns and lets go of them by the SAME policy as every other resident runner of the host (`warm-pool-policy.ts`: idle 15 min, 1 Task runner per persona, the ceiling by RAM), so a remote
 * persona can never be the 15 children nobody evicts.
 */

import {
  resolveRunner,
  type PersonaRunnerSpec, type ResolveRunnerOptions, type RunEvent, type RunHandle, type StartTurnInput, type TurnRunner,
} from '@deepseek-ai/dsh-persona-runners'
import { DEFAULT_WARM_LIMITS, planWarmEviction, type WarmEviction, type WarmEntry, type WarmLimits } from '../warm-pool-policy.ts'
import type { ExecutorSpec } from './executor-protocol.ts'
import type { ExecutorRunner } from './turn-executor.ts'

/** The CLIs a computer can have. */
export type ExecutorCli = 'claude' | 'codex' | 'cursor' | 'opencode'

/** The project id of the pool key: B has no project, the persona is only lent for the turn. */
export const EXECUTOR_PROJECT = 'remote'

/** What B needs for its façade. */
export interface ExecutorRunnerDeps {
  /** `resolveRunner` of persona-runners (the real one, or the plugin's slice, or a fake in tests). */
  readonly resolve: (options: ResolveRunnerOptions) => Promise<TurnRunner>
  /** The CLIs ready on THIS computer under its own account, preferred first. Empty = only an API engine could run. */
  readonly engines: () => readonly ExecutorCli[]
  /** The home of this computer's own account (never the owner's). */
  readonly home?: () => string | undefined
  readonly now?: () => number
}

interface Resident {
  readonly key: string
  readonly personaId: string
  readonly runner: TurnRunner
  lastUsedAt: number
  /** Turns open on it right now. */
  active: number
}

/** The reason a start cannot be served (the executor answers `no-runner`). */
export class ExecutorEngineError extends Error {
  readonly code = 'no-engine' as const
}

/** B's runner for the turns it lends the persona. */
export class ExecutorRunnerFacade implements ExecutorRunner {
  private readonly residents = new Map<string, Resident>()
  private readonly opening = new Map<string, Promise<Resident>>()
  private readonly byRun = new Map<string, Resident>()
  private readonly now: () => number
  private disposed = false

  /** @param deps - See {@link ExecutorRunnerDeps}. */
  constructor(private readonly deps: ExecutorRunnerDeps) {
    this.now = deps.now ?? Date.now
  }

  /**
   * The engine this turn runs on: the hint when B has it, else B's own first engine, else (only if A asked for an API engine) that one.
   * @param hint - What the persona asked for on the owner's PC.
   * @param input - The turn (model, effort).
   * @returns The spec, or `undefined` when this computer has nothing to run it with.
   */
  specFor(hint: ExecutorSpec | undefined, input: StartTurnInput): PersonaRunnerSpec | undefined {
    const engines = this.deps.engines()
    const effort = input.effort === undefined ? {} : { effort: input.effort }
    const cli = hint?.kind === 'cli' && hint.cli !== undefined && engines.includes(hint.cli) ? hint.cli : engines[0]
    if (cli !== undefined) return { kind: 'cli', cli, model: input.model, ...effort }
    return hint?.kind === 'dsh' ? { kind: 'dsh', model: input.model === '' ? 'default' : input.model } : undefined
  }

  async startTurn(input: StartTurnInput, hint?: ExecutorSpec): Promise<RunHandle> {
    if (this.disposed) throw new ExecutorEngineError('executor disposed')
    const spec = this.specFor(hint, input)
    if (spec === undefined) throw new ExecutorEngineError('no-engine')
    const resident = await this.residentFor(input, spec)
    resident.active += 1
    resident.lastUsedAt = this.now()
    try {
      const handle = await resident.runner.startTurn(input)
      this.byRun.set(handle.runId, resident)
      return handle
    } catch (error) {
      resident.active = Math.max(0, resident.active - 1)
      throw error
    }
  }

  async *stream(handle: RunHandle): AsyncIterable<RunEvent> {
    const resident = this.byRun.get(handle.runId)
    if (resident === undefined) return
    try {
      for await (const event of resident.runner.stream(handle)) {
        yield event
        if (event.type === 'ended') break
      }
    } finally {
      this.finish(handle, resident)
    }
  }

  async cancel(handle: RunHandle): Promise<void> {
    await this.byRun.get(handle.runId)?.runner.cancel(handle)
  }

  async steer(handle: RunHandle, requestId: string, text: string): Promise<boolean> {
    const runner = this.byRun.get(handle.runId)?.runner
    return runner?.steer === undefined ? false : runner.steer(handle, requestId, text)
  }

  capabilities(): unknown {
    return { engines: this.deps.engines(), nativeTools: 'none', images: false }
  }

  health(): Promise<{ readonly ok: boolean; readonly detail: string }> {
    const engines = this.deps.engines()
    return Promise.resolve(engines.length > 0 ? { ok: true, detail: `motores: ${engines.join(', ')}` } : { ok: false, detail: 'nenhum motor pronto neste computador' })
  }

  /** @returns The resident runners as the policy sees them (all are Task runners of the lent persona). */
  entries(): WarmEntry[] {
    return [...this.residents.values()].map(resident => ({
      key: resident.key, projectId: EXECUTOR_PROJECT, personaId: resident.personaId, kind: 'task' as const, lastUsedAt: resident.lastUsedAt, busy: resident.active > 0,
    }))
  }

  /** @returns How many runners are resident for lent personas (what the Station adds to its count). */
  resident(): number {
    return this.residents.size
  }

  /** @returns How many resident executor runners have an active turn right now. */
  busy(): number {
    return this.entries().filter(entry => entry.busy).length
  }

  /** @returns Resident executor CLIs for station RAM accounting (same shape as `WarmPool.warmClis`). */
  warmClis(): { readonly id: string; readonly idleSince: number }[] {
    const now = this.now()
    return this.entries().map(entry => ({ id: entry.key, idleSince: entry.busy ? now : entry.lastUsedAt }))
  }

  /**
   * Let go of what the policy says (idle past the TTL, past the persona's share). Never a runner with a turn open.
   * @param limits - Narrower limits (the host's cap by RAM, minus what its own runners use).
   * @returns What was evicted.
   */
  sweep(limits: Partial<WarmLimits> = {}): WarmEviction[] {
    const plan = planWarmEviction(this.entries(), this.now(), { ...DEFAULT_WARM_LIMITS, ...limits })
    for (const eviction of plan) this.drop(eviction.key)
    return plan
  }

  /**
   * Close one resident runner (and its CLI) through the one door.
   * @param key - Its key.
   */
  drop(key: string): void {
    const resident = this.residents.get(key)
    if (resident === undefined || resident.active > 0) return
    this.residents.delete(key)
    void Promise.resolve(resident.runner.dispose?.()).catch((error: unknown) => { void error })
  }

  /** The host is closing: every runner goes, a turn open or not, and any in-flight resolve is disposed once it returns. */
  async disposeAll(): Promise<void> {
    this.disposed = true
    const all = [...this.residents.values()]
    const inFlight = [...this.opening.values()]
    this.residents.clear()
    this.byRun.clear()
    await Promise.allSettled([...all.map(resident => resident.runner.dispose?.()), ...inFlight])
  }

  private async residentFor(input: StartTurnInput, spec: PersonaRunnerSpec): Promise<Resident> {
    if (this.disposed) throw new ExecutorEngineError('executor disposed')
    const engine = spec.kind === 'cli' ? spec.cli : 'dsh'
    const effort = spec.kind === 'cli' ? (spec.effort ?? '') : ''
    const key = `${EXECUTOR_PROJECT}:${input.personaId}:task:${engine}:${spec.model}:${effort}`
    const found = this.residents.get(key)
    if (found !== undefined) return found
    const pending = this.opening.get(key)
    if (pending !== undefined) return pending
    const home = this.deps.home?.()
    const created = (async (): Promise<Resident> => {
      const runner = await this.deps.resolve({
        spec,
        // the turn's own mode (never `prompt`: `resolveRunner` refuses it), closed when absent
        permissionMode: input.permissionMode ?? 'deny',
        // NO native tools: the product tools of the turn are proxies that go back to the owner's PC
        toolLevel: 'none',
        purpose: 'task',
        personId: input.personaId,
        projectId: EXECUTOR_PROJECT,
        cwd: input.cwd,
        ...(home === undefined || home === '' ? {} : { home }),
      })
      if (this.disposed) {
        await Promise.resolve(runner.dispose?.()).catch((error: unknown) => { void error })
        throw new ExecutorEngineError('executor disposed')
      }
      const existing = this.residents.get(key)
      if (existing !== undefined) {
        await Promise.resolve(runner.dispose?.()).catch((error: unknown) => { void error })
        return existing
      }
      const resident: Resident = { key, personaId: input.personaId, runner, lastUsedAt: this.now(), active: 0 }
      this.residents.set(key, resident)
      return resident
    })().finally(() => {
      this.opening.delete(key)
    })
    this.opening.set(key, created)
    return created
  }

  private finish(handle: RunHandle, resident: Resident): void {
    if (this.byRun.delete(handle.runId)) resident.active = Math.max(0, resident.active - 1)
    resident.lastUsedAt = this.now()
  }
}

/**
 * Create an executor runner facade over the host's CLI resolver.
 * @param deps - Engines, clock, home override, and optional runner resolver.
 * @returns Configured {@link ExecutorRunnerFacade}.
 */
export function createExecutorRunner(deps: Omit<ExecutorRunnerDeps, 'resolve'> & { readonly resolve?: ExecutorRunnerDeps['resolve'] }): ExecutorRunnerFacade {
  return new ExecutorRunnerFacade({ ...deps, resolve: deps.resolve ?? resolveRunner })
}
