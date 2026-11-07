/**
 * (B) proof on the REAL Claude CLI, ZERO model call: on a FRESH install (nothing proven yet) the very first call must already be isolated.
 *
 * "Fresh" = an empty gate store: the process is started with TEMP/TMP pointing to an empty directory (the gate file lives under
 * `<tmpdir>/persona-cli-env/isolation-gate.json`), and the script refuses to run if that file already exists. It then asks `IsolationRuntime`
 * exactly what `resolve-runner` asks before the first delivery (`decide` -> `settle` -> `decide`) and prints the time the wait took.
 *
 *   TEMP=<empty dir> TMP=<empty dir> node --import tsx/esm packages/persona/persona-runners/scripts/first-call-isolated-real.ts [--out <file.json>]
 *
 * Control requests only: no prompt is sent to a model, nothing is spent. Run under `--lock real` like every real run.
 */

import { existsSync, writeFileSync } from 'node:fs'
import { defaultGatePath, defaultIsolationRuntime } from '../src/index.ts'

function argOf(name: string): string | undefined {
  const at = process.argv.indexOf(name)
  return at >= 0 ? process.argv[at + 1] : undefined
}

async function main(): Promise<void> {
  const gatePath = defaultGatePath()
  if (existsSync(gatePath)) throw new Error(`not a fresh install: ${gatePath} already exists (start with TEMP/TMP pointing to an empty directory)`)
  const env: NodeJS.ProcessEnv = { ...process.env, PERSONA_CLI_ENV: 'answer-only' }
  const oar = await import('@botiverse/oar')
  const runtime = oar.defaultRuntimes.get('claude')
  const installation = runtime?.installation === undefined ? undefined : await runtime.installation()
  if (installation === undefined || installation.kind !== 'available' || installation.via !== 'executable') throw new Error('the claude executable is not available')
  const version = installation.version ?? 'unknown'
  const isolation = defaultIsolationRuntime(installation.command)
  const call = { cli: 'claude', call: 'answer' as const, modelArg: 'haiku', version, env }

  const before = isolation.decide(call) // what the OLD code did on the first delivery (and it starts the proof in the background)
  const started = Date.now()
  await isolation.settle(call) // what resolve-runner does now: wait, bounded, for that proof
  const waitedMs = Date.now() - started
  const after = isolation.decide(call)
  const summary = {
    at: new Date().toISOString(), version, gatePath,
    beforeSettle: { effectiveMode: before.effectiveMode, reason: before.reason },
    waitedMs,
    afterSettle: { effectiveMode: after.effectiveMode, reason: after.reason },
    launchArgsOfTheFirstCall: after.effectiveMode === 'native' ? [] : after.plan.launchArgs,
    envOfTheFirstCall: after.effectiveMode === 'native' ? [] : Object.keys(after.plan.env).sort(),
    gateFileWritten: existsSync(gatePath),
    modelCalls: 0,
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  const out = argOf('--out')
  if (out !== undefined) writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`)
  if (after.effectiveMode !== 'answer-only') process.exitCode = 2
}

main().catch((error: unknown) => {
  process.stderr.write(`first-call-isolated-real: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
