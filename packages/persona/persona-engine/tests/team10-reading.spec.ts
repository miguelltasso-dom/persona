/**
 * TEAM-10, the reading of the real team round for the person (D-092: tokens and quota, never money). Pure: ledger turns + official quota before/after + the dry budget + the calibration.
 */
import { describe, expect, it } from 'vitest'
import { approxTokens, groupThousands, renderTeam10Technical, team10Reading, type Team10Budget, type Team10Quota, type Team10Turn } from '../src/bench/team10-reading.ts'

const turn = (over: Partial<Team10Turn> = {}): Team10Turn => ({ kind: 'execution', inputTokens: 9000, outputTokens: 400, cacheReadTokens: 0, cacheWriteTokens: 0, origin: 'measured', envMode: 'answer-only', ...over })
const BUDGET: Team10Budget = { turns: 11, totalInputMin: 59_433, totalInputMax: 217_462, expectedInput: 120_000 }
const quota = (week: number | undefined, five?: number): Team10Quota => ({ at: '2026-11-05T09:00:00.000Z', windows: [...(week === undefined ? [] : [{ id: 'week', usedPercent: week }]), ...(five === undefined ? [] : [{ id: '5h', usedPercent: five }]), { id: 'model_scoped:Fable', usedPercent: 0 }] })
/** 11 turns of 10 000 tokens of input and 400 of output: 110 000 in, 4 400 out. */
const ROUND = Array.from({ length: 11 }, (_, n) => turn({ kind: n < 5 ? 'execution' : n < 8 ? 'reply' : 'review', inputTokens: 10_000 }))

describe('number words: the grouping the product uses, no locale lookup', () => {
  it('groupThousands and approxTokens', () => {
    expect(groupThousands(1234567)).toBe('1.234.567')
    expect(groupThousands(999)).toBe('999')
    expect(groupThousands(-12345)).toBe('-12.345')
    expect(approxTokens(412)).toBe('412')
    expect(approxTokens(118_400)).toBe('118 mil')
    expect(approxTokens(59_433)).toBe('59 mil')
    expect(approxTokens(1_240_000)).toBe('1,2 milhão')
    expect(approxTokens(2_600_000)).toBe('2,6 milhões')
  })
})

describe('team10Reading: the cost of the round in tokens', () => {
  it('sums the TOTAL input (the cache is part of it), output apart, the largest call, and per kind', () => {
    const reading = team10Reading({ turns: [turn({ inputTokens: 5000, cacheReadTokens: 3000, cacheWriteTokens: 1000, outputTokens: 200 }), turn({ kind: 'reply', inputTokens: 2000, outputTokens: 100 })] })
    expect(reading).toMatchObject({ turns: 2, inputTotal: 7_000, outputTokens: 300, tokens: 7_300, largestTurnInput: 5000 })
    expect(reading.perKind).toEqual({ execution: { turns: 1, tokens: 5200 }, reply: { turns: 1, tokens: 2100 } })
    expect(reading.envModes).toEqual({ 'answer-only': 2 })
  })

  it('the cache is never counted twice: the real rows of the two TEAM-10 attempts (a total with its cache inside)', () => {
    // attempt 1 (05/11): 5 246 = 2 319 read + 2 925 written + 2 uncached and 5 148 = 2 319 + 2 827 + 2. The first reading said 20 784 (the cache added on top) for a round that took 10 394.
    const first = team10Reading({ turns: [turn({ inputTokens: 5246, cacheReadTokens: 2319, cacheWriteTokens: 2925, outputTokens: 713 }), turn({ inputTokens: 5148, cacheReadTokens: 2319, cacheWriteTokens: 2827, outputTokens: 577 })] })
    expect(first).toMatchObject({ turns: 2, inputTotal: 10_394, outputTokens: 1_290, tokens: 11_684, largestTurnInput: 5246 })
    expect(first.perKind).toEqual({ execution: { turns: 2, tokens: 11_684 } })
    // attempt 2 (07/11): 16 180 = 11 046 + 5 130 + 4.
    const second = team10Reading({ turns: [turn({ inputTokens: 16_180, cacheReadTokens: 11_046, cacheWriteTokens: 5_130, outputTokens: 2_054 })] })
    expect(second).toMatchObject({ inputTotal: 16_180, tokens: 18_234, largestTurnInput: 16_180 })
    expect(second.text).toContain('cerca de 16 mil tokens de entrada')
  })

  it('a row whose input is BELOW its own cache books the uncached input alone: the cache is added (the guard)', () => {
    const reading = team10Reading({ turns: [turn({ inputTokens: 1000, cacheReadTokens: 6000, cacheWriteTokens: 2000, outputTokens: 100 })] })
    expect(reading).toMatchObject({ inputTotal: 9_000, largestTurnInput: 9_000, tokens: 9_100 })
  })

  it('a round inside the budget band says so, with the band and the expected value', () => {
    const reading = team10Reading({ turns: ROUND, budget: BUDGET })
    expect(reading.budget).toEqual({ verdict: 'within', min: 59_433, max: 217_462, expected: 120_000 })
    expect(reading.text).toContain('11 chamadas ao modelo')
    expect(reading.text).toContain('cerca de 110 mil tokens de entrada (a maior chamada: 10 mil)')
    expect(reading.text).toContain('Isso ficou dentro do que previmos antes (59 mil a 217 mil, esperado 120 mil).')
  })

  it('above and below the band are said plainly (the band was registered before the data and is not moved)', () => {
    expect(team10Reading({ turns: ROUND.map(row => ({ ...row, inputTokens: 30_000 })), budget: BUDGET }).budget.verdict).toBe('above')
    expect(team10Reading({ turns: ROUND.slice(0, 3), budget: BUDGET }).text).toContain('Isso ficou abaixo do que previmos antes')
    expect(team10Reading({ turns: ROUND }).budget.verdict).toBe('unknown')
    expect(team10Reading({ turns: ROUND }).text).not.toContain('previmos')
  })

  it('an empty round is said, not dressed up', () => {
    const reading = team10Reading({ turns: [], budget: BUDGET })
    expect(reading.text).toBe('A rodada não registrou nenhuma chamada ao modelo.')
    expect(reading.tokens).toBe(0)
  })
})

describe('the quota: the official meter moves in whole points and an account that is not calibrated is not given a share it cannot show', () => {
  it('week 80 -> 80: less than one point; moved: the points, with the caveat that other uses count too', () => {
    const still = team10Reading({ turns: ROUND, before: quota(80), after: quota(80) })
    expect(still.windows).toEqual([{ window: 'week', before: 80, after: 80, delta: 0 }])
    expect(still.text).toContain('Cota da semana: 80% antes, 80% depois: o medidor oficial não se mexeu (menos de 1 ponto).')
    const moved = team10Reading({ turns: ROUND, before: quota(80, 10), after: quota(81, 12) })
    expect(moved.text).toContain('Cota da semana: 80% antes, 81% depois: 1 ponto no medidor oficial (outros usos da conta no mesmo intervalo também contam).')
    expect(moved.text).toContain('Cota das 5 horas: 10% antes, 12% depois: 2 pontos')
  })

  it('a calibrated account gets a range of points from tokens per point (cautious side first)', () => {
    const reading = team10Reading({ turns: ROUND, before: quota(80), after: quota(80), calibrations: [{ window: 'week', tokensPerPoint: { min: 90_000, max: 100_000 } }] })
    // 114 400 tokens of the round / 100 000 = 1,1 ; / 90 000 = 1,3
    expect(reading.windows[0]?.calibratedPoints?.min).toBeCloseTo(1.144, 3)
    expect(reading.windows[0]?.calibratedPoints?.max).toBeCloseTo(1.271, 3)
    expect(reading.text).toContain('pela calibração desta conta a rodada vale cerca de 1,1 a 1,3 pontos.')
  })

  it('a missing reading says nothing about that window; model-scoped windows never appear; an API or unknown account has no window and no money', () => {
    expect(team10Reading({ turns: ROUND, before: quota(80) }).text).not.toContain('Cota')
    expect(team10Reading({ turns: ROUND, before: quota(80), after: quota(80) }).windows.map(row => row.window)).toEqual(['week'])
    for (const billing of ['api', 'unknown'] as const) {
      const reading = team10Reading({ turns: ROUND, before: quota(80), after: quota(80), billing })
      expect(reading.windows).toEqual([])
      expect(reading.text).not.toContain('Cota')
    }
  })

  it('D-092: the person never reads a dollar sign or a price, in the sentence or in the technical report', () => {
    const reading = team10Reading({ turns: ROUND, budget: BUDGET, before: quota(80), after: quota(81), calibrations: [{ window: 'week', tokensPerPoint: { min: 90_000, max: 100_000 } }] })
    expect(reading.text).not.toMatch(/US\$|\$|R\$|dólar|dolar|custo em|preço/iu)
    expect(renderTeam10Technical(reading)).not.toMatch(/US\$|\$\d|R\$|dólar|dolar/iu)
  })
})

describe('the modes of the round: native is the alarm, except for the one reason D-096 allows', () => {
  it('a native turn with no reason is an alarm in the sentence; one with `connector-unreached` is allowed and said', () => {
    const alarm = team10Reading({ turns: [...ROUND, turn({ envMode: 'native' })] })
    expect(alarm.nativeUnexplained).toBe(1)
    expect(alarm.text).toContain('Atenção: 1 chamada rodou no modo nativo')
    const allowed = team10Reading({ turns: [...ROUND, turn({ envMode: 'native', envModeReason: 'connector-unreached' })] })
    expect(allowed).toMatchObject({ nativeUnexplained: 0, nativeForConnector: 1 })
    expect(allowed.text).toContain('1 chamada rodou no modo completo porque um conector concedido não foi alcançado (uma vez por tarefa, como combinado).')
    expect(allowed.text).not.toContain('Atenção')
    const mixed = team10Reading({ turns: [turn({ envMode: 'native' }), turn({ envMode: 'native', envModeReason: 'connector-unreached' }), turn({ envMode: 'native' })] })
    expect(mixed.text).toContain('Atenção: 2 chamadas rodaram no modo nativo')
  })

  it('estimated turns (no vendor number) are counted and said; an unknown mode is its own bucket', () => {
    const reading = team10Reading({ turns: [turn({ origin: 'estimate' }), turn({ origin: null, envMode: null }), turn()] })
    expect(reading.estimated).toBe(2)
    expect(reading.envModes).toEqual({ 'answer-only': 2, desconhecido: 1 })
    expect(reading.text).toContain('2 chamadas sem número do fornecedor entraram como estimativa.')
  })
})

describe('renderTeam10Technical: every number the sentence rounded', () => {
  it('has the exact totals, the per-kind table, the modes and the official readings', () => {
    const text = renderTeam10Technical(team10Reading({ turns: ROUND, budget: BUDGET, before: quota(80), after: quota(80) }))
    expect(text).toContain('entrada total 110.000 (o cache lido e o gravado são parte dela) · saída 4.400 · soma 114.400 · maior entrada de uma chamada 10.000')
    expect(text).toContain('Orçamento a seco: within (faixa 59.433–217.462, esperado 120.000).')
    expect(text).toContain('| execution | 5 | 52.000 |')
    expect(text).toContain('Modos: answer-only 11; nativo sem motivo: 0')
    expect(text).toContain('- week: 80% → 80% (+0)')
  })
})
