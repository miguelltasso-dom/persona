// Persona token gate step (OPT-2; Tally). Runs the faithful scripted scenarios against the frozen baseline.
// INFORMATIVE by default (Keel, 04/11): a failure prints `TOKEN_GATE_WARN failing=<scenarios>` and never fails the gate,
// unless PERSONA_TOKEN_GATE=block. A timeout or a crash of the step itself never fails the gate, even in block mode.
// Usage (persona-gate.mjs): const { failed } = tokenGateStep({ run, log }); if (failed) failing.add('persona-engine')
const TIMEOUT_MS = 60_000
const NL = String.fromCharCode(10)
const SCRIPT = 'packages/persona/persona-engine/scripts/gate-tokens.ts'

/**
 * @param {{ run: (cmd: string, args: string[], options?: object) => { status: number | null, stdout?: string, stderr?: string, error?: Error }, log: (message: string) => void, block?: boolean }} input
 * @returns {{ failed: boolean, status: 'ok' | 'warn' | 'timeout' | 'error' }}
 */
export function tokenGateStep({ run, log, block = process.env.PERSONA_TOKEN_GATE === 'block' }) {
  const result = run(process.execPath, ['--import', 'tsx/esm', SCRIPT], { timeout: TIMEOUT_MS })
  if (result.error !== undefined) {
    const timedOut = /ETIMEDOUT/u.test(String(result.error.code ?? result.error.message))
    log(`TOKEN_GATE_WARN ${timedOut ? 'timeout' : 'error'} (${result.error.message}); gate not affected`)
    return { failed: false, status: timedOut ? 'timeout' : 'error' }
  }
  if (result.status === 0) {
    log('token gate ok')
    return { failed: false, status: 'ok' }
  }
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`
  const summary = text.split(NL).find((line) => line.startsWith('TOKEN_GATE failing='))
  const failing = summary === undefined ? 'failing=unknown' : summary.slice('TOKEN_GATE '.length).trim()
  log(`TOKEN_GATE_WARN ${failing}${block ? ' (PERSONA_TOKEN_GATE=block)' : ' (informative)'}`)
  const detail = text.split(NL).filter((line) => line.startsWith('TOKEN_GATE ') && !line.startsWith('TOKEN_GATE failing=')).slice(0, 6)
  if (detail.length > 0) log(detail.join(NL))
  return { failed: block, status: 'warn' }
}
