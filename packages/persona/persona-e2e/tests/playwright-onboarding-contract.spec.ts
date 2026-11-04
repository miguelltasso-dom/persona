/**
 * Boot smoke onboarding driver stays aligned with {@link ../src/real-app-session.ts} (no hidden file input).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { onboarding } from '../src/real-app-locale.pt.ts'
import { REPO_ROOT } from '../src/paths.ts'

describe('playwright-onboarding.mjs (publish boot)', () => {
  it('uses step-1 placeholder, not generic input locator', () => {
    const source = readFileSync(join(REPO_ROOT, 'scripts/persona/playwright-onboarding.mjs'), 'utf8')
    expect(source).toContain(onboarding.step1Placeholder)
    expect(source).toContain('Descreva em linguagem natural ou cole um texto…')
    expect(source).not.toMatch(/locator\('input'\)\.first\(\)\.fill/)
  })

  it('mirrors onboarding step 3 and 5 titles (persona-spec/design/MICROCOPY.md)', () => {
    const source = readFileSync(join(REPO_ROOT, 'scripts/persona/playwright-onboarding.mjs'), 'utf8')
    expect(source).toContain(onboarding.step3Title)
    expect(source).toContain(onboarding.step5Title)
    expect(source).not.toContain('Harnesses detectados')
  })

  it('mirrors finish CTA (MICROCOPY: a Persona, feminino)', () => {
    const source = readFileSync(join(REPO_ROOT, 'scripts/persona/playwright-onboarding.mjs'), 'utf8')
    expect(source).toContain(onboarding.finish)
    expect(onboarding.finish).toBe('Entrar na Persona')
    expect(source).not.toContain('Entrar no Persona')
  })
})
