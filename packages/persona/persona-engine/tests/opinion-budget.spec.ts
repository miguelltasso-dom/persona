import { describe, expect, it } from 'vitest'
import { budgetOpinionRound, DEFAULT_DAILY_ASKS, DEFAULT_MAX_REPLIES, DEFAULT_OPINION_ROUNDS, MAX_OPINION_IMAGES, MAX_OPINION_ROUNDS, type OpinionBudgetInput, type OpinionReader } from '../src/ux/opinion-budget.ts'
import type { AskCalibration } from '../src/ux/estimate-ask.ts'

const CLAUDE = { cli: 'claude', connected: true, readsImages: true }
const CODEX = { cli: 'codex', connected: true, readsImages: false }
const reader = (id: string, over: Partial<OpinionReader> = {}): OpinionReader => ({ id, name: id, title: 'Equipe', motor: CLAUDE, ...over })
const TEAM = [reader('teo'), reader('bia'), reader('lia')]
const BASE: OpinionBudgetInput = {
  question: 'O que acham deste cartaz?',
  draft: { text: 'Cartaz do sábado: pão quente às 7h.' },
  asker: { id: 'atlas', name: 'Atlas', autonomy: 'act' },
  readers: TEAM,
  roundsUsed: 0,
}
const ask = (over: Partial<OpinionBudgetInput> = {}) => budgetOpinionRound({ ...BASE, ...over })

describe('the caps: no loop, ever', () => {
  it('defaults: 2 rounds per Task, 6 asks a day; the first round is "Rodada 1 de 2" with one left', () => {
    const result = ask()
    expect(DEFAULT_OPINION_ROUNDS).toBe(2)
    expect(DEFAULT_DAILY_ASKS).toBe(6)
    expect(result).toMatchObject({ decision: 'ask', round: 1, roundsCap: 2, roundsLeft: 1, dailyCap: 6 })
  })

  it('the second round is the last; the third is refused with the honest line and no call', () => {
    expect(ask({ roundsUsed: 1 })).toMatchObject({ decision: 'ask', round: 2, roundsLeft: 0 })
    const third = ask({ roundsUsed: 2 })
    expect(third).toMatchObject({ decision: 'stop', stop: 'rounds-cap', round: 2, roundsLeft: 0, asked: [] })
    expect(third.cost).toBeUndefined()
    expect(third.motivo).toContain('rodadas de opinião')
  })

  it('whatever number of rounds were used, a Task never gets past its cap (a hostile or buggy counter cannot reopen it)', () => {
    for (const used of [2, 3, 10, 1_000, Number.MAX_SAFE_INTEGER]) expect(ask({ roundsUsed: used }).stop).toBe('rounds-cap')
    expect(ask({ roundsUsed: Number.NaN }).decision).toBe('ask')
    expect(ask({ roundsUsed: -5 })).toMatchObject({ decision: 'ask', round: 1 })
  })

  it('the person sets 1..3 and the module clamps anything else', () => {
    expect(ask({ policy: { roundsCap: 1 }, roundsUsed: 1 }).stop).toBe('rounds-cap')
    expect(ask({ policy: { roundsCap: 3 }, roundsUsed: 2 })).toMatchObject({ decision: 'ask', round: 3, roundsLeft: 0 })
    expect(ask({ policy: { roundsCap: 9 } }).roundsCap).toBe(MAX_OPINION_ROUNDS)
    expect(ask({ policy: { roundsCap: 0 } }).roundsCap).toBe(1)
    expect(ask({ policy: { roundsCap: Number.NaN } }).roundsCap).toBe(DEFAULT_OPINION_ROUNDS)
  })

  it('an opinion request counts once against the asker\'s daily cap; at the cap there is no round and the reason is the cap', () => {
    expect(ask({ asker: { ...BASE.asker, asksToday: 5 } }).decision).toBe('ask')
    expect(ask({ asker: { ...BASE.asker, asksToday: 6 } })).toMatchObject({ decision: 'stop', stop: 'daily-cap' })
    expect(ask({ asker: { ...BASE.asker, asksToday: 2 }, policy: { dailyCap: 2 } }).stop).toBe('daily-cap')
    expect(ask({ policy: { dailyCap: 99 } }).dailyCap).toBe(20)
  })

  it('the rounds cap is checked before the daily cap and before any price: a stopped round costs nothing to compute', () => {
    const result = ask({ roundsUsed: 2, asker: { ...BASE.asker, asksToday: 99 } })
    expect(result.stop).toBe('rounds-cap')
    expect(result.cost).toBeUndefined()
  })
})

describe('who is asked: nobody is skipped in silence', () => {
  it('the asker never answers their own request, even if the host passed them', () => {
    const result = ask({ readers: [reader('atlas'), ...TEAM] })
    expect(result.asked).toEqual(['teo', 'bia', 'lia'])
    expect(result.skipped).toEqual([])
  })

  it('paused, at the quota limit and engine-not-connected colleagues are not called, and each is listed with its reason', () => {
    const result = ask({ readers: [reader('teo'), reader('bia', { paused: true }), reader('lia', { atLimit: true }), reader('ivo', { motor: { cli: 'none', connected: false, readsImages: false } })] })
    expect(result.asked).toEqual(['teo'])
    expect(result.skipped).toEqual([{ id: 'bia', why: 'paused' }, { id: 'lia', why: 'at-limit' }, { id: 'ivo', why: 'unavailable' }])
    expect(result.cost?.respostas).toBe(1)
  })

  it('an image goes only to colleagues whose engine sees images; the others are listed as no-vision, and a text draft asks everyone', () => {
    const readers = [reader('teo'), reader('bia', { motor: CODEX }), reader('lia')]
    const withImage = ask({ draft: { images: [{}] }, readers })
    expect(withImage.asked).toEqual(['teo', 'lia'])
    expect(withImage.skipped).toEqual([{ id: 'bia', why: 'no-vision' }])
    const textOnly = ask({ readers })
    expect(textOnly.asked).toEqual(['teo', 'bia', 'lia'])
  })

  it('nobody able to answer: no round, never a call; if the only reason is vision it says so', () => {
    expect(ask({ readers: [] })).toMatchObject({ decision: 'stop', stop: 'nobody' })
    expect(ask({ readers: [reader('teo', { paused: true })] }).stop).toBe('nobody')
    const blind = ask({ draft: { images: [{}] }, readers: [reader('teo', { motor: CODEX }), reader('bia', { motor: CODEX })] })
    expect(blind).toMatchObject({ decision: 'stop', stop: 'no-vision' })
    expect(blind.skipped).toHaveLength(2)
  })

  it('a big audience is cut at the limit and the cut is said (over-limit)', () => {
    const crowd = Array.from({ length: 10 }, (_, n) => reader(`p${String(n)}`))
    const result = ask({ readers: crowd })
    expect(result.asked).toHaveLength(DEFAULT_MAX_REPLIES)
    expect(result.skipped.filter(row => row.why === 'over-limit')).toHaveLength(4)
    expect(ask({ readers: crowd, policy: { maxReplies: 2 } }).asked).toEqual(['p0', 'p1'])
  })

  it('an empty draft is not worth a round', () => {
    expect(ask({ draft: {} }).stop).toBe('draft-empty')
    expect(ask({ draft: { text: '   ' } }).stop).toBe('draft-empty')
    expect(ask({ draft: { images: [{}] } }).decision).toBe('ask')
  })
})

describe('the price: exact calls, ranges for tokens and cost, an estimate until measured', () => {
  it('calls are exact: one reply per colleague asked plus ONE consolidation by the asker', () => {
    const result = ask()
    expect(result.cost?.respostas).toBe(3)
    expect(result.cost?.chamadas).toEqual({ min: 4, max: 4 })
  })

  it('tokens and cost are ordered ranges and the origin is estimate (never "measured")', () => {
    const cost = ask().cost
    expect(cost?.origin).toBe('estimate')
    expect(cost?.fonte).toBeUndefined()
    expect(cost?.tokens.min).toBeGreaterThan(0)
    expect(cost?.tokens.max).toBeGreaterThan(cost?.tokens.min ?? 0)
    // the list-price figure every account has INTERNALLY (the screen gets money only on an API account: usd-subscription.spec)
    expect(cost?.referenciaMicroUsd.max).toBeGreaterThan(cost?.referenciaMicroUsd.min ?? 0)
    expect(cost?.baseDoVendorIncluida).toBe(false)
  })

  it('more colleagues cost more; a second round with the same people costs the same', () => {
    const two = ask({ readers: TEAM.slice(0, 2) }).cost
    const three = ask().cost
    expect(three?.tokens.max).toBeGreaterThan(two?.tokens.max ?? 0)
    expect(ask({ roundsUsed: 1 }).cost?.tokens).toEqual(three?.tokens)
  })

  it('an image is counted in each call (replies and consolidation), and a bigger picture costs more', () => {
    const text = ask().cost
    const small = ask({ draft: { images: [{ size: { width: 200, height: 150 } }] } }).cost
    const large = ask({ draft: { images: [{ size: { width: 1500, height: 1000 } }] } }).cost
    expect(small?.imagens.count).toBe(1)
    expect(small?.tokens.min).toBeGreaterThan(text?.tokens.min ?? 0)
    expect(large?.imagens.tokens.min).toBeGreaterThan(small?.imagens.tokens.min ?? 0)
    // images are paid once per call: 3 replies + 1 consolidation
    const one = ask({ draft: { images: [{ size: { width: 1500, height: 1000 } }] } }).cost?.imagens.tokens.min ?? 0
    expect(one % 4).toBe(0)
  })

  it('an unknown image size gives the wide range instead of a made-up number', () => {
    const unknown = ask({ draft: { images: [{}] } }).cost
    const known = ask({ draft: { images: [{ size: { width: 600, height: 400 } }] } }).cost
    expect((unknown?.imagens.tokens.max ?? 0) - (unknown?.imagens.tokens.min ?? 0)).toBeGreaterThan((known?.imagens.tokens.max ?? 0) - (known?.imagens.tokens.min ?? 0))
  })

  it('at most MAX_OPINION_IMAGES images are counted (the runner refuses more)', () => {
    const many = ask({ draft: { images: Array.from({ length: 9 }, () => ({})) } }).cost
    expect(many?.imagens.count).toBe(MAX_OPINION_IMAGES)
  })

  it('the person\'s own measured turns make it calibrated, and the footer then carries the tokens', () => {
    const calibracao: AskCalibration = {
      source: 'history',
      tokensPerCall: {
        conversa: { input: { min: 30_000, max: 40_000 }, output: { min: 50, max: 120 } },
        execucao: { input: { min: 50_000, max: 70_000 }, output: { min: 200, max: 900 } },
      },
      samples: { conversa: { tokens: 12, tempo: 0 }, execucao: { tokens: 8, tempo: 0 } },
    }
    const result = ask({ calibracao })
    expect(result.cost).toMatchObject({ origin: 'calibrated', fonte: 'historico', baseDoVendorIncluida: true })
    expect(result.rodape).toMatch(/^≈ 3 respostas · de .+ a .+ tokens$/u)
  })

  it('too few measured rows are ignored: still an estimate and the footer carries no cost', () => {
    const calibracao: AskCalibration = {
      source: 'history',
      tokensPerCall: { conversa: { input: { min: 30_000, max: 40_000 }, output: { min: 50, max: 120 } } },
      samples: { conversa: { tokens: 2, tempo: 0 } },
    }
    const result = ask({ calibracao })
    expect(result.cost?.origin).toBe('estimate')
    expect(result.rodape).toBe('≈ 3 respostas')
  })

  it('only a measured conversa without a measured consolidation is partly calibrated, and the footer still carries no cost', () => {
    const calibracao: AskCalibration = {
      source: 'history',
      tokensPerCall: { conversa: { input: { min: 30_000, max: 40_000 }, output: { min: 50, max: 120 } } },
      samples: { conversa: { tokens: 9, tempo: 0 } },
    }
    const result = ask({ calibracao })
    expect(result.cost?.origin).toBe('calibrated')
    expect(result.cost?.baseDoVendorIncluida).toBe(false)
    expect(result.rodape).toBe('≈ 3 respostas')
  })
})

describe('autonomy', () => {
  it('"Sugere e espera": the persona proposes to the person first, with the count in the sentence', () => {
    const result = ask({ asker: { ...BASE.asker, autonomy: 'suggest' } })
    expect(result.decision).toBe('propose')
    expect(result.proposta).toBe('Posso pedir a opinião da equipe sobre O que acham deste cartaz? ≈ 3 respostas')
    // a long question is cut at a word and a missing one falls back to "este rascunho"
    const long = ask({ asker: { ...BASE.asker, autonomy: 'suggest' }, question: `${'palavra '.repeat(30)}?` }).proposta ?? ''
    expect(long).toMatch(/sobre (palavra )+palavra… ? ≈ 3 respostas$|sobre .+…? ≈ 3 respostas$/u)
    expect(ask({ asker: { ...BASE.asker, autonomy: 'suggest' }, question: '  ' }).proposta).toBe('Posso pedir a opinião da equipe sobre este rascunho? ≈ 3 respostas')
  })

  it('"Age dentro de limites": asks directly, with no proposal sentence', () => {
    const result = ask()
    expect(result.decision).toBe('ask')
    expect(result.proposta).toBeUndefined()
  })

  it('the caps bind both: a persona that suggests does not even propose past the cap', () => {
    expect(ask({ asker: { ...BASE.asker, autonomy: 'suggest' }, roundsUsed: 2 }).decision).toBe('stop')
  })
})

describe('the words are for the person', () => {
  it('footer: "≈ 1 resposta" in the singular, nothing technical', () => {
    expect(ask({ readers: [reader('teo')] }).rodape).toBe('≈ 1 resposta')
  })

  it('motivo says how many answer and how many will not be called, in plain pt-BR', () => {
    expect(ask().motivo).toBe('3 colegas respondem, e a persona junta as opiniões')
    expect(ask({ readers: [reader('teo'), reader('bia', { paused: true })] }).motivo).toBe('1 colega responde; 1 não será chamado')
  })

  it('never throws on odd input', () => {
    expect(() => ask({ question: '', draft: { text: 'x' }, readers: [{ id: 'a', motor: { cli: '', connected: true, readsImages: true } }] })).not.toThrow()
    expect(() => ask({ roundsUsed: Number.POSITIVE_INFINITY, policy: { dailyCap: Number.NaN } })).not.toThrow()
  })
})

describe('images are billed as measured: cache-write price, calibrated origin (reports/image-cost-real.md)', () => {
  const sized = { size: { width: 1500, height: 1000 } }

  it('the image adds exactly its tokens at 1.25× the input price to each reply (cheap) and to the consolidation (own model)', () => {
    const text = ask().cost
    const image = ask({ draft: { text: BASE.draft.text as string, images: [sized] } }).cost
    // 1,816 tokens (the floor of the range for 1500×1000) × 1.25 = 2,270 µUSD per cheap call (price 1), × 3 for the persona tier
    expect((image?.referenciaMicroUsd.min ?? 0) - (text?.referenciaMicroUsd.min ?? 0)).toBe(3 * 2270 + 3 * 2270)
    expect((image?.tokens.min ?? 0) - (text?.tokens.min ?? 0)).toBe(4 * 1816)
  })

  it('known sizes are "calibrated" and say where the number comes from; an unknown size stays an estimate with no basis', () => {
    expect(ask({ draft: { images: [sized] } }).cost?.imagens).toMatchObject({ count: 1, origin: 'calibrated', basis: expect.stringContaining('2.018') as string })
    const unknown = ask({ draft: { images: [{}] } }).cost?.imagens
    expect(unknown).toMatchObject({ count: 1, origin: 'estimate' })
    expect(unknown).not.toHaveProperty('basis')
    expect(ask({ draft: { images: [sized, {}] } }).cost?.imagens.origin).toBe('estimate')
    // the rest of the round is still an estimate until the person's own history backs it
    expect(ask({ draft: { images: [sized] } }).cost?.origin).toBe('estimate')
  })
})
