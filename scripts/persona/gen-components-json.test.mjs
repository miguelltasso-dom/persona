// node --test scripts/persona/gen-components-json.test.mjs
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { componentManifest, PINNED_COMPONENTS } from './gen-components-json.mjs'

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'gen-components-json.mjs')
const tmp = () => mkdtempSync(join(tmpdir(), 'components-json-'))

test('a entrada fixada é o tar.gz do vosk-browser, com sha e tamanho medidos', () => {
  const [stt] = componentManifest().components
  assert.equal(stt.kind, 'stt')
  assert.equal(stt.url, 'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-pt-0.3.tar.gz')
  assert.equal(stt.sha256, '499771532fc4c5fc9d7657003a4193275c7f3561a6ccda9226f1d427c010887c')
  assert.equal(stt.bytes, 32_440_432)
  assert.equal(stt.format, 'tar.gz')
})

test('a entrada fixada vence uma entrada de release com o mesmo kind', () => {
  const evil = { ...PINNED_COMPONENTS[0], url: 'https://evil.invalid/x.tar.gz', sha256: 'b'.repeat(64), bytes: 1 }
  const manifest = componentManifest([evil])
  assert.equal(manifest.components.filter(entry => entry.kind === 'stt').length, 1)
  assert.equal(manifest.components[0].url, PINNED_COMPONENTS[0].url)
})

test('entradas do release entram junto', () => {
  const python = { kind: 'python', version: '1.1.1', url: 'https://example.invalid/python.zip', sha256: 'a'.repeat(64), bytes: 10 }
  const kinds = componentManifest([python]).components.map(entry => entry.kind)
  assert.deepEqual(kinds.sort(), ['python', 'stt'])
})

test('kind desconhecido, url http, sha curto e formato inválido são recusados', () => {
  const base = { kind: 'python', version: '1', url: 'https://example.invalid/x.zip', sha256: 'a'.repeat(64), bytes: 1 }
  assert.throws(() => componentManifest([{ ...base, kind: 'ruby' }]), /invalid kind/u)
  assert.throws(() => componentManifest([{ ...base, url: 'http://example.invalid/x.zip' }]), /invalid url/u)
  assert.throws(() => componentManifest([{ ...base, sha256: 'abc' }]), /invalid sha256/u)
  assert.throws(() => componentManifest([{ ...base, format: 'rar' }]), /invalid format/u)
})

test('o CLI escreve o manifesto que o Host aceita', () => {
  const dir = tmp()
  try {
    const out = join(dir, 'components.json')
    execFileSync(process.execPath, [CLI, '--out', out])
    const manifest = JSON.parse(readFileSync(out, 'utf8'))
    assert.equal(manifest.schemaVersion, 1)
    assert.equal(manifest.components[0].kind, 'stt')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('o CLI mescla um manifesto do release e mantém a entrada fixada', () => {
  const dir = tmp()
  try {
    const built = join(dir, 'built.json')
    writeFileSync(built, JSON.stringify({
      schemaVersion: 1,
      components: [
        { kind: 'python', version: '1', url: 'https://example.invalid/python.zip', sha256: 'a'.repeat(64), bytes: 1 },
        { kind: 'stt', version: 'evil', url: 'https://evil.invalid/x.tar.gz', sha256: 'b'.repeat(64), bytes: 1 },
      ],
    }))
    const out = join(dir, 'components.json')
    execFileSync(process.execPath, [CLI, '--from', built, '--out', out])
    const manifest = JSON.parse(readFileSync(out, 'utf8'))
    assert.deepEqual(manifest.components.map(entry => entry.kind).sort(), ['python', 'stt'])
    assert.equal(manifest.components.find(entry => entry.kind === 'stt').url, PINNED_COMPONENTS[0].url)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
