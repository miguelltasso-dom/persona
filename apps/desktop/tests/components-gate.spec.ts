import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { componentsGateOf } from '../scripts/components-gate.mjs'

// D-101 (item 20): the packaged app carries the manifest of on-demand components; without it the Host leaves the voice model 'unavailable'.
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

const SHA = '499771532fc4c5fc9d7657003a4193275c7f3561a6ccda9226f1d427c010887c'
const stt = { kind: 'stt', version: 'vosk-model-small-pt-0.3', url: 'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-pt-0.3.tar.gz', sha256: SHA, bytes: 32_440_432, format: 'tar.gz' }

function resourcesWith(manifest: unknown | undefined): string {
  const dir = mkdtempSync(join(tmpdir(), 'persona-components-gate-'))
  dirs.push(dir)
  mkdirSync(dir, { recursive: true })
  if (manifest !== undefined) writeFileSync(join(dir, 'components.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest))
  return dir
}

it('passes with a manifest that names the voice model with a pinned sha256 and an https URL', () => {
  const gate = componentsGateOf(resourcesWith({ schemaVersion: 1, components: [stt] }))
  expect(gate).toMatchObject({ present: true, ok: true, problems: [], stt: { version: 'vosk-model-small-pt-0.3', sha256: SHA, bytes: 32_440_432 } })
})

it('fails, naming what is missing, when the package has no components.json (the voice stays unavailable)', () => {
  const gate = componentsGateOf(resourcesWith(undefined))
  expect(gate.ok).toBe(false)
  expect(gate.present).toBe(false)
  expect(gate.problems.join('|')).toMatch(/components\.json is missing/u)
})

it('fails for a manifest that is not JSON, has no stt entry, or an stt entry that cannot be trusted', () => {
  expect(componentsGateOf(resourcesWith('{ not json')).problems.join('|')).toMatch(/not valid JSON/u)
  expect(componentsGateOf(resourcesWith({ schemaVersion: 1, components: [] })).problems.join('|')).toMatch(/no "stt" entry/u)
  expect(componentsGateOf(resourcesWith({ schemaVersion: 1, components: [{ ...stt, sha256: 'abc' }] })).problems.join('|')).toMatch(/sha256/u)
  expect(componentsGateOf(resourcesWith({ schemaVersion: 1, components: [{ ...stt, url: 'http://insecure.example/model.tar.gz' }] })).problems.join('|')).toMatch(/https/u)
  expect(componentsGateOf(resourcesWith({ schemaVersion: 1, components: [{ ...stt, bytes: 0 }] })).problems.join('|')).toMatch(/bytes/u)
  expect(componentsGateOf(resourcesWith({ schemaVersion: 2, components: [stt] })).problems.join('|')).toMatch(/schemaVersion/u)
})
