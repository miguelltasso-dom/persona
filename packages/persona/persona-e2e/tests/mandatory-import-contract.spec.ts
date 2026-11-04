/**
 * F1 — official + synthetic importers (PLAN fechamento v1). No browser.
 * Real Miguel samples stay skip until PERSONA_REAL_IMPORTS is set.
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

describe('F1 — importadores (Forge)', () => {
  it('official fixtures: ChatGPT / Claude / Obsidian / Gemini / Grok (presumed schema)', () => {
    runVitestSubprocess('packages/persona/persona-core/tests/official-import.spec.ts')
  }, 120_000)

  it('framework: preview / dedupe / rollback / secret refused (persona-core)', () => {
    runVitestSubprocess('packages/persona/persona-core/tests/import.spec.ts')
  }, 120_000)
})
