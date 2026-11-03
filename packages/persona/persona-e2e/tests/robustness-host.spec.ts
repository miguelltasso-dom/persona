/**
 * Host robustness (Keel item 4) — reproduções de 1 comando para Anvil/Rivet.
 */
import { describe, expect, it } from 'vitest'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { E2E_TMP_ROOT } from '../src/paths.ts'
import { startWebHost } from '../src/web-host.ts'
import { probeFreePort } from '../src/ports.ts'

const runRobust = process.env.PERSONA_ROBUST === '1' || process.env.PERSONA_E2E === '1'

describe.skipIf(!runRobust)('host robustness', () => {
  it('Anvil: host stop + second boot on same disposable home yields URL', async () => {
    const home = join(E2E_TMP_ROOT, `robust-${randomUUID()}`)
    await mkdir(home, { recursive: true })
    const first = await startWebHost({ profile: 'persona', home })
    const url1 = first.url
    await first.stop()
    const second = await startWebHost({ profile: 'persona', home })
    try {
      expect(second.url).toMatch(/127\.0\.0\.1/)
      expect(url1).toMatch(/127\.0\.0\.1/)
    } finally {
      await second.stop()
      await rm(home, { recursive: true, force: true }).catch(() => {})
    }
  }, 360_000)

  it.todo('Anvil: truncated .db → VACUUM INTO / migration + mensagem pt-BR (no white screen)')
  it.todo('Rivet: porta ocupada → erro acionável em pt-BR')
  it.todo('Rivet: PERSONA_HOME inexistente ou sem permissão → falha loud antes do shell')
})

describe('robustness guard', () => {
  it('probeFreePort returns distinct ports', async () => {
    const a = await probeFreePort()
    const b = await probeFreePort()
    expect(a).not.toBe(b)
  })
})
