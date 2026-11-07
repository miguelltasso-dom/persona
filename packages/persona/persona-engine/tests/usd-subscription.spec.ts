/**
 * USD-1 / D-092 (persona-spec/contracts/usd-subscription.md): a SUBSCRIPTION account never gets a dollar in what goes to the screen; it gets the
 * impact on the window the vendor publishes and tokens/calls. US$ only for an API account, as an estimate. Switching the account switches the form.
 */
import { describe, expect, it } from 'vitest'
import { billingOf, calibrateQuota, impactLine, quotaPairs, MIN_QUOTA_DELTA, MIN_QUOTA_PAIRS, pickWindow, quotaImpact, usdLine, type QuotaCalibration, type QuotaWindowReading } from '../src/ux/billing.ts'
import { estimateAsk, estimateAskReference, type EstimateAskInput, type EstimateAskResult } from '../src/ux/estimate-ask.ts'
import { budgetOpinionRound, type OpinionBudgetInput } from '../src/ux/opinion-budget.ts'
import { reviewCost } from '../src/review-step.ts'

const NINA = { id: 'nina', name: 'Nina', title: 'Pesquisa', personality: 'Curiosa.', instructions: 'Pesquise e resuma com fontes.' }
const WORK = 'Monte o cardápio da semana e calcule as encomendas'
const WEEK: QuotaWindowReading = { id: 'week', usedPercent: 67, resetsAt: '2026-11-07T16:00:00.000Z' }
const FIVE: QuotaWindowReading = { id: '5h', usedPercent: 12, resetsAt: '2026-11-05T09:00:00.000Z' }

function ask(conta: EstimateAskInput['conta'], texto = WORK): EstimateAskResult {
  return estimateAsk({ texto, motor: { cli: 'claude', connected: true }, persona: NINA, ...(conta === undefined ? {} : { conta }) })
}

/** Every string the screen could draw from the result, plus its JSON (so a dollar hidden in any field is found). */
function screenText(result: EstimateAskResult): string {
  // The key `custo` is part of the contract and is `null` for a subscription (the test below asserts that); what must hold is that no VALUE carries money.
  return [result.rotulo, result.motivo, result.impacto, result.quota?.basis ?? '', JSON.stringify(result).replace('"custo":null,', '')].join('\n')
}
const MONEY = /US\$|\$|microUsd|\bcusto\b|\bcost\b/iu

describe('billingOf: which kind of account runs the engine', () => {
  it('a DSH/HTTP engine is an API account', () => {
    expect(billingOf({ kind: 'dsh' })).toBe('api')
    expect(billingOf({ kind: 'http' })).toBe('api')
  })
  it('a CLI started with an API key or a cloud provider is an API account, even when it is also logged in', () => {
    expect(billingOf({ kind: 'cli', cli: 'claude', env: { ANTHROPIC_API_KEY: 'sk-ant-x' }, plan: 'max' })).toBe('api')
    expect(billingOf({ kind: 'cli', cli: 'claude', env: { CLAUDE_CODE_USE_BEDROCK: '1' } })).toBe('api')
    expect(billingOf({ kind: 'cli', cli: 'claude', env: { CLAUDE_CODE_USE_VERTEX: 'true' } })).toBe('api')
    expect(billingOf({ kind: 'cli', cli: 'codex', env: { OPENAI_API_KEY: 'sk-x' } })).toBe('api')
  })
  it('a logged-in CLI account (a plan the vendor reported, or a known login) is a subscription', () => {
    expect(billingOf({ kind: 'cli', cli: 'claude', env: {}, plan: 'max' })).toBe('subscription')
    expect(billingOf({ kind: 'cli', cli: 'claude', env: { ANTHROPIC_API_KEY: '' }, loggedIn: true })).toBe('subscription')
    expect(billingOf({ kind: 'cli', cli: 'codex', env: {}, loggedIn: true })).toBe('subscription')
  })
  it('no sign at all is unknown, and so is an engine we cannot tell', () => {
    expect(billingOf({ kind: 'cli', cli: 'claude', env: {} })).toBe('unknown')
    expect(billingOf({ kind: 'cli', cli: 'cursor', env: {}, loggedIn: true })).toBe('unknown')
    expect(billingOf({})).toBe('unknown')
    expect(billingOf({ kind: 'fake' })).toBe('unknown')
  })
})

describe('the window: the one the vendor publishes', () => {
  it('5 hours when it exists, otherwise the week; nothing published = no window', () => {
    expect(pickWindow([WEEK, FIVE])?.id).toBe('5h')
    expect(pickWindow([WEEK])?.id).toBe('week')
    expect(pickWindow([])).toBeUndefined()
  })
  it('a Max account that publishes only the week is spoken of by the week, never as "5 h"', () => {
    const result = ask({ billing: 'subscription', janelas: [WEEK] })
    expect(result.quota?.window).toBe('week')
    expect(result.impacto).not.toMatch(/5 h/u)
  })
})

describe('calibrateQuota: tokens per point, from the person\'s own readings', () => {
  const pair = (deltaPercent: number, tokens: number, window: 'week' | '5h' = 'week') => ({ window, deltaPercent, tokens })
  it('needs enough pairs, and ignores a rise too small to mean anything (1% resolution)', () => {
    expect(calibrateQuota([pair(5, 500_000), pair(4, 400_000)], 'week')).toBeUndefined()
    expect(MIN_QUOTA_PAIRS).toBe(3)
    expect(calibrateQuota([pair(1, 900_000), pair(2, 900_000), pair(MIN_QUOTA_DELTA, 300_000), pair(4, 400_000)], 'week')).toBeUndefined()
  })
  it('keeps the P50..P90 of tokens per point of the right window (outside use only lowers the rate, so the low pairs are the contaminated ones)', () => {
    const rows = [pair(4, 400_000), pair(5, 450_000), pair(5, 600_000), pair(6, 540_000), pair(10, 800_000), pair(5, 1, '5h')]
    const calibration = calibrateQuota(rows, 'week')
    expect(calibration).toEqual({ window: 'week', tokensPerPoint: { min: 90_000, max: 120_000 }, rows: 5 })
    expect(calibrateQuota(rows, '5h')).toBeUndefined()
  })
})

describe('quotaImpact: the share of the window, or "not measured"', () => {
  const tokens = { min: 20_000, max: 60_000 }
  it('without a calibration the share is null (cota não medida), never 0, and the official numbers are still there', () => {
    const impact = quotaImpact({ windows: [WEEK], tokens })
    expect(impact).toMatchObject({ window: 'week', pct: null, origin: 'not-measured', usedPct: 67, remainingPct: 33, resetsAt: WEEK.resetsAt })
    expect(impact?.basis).toBeUndefined()
  })
  it('with a calibration of THAT window the share is a range, labelled calibrated, with the caveat', () => {
    const calibrations: QuotaCalibration[] = [{ window: 'week', tokensPerPoint: { min: 10_000, max: 20_000 }, rows: 4 }]
    const impact = quotaImpact({ windows: [WEEK], calibrations, tokens })
    expect(impact?.pct).toEqual({ min: 1, max: 6 })
    expect(impact?.origin).toBe('calibrated')
    expect(impact?.basis).toMatch(/4 leituras da sua conta/u)
    // a calibration of ANOTHER window does not apply
    expect(quotaImpact({ windows: [WEEK], calibrations: [{ ...calibrations[0]!, window: '5h' }], tokens })?.pct).toBeNull()
  })
  it('a share is clamped to 0..100 and no tokens means no share', () => {
    const calibrations: QuotaCalibration[] = [{ window: 'week', tokensPerPoint: { min: 1, max: 2 }, rows: 3 }]
    expect(quotaImpact({ windows: [WEEK], calibrations, tokens })?.pct?.max).toBe(100)
    expect(quotaImpact({ windows: [WEEK], calibrations, tokens: null })?.pct).toBeNull()
  })
  it('the vendor publishing nothing usable is no window at all', () => {
    expect(quotaImpact({ windows: [], tokens })).toBeNull()
  })
})

describe('estimateAsk: a SUBSCRIPTION account gets no money anywhere (D-092)', () => {
  it('no microUsd, no "US$", no "$", no "custo" in anything the screen can draw — with the window, without, and with a calibration', () => {
    const calibracoes: QuotaCalibration[] = [{ window: 'week', tokensPerPoint: { min: 8_000, max: 12_000 }, rows: 5 }]
    for (const conta of [
      { billing: 'subscription' as const },
      { billing: 'subscription' as const, janelas: [WEEK] },
      { billing: 'subscription' as const, janelas: [WEEK, FIVE] },
      { billing: 'subscription' as const, janelas: [WEEK], calibracoes },
      { billing: 'unknown' as const, janelas: [WEEK] },
    ]) {
      const result = ask(conta)
      expect(result.custo).toBeNull()
      expect(result.billing).toBe(conta.billing)
      expect(screenText(result)).not.toMatch(MONEY)
    }
  })

  it('the line says what it uses: "cota não medida" first, a share of the window once calibrated, the calls when no window is published', () => {
    expect(ask({ billing: 'subscription', janelas: [WEEK] }).impacto).toBe('cota não medida')
    // an ask of ~400..1,700 tokens against a window where 200..400 tokens move one point: about 1% to 9%
    const calibracoes: QuotaCalibration[] = [{ window: 'week', tokensPerPoint: { min: 200, max: 400 }, rows: 5 }]
    const calibrated = ask({ billing: 'subscription', janelas: [WEEK], calibracoes })
    expect(calibrated.quota?.origin).toBe('calibrated')
    expect(calibrated.impacto).toMatch(/^cerca de \d+(–\d+)?% da sua janela da semana$/u)
    expect(ask({ billing: 'subscription', janelas: [WEEK, FIVE], calibracoes: [{ ...calibracoes[0]!, window: '5h' }] }).impacto).toMatch(/da sua janela de 5 h$/u)
    const noWindow = ask({ billing: 'subscription' })
    expect(noWindow.quota).toBeNull()
    expect(noWindow.impacto).toMatch(/^≈ \d+ chamadas? da sua IA$/u)
  })

  it('a tiny ask says "quase nada", never a 0% by absence', () => {
    const calibracoes: QuotaCalibration[] = [{ window: 'week', tokensPerPoint: { min: 5_000_000, max: 6_000_000 }, rows: 3 }]
    expect(ask({ billing: 'subscription', janelas: [WEEK], calibracoes }).impacto).toBe('quase nada da sua janela da semana')
  })

  it('a message with no call (a courtesy) uses nothing, for every account', () => {
    for (const billing of ['subscription', 'api', 'unknown'] as const) {
      const result = ask({ billing, janelas: [WEEK] }, 'obrigado!')
      expect(result.impacto).toBe('Sem chamada da sua IA')
      expect(result.tokens).toEqual({ min: 0, max: 0 })
    }
  })

  it('the account is not asked about: without it the answer is unknown and still shows no money', () => {
    const result = ask(undefined)
    expect(result.billing).toBe('unknown')
    expect(result.custo).toBeNull()
    expect(screenText(result)).not.toMatch(MONEY)
  })
})

describe('estimateAsk: an API account sees US$, as an estimate', () => {
  it('custo is there, the line is "≈ US$ x–y (estimativa)", and there is no window talk', () => {
    const result = ask({ billing: 'api', janelas: [WEEK] })
    expect(result.billing).toBe('api')
    expect(result.custo?.microUsd.max).toBeGreaterThan(0)
    expect(result.quota).toBeNull()
    expect(result.impacto).toMatch(/^(≈ US\$ \d+,\d{2}(–\d+,\d{2})? \(estimativa\)|menos de US\$ 0,01 \(estimativa\))$/u)
    expect(result.impacto).not.toMatch(/janela/u)
  })
  it('usdLine: under a cent, one number, a range', () => {
    expect(usdLine({ min: 100, max: 5_000 })).toBe('menos de US$ 0,01 (estimativa)')
    expect(usdLine({ min: 20_000, max: 20_000 })).toBe('≈ US$ 0,02 (estimativa)')
    expect(usdLine({ min: 20_000, max: 90_000 })).toBe('≈ US$ 0,02–0,09 (estimativa)')
  })
})

describe('switching the account switches the form, and nothing sticks', () => {
  it('subscription → API → subscription → unknown', () => {
    const sub = ask({ billing: 'subscription', janelas: [WEEK] })
    const api = ask({ billing: 'api', janelas: [WEEK] })
    const again = ask({ billing: 'subscription', janelas: [WEEK] })
    const unknown = ask({ billing: 'unknown', janelas: [WEEK] })
    expect([sub.custo, api.custo === null, again.custo, unknown.custo]).toEqual([null, false, null, null])
    expect([sub.quota === null, api.quota === null, again.quota === null, unknown.quota === null]).toEqual([false, true, false, false])
    expect(again).toEqual(sub)
    expect(screenText(again)).not.toMatch(MONEY)
    expect(screenText(api)).toMatch(/US\$/u)
  })
})

describe('the technical report keeps the dollar (internal), the screen does not', () => {
  it('estimateAskReference gives the list-price US$ even for a subscription, while its screen has none', () => {
    const { screen, referenciaMicroUsd } = estimateAskReference({ texto: WORK, motor: { cli: 'claude', connected: true }, persona: NINA, conta: { billing: 'subscription', janelas: [WEEK] } })
    expect(screen.custo).toBeNull()
    expect(screenText(screen)).not.toMatch(MONEY)
    expect(referenciaMicroUsd?.max).toBeGreaterThan(0)
  })
})

describe('impactLine on its own', () => {
  it('never writes money for a subscription, whatever it is handed', () => {
    const line = impactLine({ billing: 'subscription', calls: { min: 2, max: 2 }, microUsd: { min: 5_000_000, max: 9_000_000 }, quota: null })
    expect(line).toBe('≈ 2 chamadas da sua IA')
    expect(impactLine({ billing: 'unknown', calls: { min: 1, max: 1 }, microUsd: { min: 1, max: 2 }, quota: null })).toBe('≈ 1 chamada da sua IA')
  })
})

// ---- the same rule on the other surfaces: a round of opinions and a review ------------------------------------------------

const READER = (id: string): OpinionBudgetInput['readers'][number] => ({ id, name: id, title: 'Equipe', motor: { cli: 'claude', connected: true, readsImages: true } })
function round(conta?: EstimateAskInput['conta'], calibracao?: OpinionBudgetInput['calibracao']) {
  return budgetOpinionRound({
    question: 'O que acha do texto?', draft: { text: 'Pão fresquinho todo dia, direto do forno.' },
    asker: { id: 'nina', name: 'Nina', title: 'Pesquisa', autonomy: 'act' },
    readers: ['teo', 'caio', 'bia'].map(READER), roundsUsed: 0,
    ...(calibracao === undefined ? {} : { calibracao }), ...(conta === undefined ? {} : { conta }),
  })
}
const HISTORY = {
  source: 'history' as const,
  tokensPerCall: { conversa: { input: { min: 3_000, max: 4_000 }, output: { min: 60, max: 160 } }, execucao: { input: { min: 3_200, max: 4_400 }, output: { min: 100, max: 500 } } },
  samples: { conversa: { tokens: 8, tempo: 0 }, execucao: { tokens: 8, tempo: 0 } },
}

describe('a round of opinions follows the same rule', () => {
  it('a subscription: no microUsd and no money in the footer or anywhere the screen reads; the internal list price stays for the host threshold and reports', () => {
    for (const conta of [undefined, { billing: 'subscription' as const }, { billing: 'subscription' as const, janelas: [WEEK] }, { billing: 'unknown' as const, janelas: [WEEK] }]) {
      const result = round(conta, HISTORY)
      expect(result.cost?.microUsd).toBeNull()
      expect(result.cost?.referenciaMicroUsd.max).toBeGreaterThan(0)
      const visible = [result.rodape, result.cost?.impacto ?? '', result.motivo, result.proposta ?? '', JSON.stringify({ ...result.cost, referenciaMicroUsd: undefined, microUsd: undefined })].join('\n')
      expect(visible).not.toMatch(MONEY)
    }
  })
  it('the footer adds the share of the window once it is calibrated, and "cota não medida" never appears as a share', () => {
    const calibracoes: QuotaCalibration[] = [{ window: 'week', tokensPerPoint: { min: 200, max: 400 }, rows: 5 }]
    const calibrated = round({ billing: 'subscription', janelas: [WEEK], calibracoes }, HISTORY)
    expect(calibrated.cost?.quota?.origin).toBe('calibrated')
    expect(calibrated.rodape).toMatch(/^≈ 3 respostas · de .+ a .+ tokens · cerca de \d+(–\d+)?% da sua janela da semana$/u)
    const notMeasured = round({ billing: 'subscription', janelas: [WEEK] }, HISTORY)
    expect(notMeasured.cost?.quota).toMatchObject({ pct: null, origin: 'not-measured' })
    expect(notMeasured.cost?.impacto).toBe('cota não medida')
    expect(notMeasured.rodape).toMatch(/^≈ 3 respostas · de .+ a .+ tokens$/u)
  })
  it('an API account gets US$ as an estimate, in the cost and in the footer (when the person\'s own turns back it)', () => {
    const result = round({ billing: 'api' }, HISTORY)
    expect(result.cost?.microUsd?.max).toBeGreaterThan(0)
    expect(result.cost?.quota).toBeNull()
    expect(result.rodape).toMatch(/ · (≈ US\$ [\d,]+(–[\d,]+)? \(estimativa\)|menos de US\$ 0,01 \(estimativa\))$/u)
  })
})

describe('a review follows the same rule', () => {
  it('a subscription: no microUsd, the calls as the impact; an API account: US$', () => {
    const sub = reviewCost({ conta: { billing: 'subscription' } })
    expect(sub.microUsd).toBeNull()
    expect(sub.billing).toBe('subscription')
    expect(sub.impacto).toBe('≈ 1 a 5 chamadas da sua IA')
    expect([sub.rotulo, sub.impacto, JSON.stringify({ ...sub, referenciaMicroUsd: undefined, microUsd: undefined })].join('\n')).not.toMatch(MONEY)
    expect(sub.referenciaMicroUsd.max).toBeGreaterThan(0)
    const api = reviewCost({ conta: { billing: 'api' } })
    expect(api.microUsd?.max).toBeGreaterThan(0)
    expect(api.impacto).toMatch(/US\$/u)
    expect(reviewCost({}).billing).toBe('unknown')
    expect(reviewCost({}).microUsd).toBeNull()
  })
})

// ---- quotaPairs: pairs of readings of ONE cycle, closed as soon as the meter rose enough ---------------------------------------

describe('quotaPairs: readings → pairs for the calibration', () => {
  const R = '2026-11-07T16:00:00.020Z'
  const at = (hour: number): string => `2026-11-05T${String(hour).padStart(2, '0')}:00:00.000Z`
  const read = (hour: number, usedPercent: number, resetsAt: string | undefined = R, windowId = 'week') => ({ at: at(hour), windowId, usedPercent, ...(resetsAt === undefined ? {} : { resetsAt }) })
  /** 100 tokens per hour passed, so a pair's tokens say how long it spanned. */
  const perHour = (from: string, to: string): number => (Date.parse(to) - Date.parse(from)) / 3_600_000 * 100

  it('a pair closes only when the meter rose by at least 3 points; small rises accumulate into the next pair', () => {
    const pairs = quotaPairs([read(1, 50), read(2, 51), read(3, 52), read(5, 54), read(9, 61)], perHour)
    expect(pairs).toEqual([
      { window: 'week', deltaPercent: 4, tokens: 400 },
      { window: 'week', deltaPercent: 7, tokens: 400 },
    ])
  })

  it('readings of different cycles are never paired, but the clock may differ by milliseconds inside one cycle', () => {
    const jitter = quotaPairs([read(1, 50), read(3, 54, '2026-11-07T16:00:00.071Z')], perHour)
    expect(jitter).toEqual([{ window: 'week', deltaPercent: 4, tokens: 200 }])
    const refill = quotaPairs([read(1, 90), read(3, 5, '2026-11-14T16:00:00.000Z'), read(5, 12, '2026-11-14T16:00:00.000Z')], perHour)
    expect(refill).toEqual([{ window: 'week', deltaPercent: 7, tokens: 200 }])
  })

  it('a fall in the meter starts over; windows are kept apart; a model-scoped window and bad rows are ignored; unsorted input is fine', () => {
    expect(quotaPairs([read(1, 60), read(2, 40), read(4, 45)], perHour)).toEqual([{ window: 'week', deltaPercent: 5, tokens: 200 }])
    const two = quotaPairs([read(1, 10, R, '5h'), read(3, 15, R, '5h'), read(1, 50), read(4, 60)], perHour)
    expect(two).toEqual([{ window: '5h', deltaPercent: 5, tokens: 200 }, { window: 'week', deltaPercent: 10, tokens: 300 }])
    expect(quotaPairs([read(1, 10, R, 'model_scoped:Fable'), read(5, 90, R, 'model_scoped:Fable')], perHour)).toEqual([])
    expect(quotaPairs([read(9, 61), read(1, 50), { at: 'nope', windowId: 'week', usedPercent: 99 }, { at: at(5), windowId: 'week', usedPercent: Number.NaN }], perHour)).toEqual([{ window: 'week', deltaPercent: 11, tokens: 800 }])
  })

  it('a pair with no Persona tokens between the readings (all the use was outside) is not a pair', () => {
    expect(quotaPairs([read(1, 50), read(3, 60)], () => 0)).toEqual([])
  })

  it('pairs → calibration → the share of the window of an ask, end to end', () => {
    const pairs = quotaPairs([read(1, 50), read(3, 54), read(6, 59), read(9, 65)], (from, to) => (from.includes('T01:') ? 400_000 : from.includes('T03:') ? 450_000 : 540_000) + (to === '' ? 1 : 0))
    const calibration = calibrateQuota(pairs, 'week')
    expect(calibration).toEqual({ window: 'week', tokensPerPoint: { min: 90_000, max: 100_000 }, rows: 3 })
  })
})
