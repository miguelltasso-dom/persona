/**
 * One resolveRunner round per logged-in CLI (D-022). PERSONA_REAL_CLI=1.
 * Cheap models, short prompt, ≤10 execs/CLI. Never prints tokens.
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { restoreNativeCliLogin, runResolverSmoke } from '../src/index.ts'

function redact(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value).replace(
    /\b(?:sk-|tok-|key-|Bearer\s+)[A-Za-z0-9._-]{8,}\b/gu,
    '[redacted-secret]',
  ).replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, '[redacted-email]'))
}

if (process.env.PERSONA_REAL_CLI !== '1') {
  process.stderr.write('set PERSONA_REAL_CLI=1 to run resolver smokes\n')
  process.exit(2)
}

restoreNativeCliLogin()
const cwd = await mkdtemp(join(tmpdir(), 'persona-resolver-smoke-'))
const rows = await runResolverSmoke({ real: true, cwd })
process.stdout.write(`${JSON.stringify({
  probedAt: new Date().toISOString(),
  cwd,
  flag: 'PERSONA_REAL_CLI=1',
  note: 'one round via resolveRunner; token/email redacted; ≤10 execs/CLI',
  rows: redact(rows),
}, null, 2)}\n`)
process.exit(0)
