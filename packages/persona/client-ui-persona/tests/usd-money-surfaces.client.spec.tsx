// @vitest-environment jsdom
// D-092 / USD-2 (COTA-NAO-DOLAR-SPEC): the second half of the guard that `usd-uso-limites` and `usd-no-dollar` started. A SUBSCRIPTION never shows money on
// "Uso e limites" or on the persona card, in Portuguese or English; the API-key account shows tokens and calls, never a dollar and never a "US$ —" placeholder
// (the host sends no spend yet: Muse 02:35); and even a host that wrongly sends dollars cannot put them on screen (the adapters do not carry them).
import { cleanup, render } from '@testing-library/react'
import type { UsagePanelView } from '@deepseek-ai/dsh-persona-host/types'
import { afterEach, describe, expect, it } from 'vitest'
import { usagePanelToUi } from '../src/client/data/adapters/usage-panel.ts'
import { en as profileEn } from '../src/client/locale/profile/locales.ts'
import { en as usageEn, pt as usagePt } from '../src/client/locale/usage/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { PersonaInfoCard, type PersonaCardInfo } from '../src/client/profile/PersonaInfoCard.tsx'
import { MOCK_LIMIT_NOTICE, MOCK_USAGE_METERS, MOCK_USAGE_PROVIDER_POOLS } from '../src/client/usage/mock-data.ts'
import { MOCK_USAGE_PROVIDER_POOL_NO_LIMITS } from '../src/client/usage/mock-usage-pools.ts'
import { MOCK_USAGE_TOKEN_PANEL } from '../src/client/usage/mock-usage-token-panel.ts'
import { UsageLimits } from '../src/client/usage/UsageLimits.tsx'

installPreviewTheme()
afterEach(() => { cleanup() })

/** "$", "US$", "R$", "custo"/"cost", "dólar"/"dollar": nothing that talks about money. */
const MONEY = /\$|\bcusto\b|\bcost\b|d[óo]lar|dollar/iu

const NINA: PersonaCardInfo = {
  personaId: 'nina',
  name: 'Nina',
  handle: '@nina',
  role: 'Pesquisa',
  sector: 'Produto',
  characterId: 'nina',
  systemRoles: ['coordination'],
  nowKind: 'working',
  nowText: 'Escrevendo o folheto de novembro',
  presence: 'online',
  talk: { everyone: true, names: [] },
  ownerName: 'Ana',
  engineLabel: 'Plano do Claude · Sonnet',
  activeAccountLabel: 'Claude · Trabalho',
  accountPolicyText: 'Troca para Pessoal no limite',
  quota: { fiveHourPct: 41, weekPct: 67, limitedUntil: '18:30' },
}

describe('Uso e limites: nenhum dinheiro no DOM (assinatura e chave de API, pt e en)', () => {
  it('the whole screen in English has no "$", no "US$" and no "cost" either', () => {
    const { container } = render(
      <PreviewFrame brandLabel="Persona">
        <UsageLimits dict={usageEn} meters={MOCK_USAGE_METERS} providerPools={MOCK_USAGE_PROVIDER_POOLS} tokenPanel={MOCK_USAGE_TOKEN_PANEL} limitNotice={MOCK_LIMIT_NOTICE} showLimitNotice />
      </PreviewFrame>,
    )
    const text = container.textContent ?? ''
    expect(text.length).toBeGreaterThan(100)
    expect(text).not.toMatch(MONEY)
    expect(text).toMatch(/%/u)
  })

  it('an API-key provider (no quota window to report): the AI use, and neither a dollar nor a "US$ —" placeholder', () => {
    const { container } = render(
      <PreviewFrame brandLabel="Persona">
        <UsageLimits dict={usagePt} meters={[]} providerPools={[MOCK_USAGE_PROVIDER_POOL_NO_LIMITS]} tokenPanel={MOCK_USAGE_TOKEN_PANEL} showLimitNotice={false} />
      </PreviewFrame>,
    )
    const text = container.textContent ?? ''
    expect(text).toMatch(/uso de IA/u)
    expect(text).not.toMatch(/\btokens?\b/iu)
    expect(text).not.toMatch(MONEY)
  })

  it('a host that wrongly sends dollars in the usage panel cannot put them on screen: the adapter carries only tokens, calls and the cache rate', () => {
    const view: UsagePanelView = {
      origin: 'measured',
      tokensPerSuccessfulTask: 12_400,
      cacheHitRate: 0.42,
      byPersona: [{ key: 'nina', tokens: 48_000, calls: 12, cacheHitRate: 0.38 }],
      byKind: [{ key: 'execution', tokens: 54_000, calls: 14, cacheHitRate: 0.4 }],
    }
    // Not a fresh object literal: TypeScript lets the extra fields through, like a real wire would.
    const wrong = { ...view, costUsd: 3.2, microUsd: { min: 1, max: 2 }, byPersona: [{ ...view.byPersona[0]!, costUsd: 1.2 }] }
    const ui = usagePanelToUi(wrong, { nina: 'Nina' })
    expect(JSON.stringify(ui)).not.toMatch(/usd|cost|micro/iu)
    const { container } = render(
      <PreviewFrame brandLabel="Persona">
        <UsageLimits dict={usagePt} meters={[]} tokenPanel={ui} showLimitNotice={false} />
      </PreviewFrame>,
    )
    expect(container.textContent ?? '').not.toMatch(MONEY)
    expect(container.textContent ?? '').toMatch(/Nina/u)
  })
})

describe('o cartão da persona: nenhum dinheiro no DOM', () => {
  it('subscription: the two quota windows, the account and its policy — no money (pt)', () => {
    const { container } = render(<PersonaInfoCard info={NINA} />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/Nina/u)
    expect(text).toMatch(/41%/u)
    expect(text).not.toMatch(MONEY)
  })

  it('subscription in English', () => {
    const { container } = render(<PersonaInfoCard info={NINA} dict={profileEn} />)
    expect(container.textContent ?? '').not.toMatch(MONEY)
  })

  it('API key (no official quota to show): the engine line only — no dollar, no placeholder', () => {
    const { container } = render(<PersonaInfoCard info={{ ...NINA, engineLabel: 'dsh · default', quota: undefined, activeAccountLabel: undefined, accountPolicyText: undefined }} />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/DeepSeek/u)
    expect(text).not.toMatch(MONEY)
  })
})
