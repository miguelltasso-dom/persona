/**
 * BYC layer 1 — parse/vault/dedup contracts (no browser).
 * UI layer 2: {@link ./mandatory-bring-your-context.spec.ts}.
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

describe('BYC — paste + vault parser (BRING-YOUR-CONTEXT §Organização + §Aceite 1–2)', () => {
  it('BYC-2/3 core: paste sections + sensitive/(incerto) + vault preview (persona-core)', () => {
    runVitestSubprocess('packages/persona/persona-core/tests/bring-context.spec.ts')
  }, 120_000)

  it('BYC host walk: .md in, .obsidian + logo.png ignored (persona-host)', () => {
    runVitestSubprocess('packages/persona/persona-host/tests/bring-context-walk.spec.ts')
  }, 120_000)

  it('BYC client UI unit: BringYourContextBlock (client-ui-persona)', () => {
    runVitestSubprocess('packages/persona/client-ui-persona/tests/bring-context-ui.client.spec.ts')
  }, 120_000)
})

describe('BYC — merge into Cofre (§Organização 3–4)', () => {
  it('core: dedupe + clash with a fixed decision becomes a question (decideBringApply)', () => {
    runVitestSubprocess('packages/persona/persona-core/tests/bring-context.spec.ts')
  }, 120_000)

  it('host: accept writes, discard skips, second apply is idempotent; reject never ingests', () => {
    runVitestSubprocess('packages/persona/persona-host/tests/bring-context-apply.spec.ts')
  }, 180_000)
})

const runGallery = process.env.PERSONA_E2E === '1' && process.env.PERSONA_CONTRACT_INCLUDE_GALLERY === '1'

describe.skipIf(!runGallery)('BYC — import surfaces gallery (layer 2)', () => {
  it.todo(
    '[Lumen+Probe] Importadores panel: bloco BYC visível após navegação galeria slug importar (sem stuck loading)',
  )
})
