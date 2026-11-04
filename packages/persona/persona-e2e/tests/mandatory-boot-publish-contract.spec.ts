/**
 * Publish gate step 4 (persona-gate.mjs + persona-boot-smoke.mjs): clean HOME tour contracts (keyless).
 * Browser replay: `node --import tsx/esm scripts/persona/persona-boot-smoke.mjs`.
 */
import { describe, expect, it } from 'vitest'
import { BOOT_GATE_CLEAN_HOME_TOUR } from '../src/boot-gate-bootstrap.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

describe('Publish boot — clean HOME tour (Atlas / Keel)', () => {
  it('lists nine first-run panels in Atlas order', () => {
    expect(BOOT_GATE_CLEAN_HOME_TOUR.map(p => p.slug)).toEqual([
      'visao-geral',
      'geral',
      'conexoes',
      'uso',
      'team-health',
      'org-chart',
      'kanban',
      'conhecimento',
      'aprovacoes',
    ])
  })

  it('maps every tour slug to a real-gallery nav panel with the same label', () => {
    const bySlug = new Map(REAL_GALLERY_PANELS.map(p => [p.slug, p]))
    for (const spec of BOOT_GATE_CLEAN_HOME_TOUR) {
      const gallery = bySlug.get(spec.slug)
      expect(gallery, `missing gallery panel ${spec.slug}`).toBeDefined()
      expect(gallery!.navLabel).toBe(spec.navLabel)
      if (spec.readySelector !== undefined) {
        expect(gallery!.readySelector).toBe(spec.readySelector)
      }
    }
  })

  it('bootstrap pageerror sanitize (boot-gate-sanitize)', () => {
    runVitestSubprocess('packages/persona/persona-e2e/tests/boot-gate-sanitize.spec.ts')
  }, 60_000)

  it('onboarding Playwright driver matches real-app step-1 placeholder', () => {
    runVitestSubprocess('packages/persona/persona-e2e/tests/playwright-onboarding-contract.spec.ts')
  }, 60_000)
})
