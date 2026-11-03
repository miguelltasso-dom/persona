/**
 * 3 pairs of 1st vs 2nd message on the same Claude haiku session.
 * PERSONA_REAL_CLI=1. Short prompts. Never prints tokens.
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { restoreNativeCliLogin, runWarmPairSmoke } from '../src/index.ts'

function redact(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value).replace(
    /\b(?:sk-|tok-|key-|Bearer\s+)[A-Za-z0-9._-]{8,}\b/gu,
    '[redacted-secret]',
  ).replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, '[redacted-email]'))
}

if (process.env.PERSONA_REAL_CLI !== '1') {
  process.stderr.write('set PERSONA_REAL_CLI=1 to run warm-session smokes\n')
  process.exit(2)
}

restoreNativeCliLogin()
const cwd = await mkdtemp(join(tmpdir(), 'persona-warm-smoke-'))
const rows = await runWarmPairSmoke({
  real: true,
  cwd,
  cli: 'claude',
  pairs: 3,
})
process.stdout.write(`${JSON.stringify({
  probedAt: new Date().toISOString(),
  cwd,
  flag: 'PERSONA_REAL_CLI=1',
  note: '3 pairs: 1st message (boot) vs 2nd on the same warm Claude haiku session; token/email redacted',
  rows: redact(rows),
}, null, 2)}\n`)
process.exit(0)
