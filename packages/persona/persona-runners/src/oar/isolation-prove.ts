/**
 * Prove, BEFORE a paid run, that a CLI environment mode is in force for the installed CLI (zero model: control requests only).
 *
 * A mode applies only when it is PROVEN for the installed version (`IsolationRuntime.decide`); a call of an unproven version runs native, which
 * for a measurement round means 377 thousand tokens of the person's environment and an invalid round. A real round calls this first and stops
 * before spending anything if the answer is no. (`scripts/image-cost-real.ts` did the same inline; the OPT-8b round uses this.)
 */

import type { Runtime } from '@botiverse/oar'
import { defaultIsolationRuntime, type IsolationRuntime } from './isolation-gate.ts'
import { cliEnvMode, type CallKind, type CliEnvMode } from './isolation.ts'

export interface IsolationProof {
  readonly ok: boolean
  /** The installed CLI version, when there is one. */
  readonly version?: string
  /** One sentence: what holds, or why it does not. */
  readonly reason: string
}

export interface PrewarmOptions {
  /** The model arguments the personas run with (`haiku`, `default`...). One parity proof each. */
  readonly modelArgs: readonly string[]
  readonly env?: NodeJS.ProcessEnv
  /** Tests inject the OAR runtime and the isolation runtime. */
  readonly runtime?: ProveOptions['runtime']
  readonly isolation?: ProveOptions['isolation']
}

export interface ProveOptions {
  readonly mode: CliEnvMode
  /** The model argument the persona runs with (`haiku`, `default`). */
  readonly modelArg: string
  readonly env: NodeJS.ProcessEnv
  /** The kind of call the round makes (default `answer`: no tools). */
  readonly call?: CallKind
  /** Tests inject the OAR runtime and the isolation runtime. */
  readonly runtime?: Pick<Runtime, 'installation'>
  readonly isolation?: (command: string) => IsolationRuntime
}

/**
 * @param options - The mode, the model and the environment the round will run with.
 * @returns `ok` only when the effective mode of a call of that kind is exactly the requested one. Never throws: a probe that cannot run (a
 *   logged-out account, a CLI that does not answer) is a "not proven" with its reason.
 */
export async function proveCliIsolation(options: ProveOptions): Promise<IsolationProof> {
  const runtime = options.runtime ?? (await import('@botiverse/oar')).defaultRuntimes.get('claude')
  let installation: Awaited<ReturnType<NonNullable<Runtime['installation']>>> | undefined
  try {
    installation = runtime?.installation === undefined ? undefined : await runtime.installation()
  } catch {
    installation = undefined
  }
  if (installation === undefined || installation.kind !== 'available' || installation.via !== 'executable') {
    return { ok: false, reason: 'o executável do claude não está disponível; nada foi gasto' }
  }
  const version = installation.version ?? 'unknown'
  const isolation = (options.isolation ?? defaultIsolationRuntime)(installation.command)
  try {
    await isolation.warm({ version, mode: options.mode, modelArg: options.modelArg, env: options.env })
  } catch (error) {
    const why = error instanceof Error ? error.message : 'a prova não pôde rodar'
    return { ok: false, version, reason: `não consegui provar ${options.mode} para o claude ${version} (${why}); parei antes de qualquer chamada de modelo` }
  }
  const decision = isolation.decide({ cli: 'claude', call: options.call ?? 'answer', modelArg: options.modelArg, version, env: options.env })
  return decision.effectiveMode === options.mode
    ? { ok: true, version, reason: `${options.mode} provado para o claude ${version}` }
    : { ok: false, version, reason: `${options.mode} NÃO está provado para o claude ${version} (${decision.reason}); parei antes de qualquer chamada de modelo` }
}

/**
 * Prove the environment mode for the models the personas run with, ahead of the first call (the host calls this once the CLI is detected, and
 * when its version changes), so that the first delivery of a fresh install does not even wait. Zero model. Sequential (each proof is a few
 * control sessions). Never throws; the result says which models are proven.
 * @param options - The model arguments and, in tests, the injected runtimes.
 */
export async function prewarmCliIsolation(options: PrewarmOptions): Promise<readonly { readonly modelArg: string; readonly proof: IsolationProof }[]> {
  const env = options.env ?? process.env
  const mode = cliEnvMode(env)
  const out: { modelArg: string; proof: IsolationProof }[] = []
  if (mode === 'native') return out
  for (const modelArg of new Set(options.modelArgs)) {
    out.push({ modelArg, proof: await proveCliIsolation({ mode, modelArg, env, ...(options.runtime === undefined ? {} : { runtime: options.runtime }), ...(options.isolation === undefined ? {} : { isolation: options.isolation }) }) })
  }
  return out
}
