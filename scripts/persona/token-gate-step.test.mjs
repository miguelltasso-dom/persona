// node --test scripts/persona/token-gate-step.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { tokenGateStep } from './token-gate-step.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const collect = () => {
  const lines = []
  return { lines, log: (message) => lines.push(message) }
}

test('pass: logs ok and never fails the gate', () => {
  const { lines, log } = collect()
  const result = tokenGateStep({ run: () => ({ status: 0, stdout: 'TOKEN_GATE ok\n' }), log, block: true })
  assert.deepEqual(result, { failed: false, status: 'ok' })
  assert.deepEqual(lines, ['token gate ok'])
})

test('fail: informative by default, warns with the failing scenarios', () => {
  const { lines, log } = collect()
  const run = () => ({
    status: 1,
    stdout: 'TOKEN_GATE failing=padaria-lua,multi-review\n',
    stderr: 'TOKEN_GATE padaria-lua tokens: 3000 > 2488 (+20.6%)\n',
  })
  const result = tokenGateStep({ run, log, block: false })
  assert.deepEqual(result, { failed: false, status: 'warn' })
  assert.match(lines[0], /^TOKEN_GATE_WARN failing=padaria-lua,multi-review \(informative\)$/u)
  assert.match(lines[1], /padaria-lua tokens/u)
})

test('fail: blocks only when PERSONA_TOKEN_GATE=block', () => {
  const { lines, log } = collect()
  const result = tokenGateStep({ run: () => ({ status: 1, stdout: 'TOKEN_GATE failing=idle-routines\n' }), log, block: true })
  assert.deepEqual(result, { failed: true, status: 'warn' })
  assert.match(lines[0], /failing=idle-routines \(PERSONA_TOKEN_GATE=block\)/u)
})

test('timeout and crash never fail the gate, not even in block mode', () => {
  for (const [code, status] of [['ETIMEDOUT', 'timeout'], ['EPERM', 'error']]) {
    const { lines, log } = collect()
    const error = Object.assign(new Error(`spawnSync ${code}`), { code })
    const result = tokenGateStep({ run: () => ({ status: null, error }), log, block: true })
    assert.deepEqual(result, { failed: false, status })
    assert.match(lines[0], /^TOKEN_GATE_WARN (timeout|error)/u)
  }
})

test('real step: frozen baseline passes; a tampered baseline is caught as the right scenario', () => {
  const run = (cmd, args, options = {}) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8', ...options })
  const ok = tokenGateStep({ run, log: () => undefined, block: true })
  assert.deepEqual(ok, { failed: false, status: 'ok' })

  const dir = mkdtempSync(join(tmpdir(), 'token-gate-'))
  try {
    const baseline = JSON.parse(readFileSync(join(root, 'persona-spec/baselines/token-faithful.json'), 'utf8'))
    for (const row of baseline.optimized) {
      if (row.id === 'padaria-lua') Object.assign(row, { tokens: Math.floor(row.tokens / 2), costMicroUsd: Math.floor(row.costMicroUsd / 2) })
    }
    const file = join(dir, 'baseline.json')
    writeFileSync(file, JSON.stringify(baseline))
    const tampered = (cmd, args, options = {}) => run(cmd, args, { ...options, env: { ...process.env, PERSONA_TOKEN_BASELINE: file } })
    const { lines, log } = collect()
    assert.deepEqual(tokenGateStep({ run: tampered, log, block: false }), { failed: false, status: 'warn' })
    assert.match(lines[0], /^TOKEN_GATE_WARN failing=padaria-lua [(]informative[)]$/u)
    assert.deepEqual(tokenGateStep({ run: tampered, log: () => undefined, block: true }), { failed: true, status: 'warn' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
