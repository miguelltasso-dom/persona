// D-092 / USD-2 (COTA-NAO-DOLAR-SPEC, Muse): a SUBSCRIPTION never shows money on screen — it shows the share of its quota window and the tokens;
// US$ only for an API key (where each call is billed). The words "custo"/"cost" leave the screens that are mine.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { proactiveCostLine } from '../src/client/approvals/approvals-ui-helpers.ts'
import type { ProactiveCostEstimate } from '../src/client/approvals/proactivity-mock-data.ts'
import { parseUsage } from '../src/client/chat/quota-text.ts'
import { pt as approvalsPt } from '../src/client/locale/approvals/locales.ts'

const SOURCES = join(__dirname, '..', 'locale-sources')
const json = (file: string): Record<string, string> => JSON.parse(readFileSync(join(SOURCES, file), 'utf8')) as Record<string, string>

const subscription = (extra: Partial<ProactiveCostEstimate> = {}): ProactiveCostEstimate => ({
  tokens: 12_000,
  runs: 3,
  usage: { billing: 'subscription', quota: { pct: { min: 3, max: 4 }, window: '5h' } },
  ...extra,
})

describe('the cost line of a proposal (Aprovações)', () => {
  it('subscription: tokens and runs, plus "cerca de {pct}% da janela" — no money', () => {
    const { text } = proactiveCostLine(approvalsPt, subscription())
    expect(text).toContain('12.000')
    expect(text).toMatch(/cerca de 3–4% da janela/u)
    expect(text).not.toMatch(/\$|custo|cost/iu)
  })

  it('subscription with almost nothing: "quase nada da sua janela"', () => {
    const { text } = proactiveCostLine(approvalsPt, subscription({ usage: { billing: 'subscription', quota: { pct: { min: 0, max: 0.4 }, window: '5h' } } }))
    expect(text).toContain('quase nada da sua janela')
  })

  it('subscription: even a host that wrongly sends a US$ cannot put it on screen (it is never read without billing "api")', () => {
    const usage = parseUsage({ billing: 'subscription', quota: { pct: { min: 5, max: 6 }, window: 'week' }, custo: { microUsd: { min: 500_000, max: 900_000 } } })
    expect(usage?.usd).toBeUndefined()
    const { text } = proactiveCostLine(approvalsPt, { tokens: 1000, runs: 1, ...(usage === undefined ? {} : { usage }) })
    expect(text).not.toMatch(/\$/u)
  })

  it('unknown account type: never money (the safe default)', () => {
    const { text } = proactiveCostLine(approvalsPt, { tokens: 1000, runs: 1, usage: { billing: 'unknown', usd: { min: 1, max: 2 } } })
    expect(text).not.toMatch(/\$/u)
  })

  it('API key: the US$ is shown, as an estimate', () => {
    const { text } = proactiveCostLine(approvalsPt, { tokens: 1000, runs: 1, usage: { billing: 'api', usd: { min: 0.4, max: 0.6 } } })
    expect(text).toMatch(/≈ US\$ 0[.,]40–0[.,]60/u)
  })

  it('no usage information: the line is the one it always was (tokens and runs)', () => {
    const { text } = proactiveCostLine(approvalsPt, { tokens: 12_000, runs: 3 })
    expect(text).toBe(approvalsPt['proactive.costLine'].replace('{tokens}', '12.000').replace('{runs}', '3'))
  })
})

describe('the words of the screens that are mine say "uso", not "custo"', () => {
  it('Aprovações and the rules screen', () => {
    expect(json('approvals.pt.json')['proactive.costLabel']).toBe('Uso estimado')
    expect(json('approvals.en.json')['proactive.costLabel']).toBe('Estimated usage')
    expect(json('approvals.pt.json')['inbox.section.cost']).toBe('Impacto e uso')
    expect(json('approvals.en.json')['inbox.section.cost']).toBe('Impact and usage')
    // "cota" is jargon for the layperson (rules-budget-plain): the plain word is "plano", and still no "custo"
    expect(json('rules.pt.json')['limits.subtitle']).toBe('Evita barulho e gasto descontrolado do seu plano')
    expect(json('rules.en.json')['limits.subtitle']).toBe('Prevents noise and runaway spending on your plan')
  })

  it('no value in Aprovações, Regras or Uso e limites talks about money (custo / cost / $)', () => {
    const offenders: string[] = []
    for (const file of readdirSync(SOURCES).filter(name => /^(approvals|rules|usage)\.(pt|en)\.json$/u.test(name))) {
      for (const [key, value] of Object.entries(json(file))) {
        if (/\bcusto\b|\bcost\b|\$/iu.test(value.replace(/\$\{/gu, ''))) offenders.push(`${file} › ${key}: ${value}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('across the whole app the only locale text with a dollar sign is the API-key wording (quota.usd*)', () => {
    const offenders: string[] = []
    for (const file of readdirSync(SOURCES).filter(name => name.endsWith('.json'))) {
      for (const [key, value] of Object.entries(json(file))) {
        if (value.includes('$') && !key.startsWith('quota.usd') && key !== 'action.pay') offenders.push(`${file} › ${key}: ${value}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

// Fixtures in the exact shape of contracts/usd-subscription.md (Tally, USD-1).
const SUBSCRIPTION_WEEK = {
  billing: 'subscription',
  custo: null,
  quota: { window: 'week', pct: null, usedPct: 67, remainingPct: 33, resetsAt: '2026-11-09T00:00:00Z', origin: 'not-measured' },
  impacto: 'cota não medida',
}
const SUBSCRIPTION_CALIBRATED = {
  billing: 'subscription',
  custo: null,
  quota: { window: '5h', pct: { min: 3.2, max: 4.4 }, usedPct: 41, remainingPct: 59, origin: 'calibrated', basis: '5 leituras da sua conta' },
}
const API_KEY = { billing: 'api', custo: { microUsd: { min: 400_000, max: 600_000 } }, quota: null }
const UNKNOWN_ACCOUNT = { billing: 'unknown', custo: null, quota: null }

describe('the host contract fixtures (USD-1)', () => {
  const line = (view: unknown): string => proactiveCostLine(approvalsPt, { tokens: 8000, runs: 2, ...(parseUsage(view) === undefined ? {} : { usage: parseUsage(view)! }) }).text

  const BASE = approvalsPt['proactive.costLine'].replace('{tokens}', '8.000').replace('{runs}', '2')

  it('subscription, no % of the request (pct null): the OFFICIAL use of the window ("você já usou 67% da semana") — never 0%, never "cota não medida", never money', () => {
    const text = line(SUBSCRIPTION_WEEK)
    expect(text).toBe(`${BASE}, você já usou 67% da semana`)
    expect(text).not.toMatch(/\$|custo|cost|não medida|nao medida|\b0%/iu)
  })

  it('the 5 h window says "da janela de 5 h"; no official use and no % = tokens and runs only', () => {
    const fiveHour = line({ billing: 'subscription', custo: null, quota: { window: '5h', pct: null, usedPct: 41, origin: 'not-measured' } })
    expect(fiveHour).toBe(`${BASE}, você já usou 41% da janela de 5 h`)
    expect(line({ billing: 'subscription', custo: null, quota: null })).toBe(BASE)
  })

  it('subscription, calibrated: the share of the window, no money', () => {
    const text = line(SUBSCRIPTION_CALIBRATED)
    expect(text).toMatch(/cerca de 3–4% da janela/u)
    expect(text).not.toMatch(/\$|custo|cost/iu)
  })

  it('API key: the US$ estimate; unknown account: no money (the safe error is hiding it)', () => {
    expect(line(API_KEY)).toMatch(/≈ US\$ 0[.,]40–0[.,]60/u)
    expect(line(UNKNOWN_ACCOUNT)).not.toMatch(/\$/u)
  })

  it('switching account switches the form, with nothing stuck', () => {
    const forms = [SUBSCRIPTION_CALIBRATED, API_KEY, SUBSCRIPTION_CALIBRATED].map(view => /\$/u.test(line(view)))
    expect(forms).toEqual([false, true, false])
  })
})
