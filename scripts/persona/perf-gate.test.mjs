// node --test scripts/persona/perf-gate.test.mjs   (a lógica de comparação; a medição real roda com o app: ver perf-gate.mjs)
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { compareToBaseline, median, parseArgs, renderTable, RULES, summarize } from './perf-gate.mjs'

const CLI = fileURLToPath(new URL('./perf-gate.mjs', import.meta.url))

test('median: ímpar, par, vazio e lixo', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 3, 2]), 2.5)
  assert.equal(median([]), undefined)
  assert.equal(median([undefined, NaN, 'x', 5]), 5)
})

test('summarize: mediana e amostras por métrica; métrica ausente em algumas amostras', () => {
  const s = summarize([{ shellMountMs: 1000, domNodes: 2000 }, { shellMountMs: 1400, domNodes: 2100 }, { shellMountMs: 1200 }])
  assert.equal(s.shellMountMs.median, 1200)
  assert.deepEqual(s.shellMountMs.samples, [1000, 1400, 1200])
  assert.equal(s.domNodes.median, 2050)
})

const base = { shellMountMs: { median: 2000 }, jsHeapMb: { median: 60 }, domNodes: { median: 3000 }, longTaskTotalMs: { median: 400 } }
const now = (extra) => summarize([{ shellMountMs: 2000, jsHeapMb: 60, domNodes: 3000, longTaskTotalMs: 400, ...extra }])

test('compare: dentro da tolerância passa, mesmo com ruído', () => {
  const c = compareToBaseline(now({ shellMountMs: 2900, jsHeapMb: 70 }), base)
  assert.equal(c.ok, true)
  assert.equal(c.compared, 4)
})

test('compare: passou da tolerância E do piso reprova, e diz quanto', () => {
  const c = compareToBaseline(now({ shellMountMs: 4200, jsHeapMb: 95 }), base)
  assert.equal(c.ok, false)
  assert.deepEqual(c.regressions.map((r) => r.metric).sort(), ['jsHeapMb', 'shellMountMs'])
  const shell = c.regressions.find((r) => r.metric === 'shellMountMs')
  assert.equal(shell.baseline, 2000)
  assert.equal(shell.now, 4200)
  assert.equal(shell.pct, 110)
  assert.equal(shell.limit, 3200)
})

test('compare: o piso absoluto segura percentual alto em número pequeno (ruído)', () => {
  // longTask: 400 → 900 é +125% (> 100%), mas +500 ms < piso 600 → não reprova
  assert.equal(compareToBaseline(now({ longTaskTotalMs: 900 }), base).ok, true)
  assert.equal(compareToBaseline(now({ longTaskTotalMs: 1100 }), base).ok, false)
})

test('compare: melhora é reportada; métrica sem baseline ou sem medida vai para "missing", não reprova', () => {
  const c = compareToBaseline(summarize([{ shellMountMs: 200, jsHeapMb: 60, domNodes: 3000, fcpMs: 500 }]), base)
  assert.equal(c.ok, true)
  assert.deepEqual(c.improvements.map((i) => i.metric), ['shellMountMs'])
  assert.ok(c.missing.includes('fcpMs')) // tem medida, não tem baseline
  assert.ok(c.missing.includes('longTaskTotalMs')) // tem baseline, não tem medida
})

test('compare: baseline aceita número puro ou { median }', () => {
  assert.equal(compareToBaseline(summarize([{ domNodes: 9000 }]), { domNodes: 3000 }).ok, false)
  assert.equal(compareToBaseline(summarize([{ domNodes: 3100 }]), { domNodes: 3000 }).ok, true)
})

test('renderTable marca a regressão com ✖ e mostra as amostras', () => {
  const summary = summarize([{ shellMountMs: 4000 }, { shellMountMs: 4400 }, { shellMountMs: 4200 }])
  const comparison = compareToBaseline(summary, base)
  const table = renderTable(summary, comparison)
  assert.match(table, /^✖ shell montado na tela\s+4200 ms\s+\(baseline 2000, \+110%, limite 3200\)\s+\[4000, 4400, 4200\]/mu)
  assert.doesNotMatch(renderTable(summary, undefined), /✖/u)
})

test('todas as regras têm tolerância, piso e rótulo coerentes', () => {
  for (const [name, rule] of Object.entries(RULES)) {
    assert.ok(rule.tolPct > 0 && rule.floor > 0 && rule.label.length > 3, name)
  }
})

test('parseArgs estrito; CLI sem host sobe erro de uso = 2', () => {
  assert.deepEqual([...parseArgs(['--runs', '2', '--no-tour']).flags], ['no-tour'])
  assert.equal(parseArgs(['--runs', '2']).runs, '2')
  assert.throws(() => parseArgs(['--runs']), /precisa de um valor/u)
  assert.throws(() => parseArgs(['solto']), /inesperado/u)
  assert.equal(spawnSync(process.execPath, [CLI, 'solto'], { encoding: 'utf8' }).status, 2)
})
