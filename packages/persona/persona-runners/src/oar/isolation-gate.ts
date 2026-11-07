/**
 * The gate of the isolation (ISO-1, D-085): a mode is only APPLIED to a call when it was PROVEN, for this version of the CLI, by
 * the dry probes (`isolation-run.ts`). Otherwise the call runs `native` (fail-safe) and the reason is recorded.
 *
 *  - verdict per CLI version: the isolated launch came up isolated, with the login intact (re-proven whenever the version changes:
 *    the effect of the flags is observed behaviour of a version, not a documented guarantee);
 *  - parity per (version, model, settings fingerprint): the isolated launch applies the SAME model and effort the native one does,
 *    and the explicit `--model`/`--effort` that guarantee it. The fingerprint changes when the person edits their settings.
 *
 * `decide` is SYNCHRONOUS (it only reads the gate), so a chat reply never waits for a probe: an unproven combination runs
 * `native` this time and is verified in the background for the next. The host can `await runtime.warm()` at start to avoid even that.
 * Everything stored is a verdict and argument strings: no connector name, no account, no secret.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ConnectorUnreachedReason } from '../contract.ts'
import { openClaudeControl, type OpenControl } from './claude-control.ts'
import { unreachedReasonOf } from './connector-reach.ts'
import { cliEnvMode, isolationPlan, type CallKind, type CliEnvMode, type IsolationLevel, type IsolationPlan } from './isolation.ts'
import { probeConnector, probeCwd, probeParity, probeSkills, runIsolationProbe, type ConnectorProbe, type SkillsProbe } from './isolation-run.ts'

export type GateVerdict = 'ok' | 'failed' | 'unknown'

interface VerdictRecord { readonly ok: boolean; readonly failures: readonly string[]; readonly at: string }
interface ParityRecord { readonly ok: boolean; readonly extraArgs: readonly string[]; readonly at: string }
interface ConnectorRecord extends ConnectorProbe { readonly at: string }
interface SkillsRecord extends SkillsProbe { readonly at: string }
interface GateFile { verdicts: Record<string, VerdictRecord>; parity: Record<string, ParityRecord>; connectors: Record<string, ConnectorRecord>; skills: Record<string, SkillsRecord> }

/** Where the gate persists. Injected in tests; the default is a JSON file. */
export interface GateIo {
  read(): string | undefined
  write(text: string): void
}

/**
 * A file-backed gate store.
 * @param path - JSON file.
 */
export function fileGateIo(path: string): GateIo {
  return {
    read: () => (existsSync(path) ? readFileSync(path, 'utf8') : undefined),
    write: (text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text) },
  }
}

/** The default location: next to the empty CLI config roots the product already keeps. */
export function defaultGatePath(): string {
  return join(tmpdir(), 'persona-cli-env', 'isolation-gate.json')
}

/** The proven results. */
export class IsolationGate {
  private readonly io: GateIo
  private readonly now: () => string
  private data: GateFile | undefined

  constructor(io: GateIo, now: () => string = () => new Date().toISOString()) {
    this.io = io
    this.now = now
  }

  private load(): GateFile {
    if (this.data !== undefined) return this.data
    let parsed: Partial<GateFile> = {}
    try {
      const text = this.io.read()
      if (text !== undefined) parsed = JSON.parse(text) as Partial<GateFile>
    } catch (error) {
      void error // a corrupt gate proves nothing: start empty (fail-safe)
    }
    this.data = { verdicts: parsed.verdicts ?? {}, parity: parsed.parity ?? {}, connectors: parsed.connectors ?? {}, skills: parsed.skills ?? {} }
    return this.data
  }

  private save(): void {
    try { this.io.write(JSON.stringify(this.load(), null, 2)) } catch (error) { void error }
  }

  /**
   * @param version - The CLI version string.
   * @param mode - The mode that was asked. A proof for `needed` also covers `answer-only`.
   */
  verdict(version: string, mode: CliEnvMode): GateVerdict {
    const { verdicts } = this.load()
    const own = verdicts[`${version}|${mode}`]
    const wider = mode === 'answer-only' ? verdicts[`${version}|needed`] : undefined
    if (own?.ok === false || wider?.ok === false) return 'failed'
    return own?.ok === true || wider?.ok === true ? 'ok' : 'unknown'
  }

  recordVerdict(version: string, mode: CliEnvMode, run: { readonly ok: boolean; readonly failures: readonly string[] }): void {
    this.load().verdicts[`${version}|${mode}`] = { ok: run.ok, failures: run.failures, at: this.now() }
    this.save()
  }

  parity(key: string): ParityRecord | undefined {
    return this.load().parity[key]
  }

  recordParity(key: string, result: { readonly ok: boolean; readonly extraArgs: readonly string[] }): void {
    this.load().parity[key] = { ok: result.ok, extraArgs: result.extraArgs, at: this.now() }
    this.save()
  }

  /** HT-11: what the pre-flight found for the personal-skills folder on one CLI version. */
  skills(version: string): SkillsRecord | undefined {
    return this.load().skills[version]
  }

  recordSkills(version: string, probe: SkillsProbe): void {
    this.load().skills[version] = { ...probe, at: this.now() }
    this.save()
  }

  /** ISO-5: what the pre-flight found for one connector on one CLI version (keyed by the HASH of its URL, never the URL). */
  connector(key: string): ConnectorRecord | undefined {
    return this.load().connectors[key]
  }

  recordConnector(key: string, probe: ConnectorProbe): void {
    this.load().connectors[key] = { ...probe, at: this.now() }
    this.save()
  }
}

/**
 * Identity of the person's settings as far as the model and effort go: it changes when they edit the file.
 * @param env - Where `CLAUDE_CONFIG_DIR` is read.
 */
export function settingsFingerprint(env: NodeJS.ProcessEnv = process.env): string {
  const path = join(env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'settings.json')
  try {
    const info = statSync(path)
    return `${String(Math.round(info.mtimeMs))}:${String(info.size)}`
  } catch (error) {
    void error
    return 'none'
  }
}

/** ISO-5: a connector is proven per CLI version. Only a hash of its URL is stored. */
export function connectorKey(version: string, url: string): string {
  return `${version}|${createHash('sha256').update(url).digest('hex').slice(0, 16)}`
}

/** Parity is proven per version, per configured model and per state of the person's settings. */
export function parityKey(version: string, modelArg: string, fingerprint: string): string {
  return `${version}|${modelArg === '' ? 'default' : modelArg}|${fingerprint}`
}

export type DecisionReason = 'off' | 'not-applicable' | 'ungated' | 'verified' | 'unverified' | 'failed-version' | 'parity-unproven' | 'parity-failed' | 'connector-unreached'

/** What a call actually runs with. */
export interface IsolationDecision {
  /** What the switch asked for. */
  readonly requestedMode: CliEnvMode
  /** What the call RUNS with: the requested mode only when proven; `native` otherwise (fail-safe). */
  readonly effectiveMode: CliEnvMode
  /** The plan to apply (empty when `native`). */
  readonly plan: IsolationPlan
  /** `--model`/`--effort` that keep the person's model and effort unchanged under the plan. */
  readonly extraArgs: readonly string[]
  readonly reason: DecisionReason
}

export interface DecideInput {
  readonly cli: string
  readonly call: CallKind
  /** The model the persona is configured with (`default` = the person's own default). */
  readonly modelArg: string
  /** The CLI version string; `undefined` = unknown (never proven). */
  readonly version: string | undefined
  readonly env: NodeJS.ProcessEnv
  readonly productConfigRoot?: string
  /** ISO-5: proxy URLs of account connectors already PROVEN usable for this call (see {@link IsolationRuntime.connectorsReady}). */
  readonly accountConnectors?: readonly string[]
  /** HT-11: the product's folder of pointers to the person's skills, already PROVEN usable for this CLI version (see {@link IsolationRuntime.skillsReady}). */
  readonly personalSkills?: string
}

export interface IsolationRuntimeDeps {
  readonly gate: IsolationGate
  readonly open: OpenControl
  /** Fingerprint of the person's settings (default {@link settingsFingerprint}). */
  readonly fingerprint?: (env: NodeJS.ProcessEnv) => string
  /** Called with a short message when a background verification fails to RUN (never with names). */
  readonly onError?: (message: string) => void
  /** How long a probe waits for the account connectors to arrive (they come 1–3 s after start), and the pause before the last look. */
  readonly timing?: { readonly arriveMs?: number; readonly pauseMs?: number }
  /** Clock for the retry back-off (tests). */
  readonly now?: () => number
  /** After a probe could not RUN (CLI missing, timeout), do not try again for this long (default 10 min). */
  readonly retryAfterMs?: number
  /** ISO-5: how long a connector pre-flight may take before the connector is treated as unavailable for this call (default 40 s). */
  readonly connectorTimeoutMs?: number
  /**
   * How long the FIRST calls of an unproven CLI version wait for the proof before they run native (default 45 s), counted from the START of the
   * proof, not of each call. Measured on the real CLI (2.1.318, cold, 05/11): verdict 13 s + parity 3.6 s = about 16 s. See {@link IsolationRuntime.settle}.
   */
  readonly settleMs?: number
}

/** Decides per call and verifies in the background. */
export class IsolationRuntime {
  private readonly deps: IsolationRuntimeDeps
  private readonly inflight = new Map<string, Promise<void>>()
  /** When each running proof started (real clock): `settle` waits until that instant plus its limit, so a batch of first calls waits once, not once each. */
  private readonly startedAt = new Map<string, number>()
  private readonly failedAt = new Map<string, number>()
  private readonly connectorJobs = new Map<string, Promise<ConnectorProbe | undefined>>()
  private readonly skillsJobs = new Map<string, Promise<SkillsProbe | undefined>>()

  constructor(deps: IsolationRuntimeDeps) {
    this.deps = deps
  }

  /**
   * Synchronous: reads the gate, never probes. An unproven combination returns `native` and starts a background verification.
   * @param input - The call.
   */
  decide(input: DecideInput): IsolationDecision {
    const requested = cliEnvMode(input.env)
    const wanted = isolationPlan(input.cli, {
      env: input.env, call: input.call,
      ...(input.productConfigRoot === undefined ? {} : { productConfigRoot: input.productConfigRoot }),
      ...(input.accountConnectors === undefined ? {} : { accountConnectors: input.accountConnectors }),
      ...(input.personalSkills === undefined ? {} : { personalSkills: input.personalSkills }),
    })
    const off = (reason: DecisionReason): IsolationDecision => ({
      requestedMode: requested, effectiveMode: 'native', plan: isolationPlan(input.cli, { env: { PERSONA_CLI_ENV: 'native' }, call: input.call }), extraArgs: [], reason,
    })
    if (requested === 'native') return off('off')
    // Only a plan that changes the launch needs proof; Codex/Cursor run as before.
    if (wanted.launchArgs.length === 0 && Object.keys(wanted.env).length === 0) return off('not-applicable')
    // Only Claude has a probe. Anything else that would change the launch stays native until it has one.
    if (input.cli !== 'claude' || input.version === undefined) return off('unverified')
    const verdict = this.deps.gate.verdict(input.version, requested)
    if (verdict === 'failed') return off('failed-version')
    if (verdict === 'unknown') {
      this.verifyInBackground({ version: input.version, mode: requested, modelArg: input.modelArg, env: input.env })
      return off('unverified')
    }
    const key = parityKey(input.version, input.modelArg, (this.deps.fingerprint ?? settingsFingerprint)(input.env))
    const parity = this.deps.gate.parity(key)
    if (parity === undefined) {
      this.verifyInBackground({ version: input.version, mode: requested, modelArg: input.modelArg, env: input.env })
      return off('parity-unproven')
    }
    if (!parity.ok) return off('parity-failed')
    return { requestedMode: requested, effectiveMode: requested, plan: wanted, extraArgs: parity.extraArgs, reason: 'verified' }
  }

  /**
   * Let the FIRST call of an unproven CLI version run isolated instead of native. `decide` is synchronous and, for something unproven, starts the
   * proof in the background and answers `native`: on a fresh install that made the very first call (the onboarding delivery) carry the person's whole
   * environment (measured: 308.9 thousand tokens in one request, 05/11). This starts the same proof (if `decide` would) and WAITS for it, but only up
   * to `settleMs` (default 45 s) COUNTED FROM THE START OF THE PROOF: the calls of a first delivery that start together wait for the same proof, and a
   * proof that has already run longer than that (slow, hung) holds nobody any more. A proof that cannot run (logged out, no CLI) changes nothing: the
   * call runs native exactly as before (fail-safe) and the proof keeps going in the background. Once per CLI version/model: afterwards `decide` finds
   * the verdict at once. Never throws.
   * @param input - The call that is about to be made.
   * @param waitMs - Longest wait since the proof started (default `settleMs`).
   */
  async settle(input: DecideInput, waitMs?: number): Promise<void> {
    if (input.version === undefined || input.cli !== 'claude') return
    const mode = cliEnvMode(input.env)
    if (mode === 'native') return
    this.decide(input) // starts the proof when something is unproven (and honours the back-off after a failure to run)
    const key = `${input.version}|${mode}|${input.modelArg}`
    const job = this.inflight.get(key)
    if (job === undefined) return
    const left = (this.startedAt.get(key) ?? Date.now()) + (waitMs ?? this.deps.settleMs ?? 45_000) - Date.now()
    if (left <= 0) return
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([job, new Promise<void>((resolve) => { timer = setTimeout(resolve, left) })])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  /**
   * Run the probes for a version/model now and record the result.
   * @param input - What to prove.
   */
  async verify(input: { readonly version: string; readonly mode: CliEnvMode; readonly modelArg: string; readonly env: NodeJS.ProcessEnv }): Promise<void> {
    const cwd = probeCwd()
    try {
      if (this.deps.gate.verdict(input.version, input.mode) === 'unknown') {
        const calls: CallKind[] = input.mode === 'needed' ? ['answer', 'task'] : ['answer']
        const run = await runIsolationProbe(this.deps.open, { mode: input.mode, calls, cwd: cwd.dir, ...(this.deps.timing ?? {}) })
        // A logged-out account is a problem of the SESSION, not a behaviour of this CLI version: do not condemn the version for it.
        if (run.rows.some(row => row.failures.includes('not-logged-in'))) throw new Error('isolation probe: account not logged in')
        this.deps.gate.recordVerdict(input.version, input.mode, { ok: run.ok, failures: run.rows.flatMap(row => row.failures) })
      }
      if (this.deps.gate.verdict(input.version, input.mode) === 'ok') {
        const key = parityKey(input.version, input.modelArg, (this.deps.fingerprint ?? settingsFingerprint)(input.env))
        if (this.deps.gate.parity(key) === undefined) {
          const parity = await probeParity(this.deps.open, { modelArg: input.modelArg, cwd: cwd.dir })
          this.deps.gate.recordParity(key, { ok: parity.ok, extraArgs: parity.extraArgs })
        }
      }
    } finally {
      cwd.dispose()
    }
  }

  private verifyInBackground(input: { readonly version: string; readonly mode: CliEnvMode; readonly modelArg: string; readonly env: NodeJS.ProcessEnv }): void {
    const key = `${input.version}|${input.mode}|${input.modelArg}`
    if (this.inflight.has(key)) return
    const now = (this.deps.now ?? Date.now)()
    const failed = this.failedAt.get(key)
    if (failed !== undefined && now - failed < (this.deps.retryAfterMs ?? 10 * 60_000)) return
    const job = this.verify(input).catch((error: unknown) => {
      // The probe itself could not run (CLI missing, timeout): stay native and do not hammer it; try again after the back-off.
      this.failedAt.set(key, (this.deps.now ?? Date.now)())
      this.deps.onError?.(error instanceof Error ? error.message : 'isolation probe failed')
    }).finally(() => { this.inflight.delete(key); this.startedAt.delete(key) })
    this.inflight.set(key, job)
    this.startedAt.set(key, Date.now())
  }

  /**
   * ISO-5: which of the account connectors a call needs are USABLE on this CLI version. An unknown one is proven now (the call needs it:
   * a few seconds, once per version and connector) with the pre-flight; one that is not usable (needs-auth, gone, many, no login, a probe
   * that cannot run) is dropped and the call runs at the floor with the rest. Never throws.
   * @param input - The CLI version and the proxy URLs the router chose.
   */
  async connectorsReady(input: { readonly version: string | undefined; readonly urls: readonly string[] }): Promise<{ readonly usable: readonly string[]; readonly dropped: number }> {
    if (input.version === undefined || input.urls.length === 0) return { usable: [], dropped: input.urls.length }
    const usable: string[] = []
    for (const url of new Set(input.urls)) {
      const record = await this.connectorProbe(input.version, url)
      if (record?.ok === true) usable.push(url)
    }
    return { usable, dropped: new Set(input.urls).size - usable.length }
  }

  /**
   * D-096: {@link IsolationRuntime.connectorsReady} plus WHY each connector that is not usable is not (codes only; the URL stays here, the caller maps it to a position). Same proof, same
   * cache, same costs; `connectorsReady` itself is unchanged.
   * @param input - The CLI version and the connectors' proxy URLs.
   */
  async connectorsReach(input: { readonly version: string | undefined; readonly urls: readonly string[] }): Promise<{ readonly usable: readonly string[]; readonly dropped: number; readonly unreached: readonly { readonly url: string; readonly reason: ConnectorUnreachedReason }[] }> {
    const urls = [...new Set(input.urls)]
    const usable: string[] = []
    const unreached: { url: string; reason: ConnectorUnreachedReason }[] = []
    for (const url of urls) {
      // An unknown CLI version cannot be proven: the connector could not be confirmed, which is a `failed` for the caller.
      const record = input.version === undefined ? undefined : await this.connectorProbe(input.version, url)
      const reason = input.version === undefined ? 'failed' : unreachedReasonOf(record)
      if (reason === undefined) usable.push(url)
      else unreached.push({ url, reason })
    }
    return { usable, dropped: urls.length - usable.length, unreached }
  }

  /**
   * ISO-5: what one connector costs per call and whether it works, for the screen BEFORE the person confirms ("a Nina vai gastar ~+X%
   * por chamada"). Control requests only (zero model). `undefined` when it could not be measured: the screen then writes no number.
   * @param input - The CLI version and the connector's proxy URL.
   */
  async connectorCostOf(input: { readonly version: string | undefined; readonly url: string }): Promise<ConnectorProbe | undefined> {
    if (input.version === undefined) return undefined
    return this.connectorProbe(input.version, input.url)
  }

  /**
   * HT-11: is the person's-skills folder usable on this CLI version (it adds the person's skills and nothing else)? Proven once per version
   * (inline, a few seconds, zero model); a "no" is re-checked after 5 minutes. Never throws; unknown version = no.
   * @param input - The CLI version and the product's folder of pointers.
   */
  async skillsReady(input: { readonly version: string | undefined; readonly root: string }): Promise<SkillsProbe | undefined> {
    if (input.version === undefined) return undefined
    const version = input.version
    const now = (this.deps.now ?? Date.now)()
    const known = this.deps.gate.skills(version)
    if (known !== undefined && (known.ok || !(now - Date.parse(known.at) >= 5 * 60_000))) return known
    const running = this.skillsJobs.get(version)
    if (running !== undefined) return running
    const job = (async (): Promise<SkillsProbe | undefined> => {
      const cwd = probeCwd()
      try {
        const timeoutMs = this.deps.connectorTimeoutMs ?? 40_000
        const result = await Promise.race([
          probeSkills(this.deps.open, { root: input.root, cwd: cwd.dir }),
          new Promise<undefined>((resolve) => { setTimeout(() => { resolve(undefined) }, timeoutMs) }),
        ])
        if (result !== undefined) this.deps.gate.recordSkills(version, result)
        return result
      } catch (error) {
        this.deps.onError?.(error instanceof Error ? error.message : 'skills probe failed')
        return undefined
      } finally {
        cwd.dispose()
        this.skillsJobs.delete(version)
      }
    })()
    this.skillsJobs.set(version, job)
    return job
  }

  private async connectorProbe(version: string, url: string): Promise<ConnectorProbe | undefined> {
    const key = connectorKey(version, url)
    const now = (this.deps.now ?? Date.now)()
    const known = this.deps.gate.connector(key)
    // A proof of "usable" holds for the version; a "not usable" one is re-checked soon (the person may authenticate or reconnect it).
    if (known !== undefined) {
      const age = now - Date.parse(known.at)
      if (known.ok || !(age >= 5 * 60_000)) return known
    }
    const running = this.connectorJobs.get(key)
    if (running !== undefined) return running
    const job = (async (): Promise<ConnectorProbe | undefined> => {
      const cwd = probeCwd()
      try {
        const timeoutMs = this.deps.connectorTimeoutMs ?? 40_000
        const result = await Promise.race([
          probeConnector(this.deps.open, { url, cwd: cwd.dir, ...(this.deps.timing ?? {}) }),
          new Promise<undefined>((resolve) => { setTimeout(() => { resolve(undefined) }, timeoutMs) }),
        ])
        if (result !== undefined) this.deps.gate.recordConnector(key, result)
        return result
      } catch (error) {
        this.deps.onError?.(error instanceof Error ? error.message : 'connector probe failed')
        return undefined
      } finally {
        cwd.dispose()
        this.connectorJobs.delete(key)
      }
    })()
    this.connectorJobs.set(key, job)
    return job
  }

  /** Resolves when every background verification started so far has finished (tests; the host can await it at start). */
  async idle(): Promise<void> {
    while (this.inflight.size > 0) await Promise.all([...this.inflight.values()])
  }

  /**
   * Prove a version/model ahead of the first call (the host calls it at start and when the CLI version changes).
   * @param input - What to prove.
   */
  async warm(input: { readonly version: string; readonly mode: CliEnvMode; readonly modelArg: string; readonly env: NodeJS.ProcessEnv }): Promise<void> {
    await this.verify(input)
  }
}

const defaults = new Map<string, IsolationRuntime>()

/**
 * Port for the host (HT-9/ISO-5): the isolation level the product DELIVERS NOW for a call with tools, counting the proof. {@link cliIsolation} says what the plan
 * is configured to do; but a plan that changes the launch (Claude, OpenCode) is applied only once PROVEN for the installed CLI version (`IsolationRuntime`), and
 * until then — and for a CLI that has no probe — the call runs native. Saying `full` for a launch that runs native would claim an isolation that is not there, so
 * this one downgrades to `none` in those cases. Synchronous; reads the gate store, never probes.
 * @param cli - CLI id.
 * @param options - `version` the installed CLI reports (without it Claude cannot be proven), `env` (default `process.env`), `gate` (tests inject).
 */
export function cliIsolationProven(cli: string, options: { readonly version?: string; readonly env?: NodeJS.ProcessEnv; readonly gate?: Pick<IsolationGate, 'verdict'> } = {}): IsolationLevel {
  const env = options.env ?? process.env
  const plan = isolationPlan(cli, { env, call: 'task' })
  const changesLaunch = plan.launchArgs.length > 0 || Object.keys(plan.env).length > 0
  if (!changesLaunch) return plan.level // nothing to prove: Codex `partial` and Cursor `none` run as the plan says
  const mode = cliEnvMode(env)
  if (cli !== 'claude' || options.version === undefined || mode === 'native') return 'none' // no probe for another CLI: it runs native until it has one
  const gate = options.gate ?? new IsolationGate(fileGateIo(defaultGatePath()))
  return gate.verdict(options.version, mode) === 'ok' ? plan.level : 'none'
}

/**
 * The process-wide runtime for a real CLI executable: file-backed gate, real control client. One per executable.
 * @param command - The `claude` executable the installation reported.
 */
export function defaultIsolationRuntime(command: string): IsolationRuntime {
  const known = defaults.get(command)
  if (known !== undefined) return known
  const created = new IsolationRuntime({ gate: new IsolationGate(fileGateIo(defaultGatePath())), open: openClaudeControl(command) })
  defaults.set(command, created)
  return created
}
