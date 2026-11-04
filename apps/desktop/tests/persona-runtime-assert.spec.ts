import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertPackedPersonaRuntime } from '../scripts/persona-runtime-assert.ts'

describe('packed Persona runtime assert', () => {
  it('fails when persona-app or client.js is missing and passes a complete tree', () => {
    const empty = mkdtempSync(join(tmpdir(), 'persona-rt-empty-'))
    expect(assertPackedPersonaRuntime(empty).ok).toBe(false)
    expect(assertPackedPersonaRuntime(empty).missing.length).toBeGreaterThan(0)

    const root = mkdtempSync(join(tmpdir(), 'persona-rt-ok-'))
    const app = join(root, 'node_modules/@deepseek-ai/dsh-persona-app')
    const ui = join(root, 'node_modules/@deepseek-ai/dsh-client-ui-persona/lib')
    mkdirSync(app, { recursive: true })
    mkdirSync(ui, { recursive: true })
    writeFileSync(join(app, 'package.json'), '{}')
    writeFileSync(join(app, 'cordis.patch.yml'), '- id: ui-persona\n')
    writeFileSync(join(root, 'node_modules/@deepseek-ai/dsh-client-ui-persona/package.json'), '{}')
    writeFileSync(join(ui, 'client.js'), 'export {}\n')
    expect(assertPackedPersonaRuntime(root)).toMatchObject({ ok: true, missing: [] })
  })
})
