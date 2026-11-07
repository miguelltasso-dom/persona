/**
 * TEAM-10 on the tree host: the gate that stands between the harness and the user's quota, the watchdog of the ledger, and the "same configuration" check of the fake proof.
 * Pure, 0 AI.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { LedgerEvidence, LedgerRow } from '../src/ledger-evidence.ts'
import { HEAVY_TURN_INPUT_TOKENS, isolationProofProblems, ledgerGuard, ledgerWarnings, priceWeightedInput, ROUND_INPUT_ABORT_TOKENS } from '../src/team-round-guard.ts'
import { evaluateTreeRoundGate, fakeConfigProblem } from '../src/team-round-tree-gate.ts'
import { gitCommit, libHash, manifestChanges, treeFingerprint, treeManifest } from '../src/tree-fingerprint.ts'

const AUTH = 'Atlas — OK TEAM-10 (aceite b, D-090)\nTeto de turnos: 14\nTotal máximo: 25\n'
const OK_ENV = { PERSONA_REAL_E2E: '1', PERSONA_REAL_E2E_OK: 'TEAM-10', PATH: 'x' }
const attempt = (patch: Record<string, unknown>): Record<string, unknown> => ({ at: '2026-11-05T06:00:00Z', cap: 14, paidTurns: 10, outcome: 'failed', ledgerFile: 'x', ...patch })

const row = (patch: Partial<LedgerRow>): LedgerRow => ({ kind: 'execution', engine: 'claude', origin: 'measured', inputTokens: 4_000, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0, ticketId: null, at: '2026-11-05T06:00:00Z', envMode: 'answer-only', ...patch })
const ledger = (rows: LedgerRow[]): LedgerEvidence => ({ dbPath: 'x', rows, rawRows: [], turns: rows.length, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, allMeasured: true })

describe('ledger watchdog (the limits Tally measured)', () => {
  const strict = { requireEnvMode: true }

  it('lets a round inside its cap and answer-only weight run — including a good worker turn that sums 5–6 requests (50–60 mil)', () => {
    expect(ledgerGuard(undefined, 14, strict)).toBeUndefined()
    expect(ledgerGuard(ledger([row({}), row({ kind: 'opinion' })]), 14, strict)).toBeUndefined()
    expect(ledgerGuard(ledger(Array.from({ length: 14 }, () => row({ inputTokens: 9_000 }))), 14, strict), 'exactly the cap is allowed').toBeUndefined()
    expect(ledgerGuard(ledger([row({ inputTokens: 58_000 })]), 14, strict), 'a good worker turn with many tool calls is not a false positive').toBeUndefined()
    expect(ledgerWarnings(ledger([row({ inputTokens: 58_000 })]))[0]).toMatch(/58000 price-weighted input tokens/u)
  })

  it('weighs a turn the way it is BILLED (cache read ×0.1, cache write ×1.25): the productive round of attempt 3 (329 mil of raw input, 258 mil of it cache reads) is NOT killed, a native call still is', () => {
    expect(priceWeightedInput(row({ inputTokens: 1_000, cacheReadTokens: 0, cacheWriteTokens: 0 })), 'no cache: the input as is').toBe(1_000)
    expect(priceWeightedInput(row({ inputTokens: 100_000, cacheReadTokens: 80_000, cacheWriteTokens: 10_000 }))).toBe(10_000 + 8_000 + 12_500)
    expect(priceWeightedInput(row({ inputTokens: 10, cacheReadTokens: 50, cacheWriteTokens: 50 })), 'inconsistent cache parts never make a negative fresh part').toBe(0 + 5 + 62.5)
    // the 10 measured turns of the real round of 07/11 (input incl. cache, read, write): 329 293 raw
    const attempt3 = [
      [15_708, 8_900, 6_790], [16_320, 9_400, 6_900], [38_672, 30_000, 8_600], [13_133, 10_100, 3_000], [16_308, 9_000, 7_300],
      [37_160, 30_000, 7_100], [39_486, 31_000, 8_400], [52_658, 42_000, 10_600], [29_859, 24_000, 5_800], [69_989, 63_671, 6_300],
    ] as const
    const rows = attempt3.map(([input, read, write]) => row({ inputTokens: input, cacheReadTokens: read, cacheWriteTokens: write, envMode: 'needed' }))
    expect(rows.reduce((sum, item) => sum + item.inputTokens, 0), 'above the old raw limit').toBeGreaterThan(260_000)
    expect(ledgerGuard(ledger(rows), 14, { requireEnvMode: true }), 'weighed as billed it is far inside the limits').toBeUndefined()
    expect(ledgerWarnings(ledger(rows), { requireEnvMode: true }), 'and no turn or round warning').toEqual([])
    // a NATIVE call (the D-069 baseline: 308 902 of input, 308 900 of them cache WRITE) weighs ~386 mil and is killed whatever the mode column says
    expect(ledgerGuard(ledger([row({ inputTokens: 308_902, cacheReadTokens: 0, cacheWriteTokens: 308_900, envMode: 'needed' })]), 14, { requireEnvMode: true })).toMatch(/price-weighted.*NATIVE mode/u)
    // ...and a round of many cheap-to-read turns still stops at the cap of turns and at the weighted round limit
    expect(ledgerGuard(ledger(Array.from({ length: 15 }, () => row({ inputTokens: 30_000, cacheReadTokens: 25_000, cacheWriteTokens: 1_000 }))), 14)).toMatch(/above the cap of 14/u)
    expect(ledgerGuard(ledger(Array.from({ length: 12 }, () => row({ inputTokens: 40_000, cacheReadTokens: 0, cacheWriteTokens: 18_000 }))), 14)).toMatch(/price-weighted input tokens \(> 260000\)/u)
  })

  it('kills above the cap, at a native turn, at a turn that does not say its mode, at a heavy turn and when the round passes 260 mil', () => {
    expect(ledgerGuard(ledger(Array.from({ length: 15 }, () => row({}))), 14)).toMatch(/above the cap of 14/u)
    expect(ledgerGuard(ledger([row({}), row({ envMode: 'native' })]), 14, strict)).toMatch(/NATIVE mode/u)
    expect(ledgerGuard(ledger([row({ envMode: null })]), 14, strict), 'silence about the mode is a warning, not a kill (a native turn is caught by its weight)').toBeUndefined()
    expect(ledgerWarnings(ledger([row({ envMode: null })]), strict)[0]).toMatch(/did not report its environment mode/u)
    expect(ledgerWarnings(ledger([row({ envMode: null })])), 'the fake round does not require it').toEqual([])
    expect(ledgerGuard(ledger([row({ inputTokens: HEAVY_TURN_INPUT_TOKENS + 1 })]), 14)).toMatch(/looks like the NATIVE mode/u)
    expect(ledgerGuard(ledger([row({ inputTokens: 308_902 })]), 14), 'the D-069 baseline is exactly the weight to refuse').toMatch(/NATIVE mode/u)
    expect(ledgerGuard(ledger(Array.from({ length: 6 }, () => row({ inputTokens: ROUND_INPUT_ABORT_TOKENS / 5 }))), 14)).toMatch(/already spent/u)
  })
})

describe('tree round gate', () => {
  const base = { env: OK_ENV, authorization: AUTH, attemptsRaw: undefined, fakeGreenProblem: undefined }

  it('allows the 1st attempt with the OK, the numbers, a green fake and a clean environment — with the cap Atlas wrote', () => {
    const gate = evaluateTreeRoundGate(base)
    expect(gate.problems).toEqual([])
    expect(gate.allowed).toBe(true)
    expect(gate.plan).toMatchObject({ attemptNumber: 1, cap: 14 })
  })

  it('refuses without the opt-ins, the OK file, the numbers or the fake proof', () => {
    expect(evaluateTreeRoundGate({ ...base, env: { PATH: 'x' } }).problems.join(' ')).toMatch(/PERSONA_REAL_E2E=1.*PERSONA_REAL_E2E_OK=TEAM-10/u)
    expect(evaluateTreeRoundGate({ ...base, authorization: undefined }).problems.join(' ')).toMatch(/no Atlas authorization file/u)
    expect(evaluateTreeRoundGate({ ...base, authorization: 'TEAM-10\nTeto de turnos: 14' }).problems.join(' ')).toMatch(/Total máximo/u)
    expect(evaluateTreeRoundGate({ ...base, fakeGreenProblem: 'no fake rehearsal proof' }).problems.join(' ')).toMatch(/fake round is not green/u)
  })

  it('refuses a cap in the environment that disagrees with the attempt, another isolation mode, and anything that makes the round fake or external', () => {
    expect(evaluateTreeRoundGate({ ...base, env: { ...OK_ENV, PERSONA_REAL_TURN_CAP: '40' } }).problems.join(' ')).toMatch(/disagrees with the cap of this attempt \(14\)/u)
    expect(evaluateTreeRoundGate({ ...base, env: { ...OK_ENV, PERSONA_REAL_TURN_CAP: '14' } }).allowed).toBe(true)
    expect(evaluateTreeRoundGate({ ...base, env: { ...OK_ENV, PERSONA_CLI_ENV: 'native' } }).problems.join(' ')).toMatch(/PERSONA_CLI_ENV=native/u)
    expect(evaluateTreeRoundGate({ ...base, env: { ...OK_ENV, PERSONA_CLI_ENV: 'answer-only' } }).allowed).toBe(true)
    // D-096: `needed` is the product's default from the 2nd host window on; a round without connector costs the same in both modes
    expect(evaluateTreeRoundGate({ ...base, env: { ...OK_ENV, PERSONA_CLI_ENV: 'needed' } }).allowed).toBe(true)
    for (const name of ['VITEST', 'PERSONA_SCRIPTED', 'OAR_CLAUDE_BIN', 'FAKE_CLI_LOG', 'PERSONA_E2E_EXTRA_PATH', 'PERSONA_HOST_FLAGS']) {
      expect(evaluateTreeRoundGate({ ...base, env: { ...OK_ENV, [name]: '1' } }).problems.join(' '), name).toContain(name)
    }
    expect(evaluateTreeRoundGate({ ...base, env: { ...OK_ENV, NODE_ENV: 'test' } }).problems.join(' ')).toMatch(/NODE_ENV=test/u)
  })

  it('the 2nd attempt needs the offline diagnosis and gets what is left of the 25; a corrupt attempts file refuses everything', () => {
    const failed = [attempt({ paidTurns: 12 })]
    const refused = evaluateTreeRoundGate({ ...base, attemptsRaw: failed })
    expect(refused.allowed).toBe(false)
    expect(refused.problems.join(' ')).toMatch(/DIAGNOSED/u)
    const second = evaluateTreeRoundGate({ ...base, env: { ...OK_ENV, PERSONA_REAL_E2E_DIAGNOSED: 'o gancho X faltava; provado a seco' }, attemptsRaw: failed })
    expect(second.allowed).toBe(true)
    expect(second.plan).toMatchObject({ attemptNumber: 2, cap: 13 })
    expect(evaluateTreeRoundGate({ ...base, attemptsRaw: 'unreadable' }).problems.join(' ')).toMatch(/attempts file/u)
    expect(evaluateTreeRoundGate({ ...base, attemptsRaw: [attempt({ outcome: 'passed' })] }).problems.join(' ')).toMatch(/already PASSED/u)
  })

  it('the 3rd attempt (Atlas 07/11) runs only with ITS OWN written OK, the diagnosis and a green fake of the same configuration; the original OK never covers it', () => {
    const OK3 = 'TEAM-10 — OK DO ATLAS para a TENTATIVA 3\nTeto de turnos: 14 nesta tentativa.\nTotal máximo: 17 de 25 (3 já gastos + 14).\n'
    const spent = [attempt({ paidTurns: 0, outcome: 'refused' }), attempt({ paidTurns: 2 }), attempt({ paidTurns: 1 })]
    const diagnosed = { ...OK_ENV, PERSONA_REAL_E2E_DIAGNOSED: 'pedido sem fatos: a equipe perguntou; autossuficiente + driver responde + leitor' }
    const withOriginal = evaluateTreeRoundGate({ ...base, env: diagnosed, attemptsRaw: spent })
    expect(withOriginal.allowed).toBe(false)
    expect(withOriginal.problems.join(' ')).toMatch(/attempt 3 needs its own written OK from Atlas/u)
    const own = evaluateTreeRoundGate({ ...base, authorization: OK3, env: diagnosed, attemptsRaw: spent })
    expect(own.problems).toEqual([])
    expect(own.plan).toMatchObject({ attemptNumber: 3, cap: 14, spentSoFar: 3 })
    expect(evaluateTreeRoundGate({ ...base, authorization: OK3, env: { ...diagnosed, PERSONA_REAL_TURN_CAP: '23' }, attemptsRaw: spent }).problems.join(' ')).toMatch(/disagrees with the cap of this attempt \(14\)/u)
    expect(evaluateTreeRoundGate({ ...base, authorization: OK3, env: diagnosed, attemptsRaw: spent, fakeGreenProblem: 'the tree changed after the fake rehearsal' }).allowed, 'no green fake of THIS configuration, no real round').toBe(false)
    expect(evaluateTreeRoundGate({ ...base, authorization: OK3, env: OK_ENV, attemptsRaw: spent }).problems.join(' '), 'no diagnosis, no 3rd attempt').toMatch(/DIAGNOSED/u)
  })
})

describe('"same configuration" of the fake proof', () => {
  const current = { commit: 'abc', fingerprint: 'sha256:1', personas: 3 }
  const proof = { engine: 'fake', green: true, commit: 'abc', fingerprint: 'sha256:1', personas: 3 }

  it('counts only a green fake proof of the same commit, fingerprint and team', () => {
    expect(fakeConfigProblem(proof, current)).toBeUndefined()
    expect(fakeConfigProblem(undefined, current)).toMatch(/no fake rehearsal proof/u)
    expect(fakeConfigProblem({ ...proof, green: false }, current)).toMatch(/not green/u)
    expect(fakeConfigProblem({ ...proof, engine: 'real' }, current)).toMatch(/not from the fake engine/u)
    expect(fakeConfigProblem({ ...proof, commit: 'zzz' }, current)).toMatch(/another commit/u)
    expect(fakeConfigProblem({ ...proof, fingerprint: 'sha256:2' }, current)).toMatch(/tree changed/u)
    expect(fakeConfigProblem({ ...proof, personas: 2 }, current)).toMatch(/persona/u)
  })

  it('the fingerprint is a pure function of ONE manifest (other people saving files between two reads of the live tree must not flake this)', () => {
    const manifest = treeManifest()
    expect(treeFingerprint(manifest)).toBe(treeFingerprint(new Map(manifest)))
    expect(treeFingerprint(manifest)).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(manifest.size, 'the manifest sees the sources and the built client').toBeGreaterThan(50)
    expect([...manifest.keys()].some(path => path.startsWith('packages/persona/persona-host/src/'))).toBe(true)
    expect([...manifest.keys()].some(path => path.startsWith('packages/persona/persona-e2e/src/'))).toBe(true)
    expect(gitCommit()).toMatch(/^[0-9a-f]{40}$/u)
  })

  it('libHash is the bundle identity as Quill announces it: SHA-1 of "path, a zero byte, content" over the files in code-unit order of the lib-relative "/" path', () => {
    const root = mkdtempSync(join(tmpdir(), 'lib-hash-'))
    try {
      mkdirSync(join(root, 'assets'))
      writeFileSync(join(root, 'index.js'), 'a')
      writeFileSync(join(root, 'assets', 'b.css'), 'bb')
      const expected = createHash('sha1')
      for (const [path, content] of [['assets/b.css', 'bb'], ['index.js', 'a']] as const) { expected.update(path); expected.update(Buffer.from([0])); expected.update(content) }
      const first = libHash(root)
      expect(first).toEqual({ hash: expected.digest('hex'), files: 2 })
      writeFileSync(join(root, 'index.js'), 'a2')
      expect(libHash(root).hash, 'a changed file changes the identity').not.toBe(first.hash)
      expect(libHash(join(root, 'missing')), 'no lib = no files, never a throw').toMatchObject({ files: 0 })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('the manifest diff names WHO moved the tree: changed, added and removed files, capped', () => {
    const before = new Map([['a.ts', '1'], ['b.ts', '2'], ['lib/x.js', 'size:10']])
    const after = new Map([['a.ts', '1'], ['b.ts', '3'], ['c.ts', '4']])
    expect(treeFingerprint(before)).not.toBe(treeFingerprint(after))
    expect(manifestChanges(before, after)).toEqual({ changed: ['b.ts'], added: ['c.ts'], removed: ['lib/x.js'], total: 3 })
    expect(manifestChanges(before, new Map(before))).toEqual({ changed: [], added: [], removed: [], total: 0 })
    const many = new Map(Array.from({ length: 30 }, (_, index) => [`f${String(index)}.ts`, 'x'] as const))
    expect(manifestChanges(new Map(), many, 5)).toMatchObject({ added: ['f0.ts', 'f1.ts', 'f2.ts', 'f3.ts', 'f4.ts'], total: 30 })
  })
})

describe('isolation proven before the first paid turn', () => {
  const V = '2.1.318 (Claude Code)'
  const gate = { verdicts: { [`${V}|answer-only`]: { ok: true }, [`${V}|needed`]: { ok: true } }, parity: { [`${V}|haiku|1793761922390:403`]: { ok: true } } }

  it('accepts a gate that proves THIS version in AT LEAST ONE isolated launch (the prewarm proves only the mode in force — D-096 flips it) and THIS settings state', () => {
    expect(isolationProofProblems(gate, V, '1793761922390:403', 'haiku')).toEqual([])
    expect(isolationProofProblems(undefined, V, 'x', 'haiku')[0]).toMatch(/no isolation gate/u)
    expect(isolationProofProblems(gate, '2.2.0 (Claude Code)', '1793761922390:403', 'haiku').join(' ')).toMatch(/no isolated launch .* is proven for 2\.2\.0/u)
    expect(isolationProofProblems(gate, V, '999:1', 'haiku').join(' '), 'the person edited the settings after the proof').toMatch(/parity is not proven.*fingerprint 999:1/u)
    // a fresh file after the default flips holds only `needed` (or, before it, only `answer-only`): both are fine
    expect(isolationProofProblems({ verdicts: { [`${V}|needed`]: { ok: true } }, parity: gate.parity }, V, '1793761922390:403', 'haiku')).toEqual([])
    expect(isolationProofProblems({ verdicts: { [`${V}|answer-only`]: { ok: true } }, parity: gate.parity }, V, '1793761922390:403', 'haiku')).toEqual([])
    // ...but neither (or both failed) is a call that would run native
    expect(isolationProofProblems({ verdicts: { [`${V}|answer-only`]: { ok: false }, [`${V}|needed`]: { ok: false } }, parity: gate.parity }, V, '1793761922390:403', 'haiku').join(' ')).toMatch(/no isolated launch/u)
  })
})

describe('the request is NATURAL (D-097): no word that switches a team tool on', () => {
  it('the TEAM-10 request names nobody and carries no "peça…/depois o…/opinião da equipe" trigger — whether the team collaborates is the model\'s decision', async () => {
    const { REQUEST_TEXT, CAST, ATTACHMENT_NAME } = await import('../src/team-round-driver.ts')
    // Attempt 3 (Atlas 07/11, Bolt's text): natural AND self-sufficient — attempt 2 had no facts, so the Téo (rightly) asked the person and the round measured nothing.
    expect(REQUEST_TEXT).toBe('Faz o cartaz da promoção do pão de queijo da Padaria Lua para o Instagram: 2 por R$ 9 de sexta a domingo, pedidos pelo WhatsApp (11) 91234-5678. Preciso do texto e da arte; a foto é o rascunho atual.')
    expect(REQUEST_TEXT, 'the offer, the price, the days and the channel are in the request').toMatch(/pão de queijo.*2 por R\$ 9.*sexta a domingo.*WhatsApp/u)
    expect(REQUEST_TEXT, 'both parts are asked for the way a person says it').toMatch(/texto e da arte/u)
    expect(REQUEST_TEXT.length, 'far beyond the ~80 characters the first attempt\'s title was cut at').toBeGreaterThan(150)
    expect(REQUEST_TEXT).not.toMatch(/@/u)
    for (const member of CAST) expect(REQUEST_TEXT.toLowerCase(), member.name).not.toContain(member.name.toLowerCase())
    expect(REQUEST_TEXT).not.toMatch(/\b(?:pe[çc]a|pe[çc]am|pedir|depois\s+o|em\s+seguida|opini|equipe|time|colega)/iu)
    expect(ATTACHMENT_NAME).toMatch(/\.png$/u)
  })
})
