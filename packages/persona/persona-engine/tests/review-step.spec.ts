import { describe, expect, it } from 'vitest'
import { HandoffError } from '../src/handoff.ts'
import {
  chooseReviewer, groupReviewFailures, MAX_REVIEW_PASSES, MAX_REVIEW_RETURNS, NEW_PROJECT_REVIEW, readVerdict, REVIEW_IDLE, reviewCost, reviewDue,
  reviewRequestFor, reviewStep, returnNoteFor, type ReviewCandidate, type ReviewEvent, type ReviewPolicy, type ReviewState, type ReviewStep,
} from '../src/review-step.ts'

const ATLAS: ReviewCandidate = { id: 'atlas', role: 'coordenação', coordinator: true }
const BIA: ReviewCandidate = { id: 'bia', role: 'redação' }
const TEO: ReviewCandidate = { id: 'teo', role: 'arte' }
const LIA: ReviewCandidate = { id: 'lia', role: 'redação' }
const TEAM = [ATLAS, BIA, TEO, LIA]

describe('reviewDue: per project, by task type; a new project reviews every delivery', () => {
  it('the default for a project that never configured it is ON for all deliveries, by the Coordination', () => {
    expect(NEW_PROJECT_REVIEW).toEqual({ mode: 'all', reviewer: { kind: 'coordination' } })
    expect(reviewDue(undefined, {})).toBe(true)
    expect(reviewDue(undefined, { type: 'cartaz' })).toBe(true)
  })

  it('off reviews nothing; types reviews only those types (and untyped work is not one of them)', () => {
    const off: ReviewPolicy = { mode: 'off', reviewer: { kind: 'coordination' } }
    const types: ReviewPolicy = { mode: 'types', types: ['cartaz', 'texto'], reviewer: { kind: 'coordination' } }
    expect(reviewDue(off, { type: 'cartaz' })).toBe(false)
    expect(reviewDue(types, { type: 'cartaz' })).toBe(true)
    expect(reviewDue(types, { type: 'planilha' })).toBe(false)
    expect(reviewDue(types, {})).toBe(false)
    expect(reviewDue({ mode: 'types', reviewer: { kind: 'coordination' } }, { type: 'cartaz' })).toBe(false)
  })
})

describe('chooseReviewer: never the author, never a delivery that waits for nobody', () => {
  it('the Coordination reviews by default', () => {
    expect(chooseReviewer(undefined, BIA, TEAM)).toEqual({ personaId: 'atlas' })
  })

  it('same role: a colleague with the author\'s role, the least busy first, then by id', () => {
    const policy: ReviewPolicy = { mode: 'all', reviewer: { kind: 'same-role' } }
    expect(chooseReviewer(policy, BIA, TEAM)).toEqual({ personaId: 'lia' })
    expect(chooseReviewer(policy, BIA, [ATLAS, BIA, { ...LIA, openReviews: 3 }, { id: 'noa', role: 'redação', openReviews: 1 }])).toEqual({ personaId: 'noa' })
  })

  it('a named persona reviews; when that persona IS the author, the Coordination does', () => {
    const policy: ReviewPolicy = { mode: 'all', reviewer: { kind: 'persona', personaId: 'teo' } }
    expect(chooseReviewer(policy, BIA, TEAM)).toEqual({ personaId: 'teo' })
    expect(chooseReviewer(policy, TEO, TEAM)).toEqual({ personaId: 'atlas' })
  })

  it('the author never reviews their own work, even when they are the Coordination: another eligible colleague takes it or there is no review', () => {
    expect(chooseReviewer(undefined, ATLAS, [ATLAS, BIA])).toEqual({ skip: 'no-reviewer' })
    expect(chooseReviewer({ mode: 'all', reviewer: { kind: 'same-role' } }, ATLAS, [ATLAS, { id: 'zed', role: 'coordenação' }])).toEqual({ personaId: 'zed' })
  })

  it('a reviewer who cannot work now (paused, at the limit, engine disconnected) is replaced by the Coordination; if nobody can, the work is delivered unreviewed', () => {
    const policy: ReviewPolicy = { mode: 'all', reviewer: { kind: 'persona', personaId: 'teo' } }
    for (const out of [{ paused: true }, { atLimit: true }, { connected: false }]) {
      expect(chooseReviewer(policy, BIA, [ATLAS, BIA, { ...TEO, ...out }])).toEqual({ personaId: 'atlas' })
    }
    expect(chooseReviewer(undefined, BIA, [{ ...ATLAS, paused: true }, BIA])).toEqual({ skip: 'no-reviewer' })
    expect(chooseReviewer(undefined, BIA, [])).toEqual({ skip: 'no-reviewer' })
  })

  it('off and not-due say why they skip', () => {
    expect(chooseReviewer({ mode: 'off', reviewer: { kind: 'coordination' } }, BIA, TEAM)).toEqual({ skip: 'off' })
    expect(chooseReviewer({ mode: 'types', types: ['cartaz'], reviewer: { kind: 'coordination' } }, BIA, TEAM, { type: 'planilha' })).toEqual({ skip: 'not-due' })
  })
})

describe('readVerdict: untrusted, bounded, cleaned', () => {
  it('approve, in the model\'s words or ours', () => {
    for (const word of ['approve', 'APPROVED', ' aprovado ', 'aprovar']) expect(readVerdict({ verdict: word })).toEqual({ verdict: 'approve' })
  })

  it('changes carries the points, cleaned like a bilhete (secrets removed)', () => {
    const verdict = readVerdict({ verdict: 'changes', points: ['Troque o título', 'Use a senha: abc123xyz no rodapé? não', 'Corrija o preço'] })
    expect(verdict.verdict).toBe('changes')
    if (verdict.verdict === 'changes') {
      expect(verdict.points).toHaveLength(3)
      expect(verdict.points.join(' ')).not.toContain('abc123xyz')
    }
    expect(readVerdict({ verdict: 'ajustes', points: 'Só um ponto' })).toEqual({ verdict: 'changes', points: ['Só um ponto'] })
  })

  it('refuses, in Portuguese for the model: changes without points, too many points, anything else', () => {
    const refuse = (raw: unknown): string => { try { readVerdict(raw) } catch (error) { return error instanceof HandoffError ? error.message : 'other' } return '' }
    expect(refuse({ verdict: 'changes' })).toMatch(/Diga o que ajustar/u)
    expect(refuse({ verdict: 'changes', points: [] })).toMatch(/Diga o que ajustar/u)
    expect(refuse({ verdict: 'changes', points: ['  ', ''] })).toMatch(/Diga o que ajustar/u)
    expect(refuse({ verdict: 'changes', points: Array.from({ length: 7 }, (_, n) => `ponto ${String(n)}`) })).toMatch(/No máximo 6/u)
    expect(refuse({ verdict: 'talvez' })).toMatch(/approve/u)
    expect(refuse(undefined)).toMatch(/approve/u)
    expect(refuse('approve')).toMatch(/approve/u)
  })
})

/** Runs a script of events through the machine, returning every step. */
function run(events: readonly ReviewEvent[], start: ReviewState = REVIEW_IDLE): ReviewStep[] {
  const steps: ReviewStep[] = []
  let state = start
  for (const event of events) {
    const step = reviewStep(state, event, { authorId: 'bia' })
    steps.push(step)
    state = step.state
  }
  return steps
}
const PICK_ATLAS = { personaId: 'atlas' }
const CHANGES = (...points: string[]): ReviewEvent => ({ type: 'verdict', verdict: { verdict: 'changes', points } })
const APPROVE: ReviewEvent = { type: 'verdict', verdict: { verdict: 'approve' } }

describe('the flow: A finishes → reviewer → approve or return (max 2 returns)', () => {
  it('approved at once: "pediu revisão" then "aprovou", delivered WITH the seal', () => {
    const [asked, approved] = run([{ type: 'author-done', pick: PICK_ATLAS }, APPROVE])
    expect(asked?.action).toEqual({ type: 'ask-review', reviewerId: 'atlas', pass: 1 })
    expect(asked?.line).toEqual({ kind: 'asked', authorPersonaId: 'bia', reviewerPersonaId: 'atlas' })
    expect(approved?.action).toEqual({ type: 'deliver', sealedBy: 'atlas' })
    expect(approved?.line?.kind).toBe('approved')
    expect(approved?.view).toEqual({ kind: 'reviewed', reviewerPersonaId: 'atlas', round: 0, maxRounds: 2 })
    expect(approved?.path).toEqual({ personaId: 'atlas', step: 'reviewed' })
    expect(approved?.state.status).toBe('closed')
  })

  it('one return, an adjustment, then approved: "pediu ajustes" (1 line) → "ajustou e aprovou", seal', () => {
    const steps = run([{ type: 'author-done', pick: PICK_ATLAS }, CHANGES('Troque o título por algo mais curto', 'Confira o preço'), { type: 'author-adjusted' }, APPROVE])
    const [, returned, again, approved] = steps
    expect(returned?.action).toEqual({ type: 'return-to-author', authorNeeded: ['Troque o título por algo mais curto', 'Confira o preço'], round: 1 })
    expect(returned?.line).toEqual({ kind: 'returned', authorPersonaId: 'bia', reviewerPersonaId: 'atlas', summary: 'Troque o título por algo mais curto' })
    expect(returned?.view).toEqual({ kind: 'returned', reviewerPersonaId: 'atlas', round: 1, maxRounds: 2 })
    // re-asking the reviewer writes no new line: the story is "pediu revisão → pediu ajustes → ajustou e aprovou"
    expect(again?.action).toEqual({ type: 'ask-review', reviewerId: 'atlas', pass: 2 })
    expect(again?.line).toBeUndefined()
    expect(approved?.action).toEqual({ type: 'deliver', sealedBy: 'atlas' })
    expect(approved?.line?.kind).toBe('adjusted-approved')
    expect(approved?.view).toMatchObject({ kind: 'reviewed', round: 1 })
  })

  it('two returns are allowed; approval after the 2nd still gets the seal', () => {
    const steps = run([{ type: 'author-done', pick: PICK_ATLAS }, CHANGES('a'), { type: 'author-adjusted' }, CHANGES('b'), { type: 'author-adjusted' }, APPROVE])
    expect(steps.map(step => step.action.type)).toEqual(['ask-review', 'return-to-author', 'ask-review', 'return-to-author', 'ask-review', 'deliver'])
    expect(steps[3]?.view).toMatchObject({ kind: 'returned', round: 2, maxRounds: 2 })
    expect(steps[5]?.action).toEqual({ type: 'deliver', sealedBy: 'atlas' })
  })

  it('the 3rd time the reviewer still has points: the work goes to the person, points in plain sight, NO seal', () => {
    const steps = run([{ type: 'author-done', pick: PICK_ATLAS }, CHANGES('a'), { type: 'author-adjusted' }, CHANGES('b'), { type: 'author-adjusted' }, CHANGES('c1', 'c2')])
    const last = steps[5]
    expect(last?.action).toEqual({ type: 'deliver', openPoints: ['c1', 'c2'] })
    expect(last?.action).not.toHaveProperty('sealedBy')
    expect(last?.view).toEqual({ kind: 'returned', reviewerPersonaId: 'atlas', round: 2, maxRounds: 2, openPoints: 2 })
    expect(last?.state.status).toBe('closed')
    expect(MAX_REVIEW_RETURNS).toBe(2)
    expect(MAX_REVIEW_PASSES).toBe(3)
  })

  it('no reviewer or review off: delivered straight, no lines, no seal, the reason is kept for the Task detail', () => {
    for (const skip of ['off', 'not-due', 'no-reviewer'] as const) {
      const [step] = run([{ type: 'author-done', pick: { skip } }])
      expect(step?.action).toEqual({ type: 'deliver', skipped: skip })
      expect(step?.line).toBeUndefined()
      expect(step?.view).toBeUndefined()
      expect(step?.state.status).toBe('closed')
    }
  })

  it('a reviewer who fails never holds the delivery: the work goes on unsealed', () => {
    const [, failed] = run([{ type: 'author-done', pick: PICK_ATLAS }, { type: 'reviewer-failed' }])
    expect(failed?.action).toEqual({ type: 'deliver', skipped: 'reviewer-failed' })
    expect(failed?.line).toBeUndefined()
    // also after a return: the author's adjusted work is not called "open points"
    const steps = run([{ type: 'author-done', pick: PICK_ATLAS }, CHANGES('a'), { type: 'author-adjusted' }, { type: 'reviewer-failed' }])
    expect(steps[3]?.action).toEqual({ type: 'deliver', skipped: 'reviewer-failed' })
  })
})

describe('the machine is idempotent and cannot be pushed past its rules', () => {
  it('duplicates and out-of-order events change nothing and do nothing', () => {
    const closed = run([{ type: 'author-done', pick: PICK_ATLAS }, APPROVE]).at(-1)?.state ?? REVIEW_IDLE
    for (const event of [APPROVE, CHANGES('x'), { type: 'author-adjusted' } as const, { type: 'reviewer-failed' } as const, { type: 'author-done', pick: PICK_ATLAS } as const]) {
      const step = reviewStep(closed, event, { authorId: 'bia' })
      expect(step.action).toEqual({ type: 'none' })
      expect(step.state).toBe(closed)
    }
    // a verdict before the review was asked, or while the author is adjusting
    expect(reviewStep(REVIEW_IDLE, APPROVE, { authorId: 'bia' }).action).toEqual({ type: 'none' })
    const returned = run([{ type: 'author-done', pick: PICK_ATLAS }, CHANGES('a')]).at(-1)?.state ?? REVIEW_IDLE
    expect(reviewStep(returned, APPROVE, { authorId: 'bia' }).action).toEqual({ type: 'none' })
    expect(reviewStep(returned, { type: 'reviewer-failed' }, { authorId: 'bia' }).action).toEqual({ type: 'none' })
    // author-done twice does not open a second review
    const reviewing = run([{ type: 'author-done', pick: PICK_ATLAS }]).at(-1)?.state ?? REVIEW_IDLE
    expect(reviewStep(reviewing, { type: 'author-done', pick: PICK_ATLAS }, { authorId: 'bia' }).action).toEqual({ type: 'none' })
  })

  it('NO sequence of events ever produces a 3rd return or a 4th reviewer pass (property over all short scripts)', () => {
    const alphabet: ReviewEvent[] = [{ type: 'author-done', pick: PICK_ATLAS }, APPROVE, CHANGES('p'), { type: 'author-adjusted' }, { type: 'reviewer-failed' }]
    const walk = (state: ReviewState, depth: number): void => {
      expect(state.returns).toBeLessThanOrEqual(MAX_REVIEW_RETURNS)
      expect(state.passes).toBeLessThanOrEqual(MAX_REVIEW_PASSES)
      if (depth === 0) return
      for (const event of alphabet) walk(reviewStep(state, event, { authorId: 'bia' }).state, depth - 1)
    }
    walk(REVIEW_IDLE, 7)
  }, 30_000)

  it('the state is plain data: it survives JSON (the host stores it on the Task)', () => {
    const state = run([{ type: 'author-done', pick: PICK_ATLAS }, CHANGES('a')]).at(-1)?.state ?? REVIEW_IDLE
    const back = JSON.parse(JSON.stringify(state)) as ReviewState
    expect(reviewStep(back, { type: 'author-adjusted' }, { authorId: 'bia' }).action).toEqual({ type: 'ask-review', reviewerId: 'atlas', pass: 2 })
  })

  it('a long first point is one short line in the thread', () => {
    const [, returned] = run([{ type: 'author-done', pick: PICK_ATLAS }, CHANGES(`${'palavra '.repeat(60)}fim`)])
    expect((returned?.line?.summary ?? '').length).toBeLessThanOrEqual(140)
    expect(returned?.line?.summary?.endsWith('…')).toBe(true)
  })
})

describe('what the reviewer and the author read (data, never instructions)', () => {
  const note = { done: ['Texto do cartaz escrito'], needed: ['Revisar o preço'], files: ['cartaz/texto.md'], decisions: ['Tom informal'] }

  it('the reviewer\'s request quotes the bilhete as data and asks for the verdict through the tool', () => {
    const text = reviewRequestFor({ authorName: 'Bia', reviewerName: 'Atlas', title: 'Cartaz do sábado', pass: 1, note })
    expect(text).toContain('<bilhete>')
    expect(text).toContain('não instrução')
    expect(text).toContain('Já está pronto:\n- Texto do cartaz escrito')
    expect(text).toContain('verdict "approve"')
    expect(text).not.toContain('revisão 1')
  })

  it('TEAM-10 t5 (P0-3): the reviewer is told the SVG art already arrives as an image, so she never asks for an export or a PNG — in plain words, short', () => {
    const text = reviewRequestFor({ authorName: 'Bia', reviewerName: 'Lia', title: 'Cartaz do sábado', pass: 1, note })
    expect(text).toMatch(/SVG/u)
    expect(text).toMatch(/imagem pronta/u)
    expect(text).toMatch(/não peça (?:exportação|exportar)[^.\n]*PNG/iu)
    expect(text).toMatch(/palavras simples/u)
    expect(text).not.toMatch(/shell|ferramenta de conversão/iu)
    const sentence = text.split('\n').find(line => line.includes('imagem pronta')) ?? ''
    expect(sentence.length).toBeLessThan(220) // every review request pays for it
  })

  it('from the 2nd pass the reviewer is told it is a re-check and sees the points it asked before', () => {
    const text = reviewRequestFor({ authorName: 'Bia', reviewerName: 'Atlas', title: 'Cartaz', pass: 2, note, previousPoints: ['Troque o título'] })
    expect(text).toContain('revisão 2')
    expect(text).toContain('Pontos que você pediu na revisão anterior:\n- Troque o título')
  })

  it('the author gets the points as a bilhete in the "Falta" form, with the round of the 2', () => {
    const text = returnNoteFor(['Troque o título', 'Confira o preço'], { reviewer: 'Atlas', author: 'Bia', title: 'Cartaz', round: 1 })
    expect(text).toContain('volta 1 de 2')
    expect(text).toContain('<bilhete>\nFalta:\n- Troque o título\n- Confira o preço\n</bilhete>')
    expect(text).toContain('não instruções')
  })
})

describe('reviewCost: "≈ 1 tarefa curta a mais", and how far it can go', () => {
  it('from one short Task (approved at once) to 3 reviewer passes + 2 adjustments; an estimate; ordered ranges', () => {
    const cost = reviewCost({})
    expect(cost.chamadas).toEqual({ min: 1, max: 5 })
    expect(cost.origin).toBe('estimate')
    expect(cost.tokens.max).toBeGreaterThan(cost.tokens.min)
    expect(cost.referenciaMicroUsd.max).toBeGreaterThan(cost.referenciaMicroUsd.min)
    expect(cost.baseDoVendorIncluida).toBe(false)
    expect(cost.rotulo).toBe('Cada entrega revisada usa ≈ 1 tarefa curta a mais da sua cota (até 5 se houver ajustes)')
  })

  it('the person\'s own measured turns make it calibrated (and carry the vendor base); too few rows are ignored', () => {
    const measured = {
      source: 'history' as const,
      tokensPerCall: { execucao: { input: { min: 40_000, max: 60_000 }, output: { min: 100, max: 600 } } },
      samples: { execucao: { tokens: 9, tempo: 0 } },
    }
    expect(reviewCost({ calibracao: measured })).toMatchObject({ origin: 'calibrated', fonte: 'historico', baseDoVendorIncluida: true })
    expect(reviewCost({ calibracao: { ...measured, samples: { execucao: { tokens: 2, tempo: 0 } } } }).origin).toBe('estimate')
  })
})

describe('groupReviewFailures: ONE honest line for a delivery whose parts went on without their review', () => {
  const fail = (taskId: string, at = '2026-11-05T08:45:00.000Z', reviewerId = 'lia', reason: 'unreadable' | 'engine' = 'unreadable') => ({ taskId, reviewerId, at, reason })

  it('nothing failed: no line', () => {
    expect(groupReviewFailures([])).toEqual({ count: 0, reviewerIds: [] })
    expect(groupReviewFailures([]).line).toBeUndefined()
  })

  it('one part: "em 1 parte", with the verb in the singular', () => {
    expect(groupReviewFailures([fail('t1')])).toEqual({ count: 1, reviewerIds: ['lia'], line: 'A revisão não rodou em 1 parte; seguiu sem o selo' })
  })

  it('many parts: ONE line with the count, not one per part (the transcript had six)', () => {
    const group = groupReviewFailures(['t1', 't2', 't3', 't4', 't5', 't6'].map(id => fail(id)))
    expect(group).toMatchObject({ count: 6, reviewerIds: ['lia'], line: 'A revisão não rodou em 6 partes; seguiram sem o selo' })
  })

  it('a Task whose review failed twice counts once; the reason (reviewer silent or engine down) does not change the sentence', () => {
    const group = groupReviewFailures([fail('t1', '2026-11-05T08:00:00.000Z', 'lia', 'unreadable'), fail('t1', '2026-11-05T09:00:00.000Z', 'lia', 'engine'), fail('t2', '2026-11-05T08:30:00.000Z', 'lia', 'engine')])
    expect(group.count).toBe(2)
    expect(group.line).toBe('A revisão não rodou em 2 partes; seguiram sem o selo')
  })

  it('lists each reviewer once, in the order they first failed, whatever order the failures are given in', () => {
    const group = groupReviewFailures([fail('t3', '2026-11-05T09:00:00.000Z', 'noa'), fail('t1', '2026-11-05T08:00:00.000Z', 'lia'), fail('t2', '2026-11-05T08:30:00.000Z', 'noa')])
    expect(group.reviewerIds).toEqual(['lia', 'noa'])
    expect(group.count).toBe(3)
  })

  it('ignores an entry with no Task and never throws; the line carries ids and a count only (no text of the reviewer)', () => {
    expect(groupReviewFailures([fail('')])).toEqual({ count: 0, reviewerIds: [] })
    const line = groupReviewFailures([fail('t1')]).line ?? ''
    expect(line).not.toMatch(/lia|t1|unreadable|engine/iu)
  })
})
