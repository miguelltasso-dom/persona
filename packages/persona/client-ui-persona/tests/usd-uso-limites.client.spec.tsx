// @vitest-environment jsdom
// D-092 / USD-2: "Uso e limites" of a SUBSCRIPTION shows the quota windows, the AI use and the reset — and never money.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { pt as usagePt } from '../src/client/locale/usage/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { MOCK_LIMIT_NOTICE, MOCK_USAGE_METERS, MOCK_USAGE_PROVIDER_POOLS } from '../src/client/usage/mock-data.ts'
import { MOCK_USAGE_TOKEN_PANEL } from '../src/client/usage/mock-usage-token-panel.ts'
import { UsageLimits } from '../src/client/usage/UsageLimits.tsx'

installPreviewTheme()
afterEach(() => { cleanup() })

describe('Uso e limites (assinatura): nenhum dinheiro no DOM', () => {
  it('the whole screen — connections, pooled windows, notice and the token panel — has no "$", no "US$" and no "custo"', () => {
    const { container } = render(
      <PreviewFrame brandLabel="Persona">
        <UsageLimits
          dict={usagePt}
          meters={MOCK_USAGE_METERS}
          providerPools={MOCK_USAGE_PROVIDER_POOLS}
          tokenPanel={MOCK_USAGE_TOKEN_PANEL}
          limitNotice={MOCK_LIMIT_NOTICE}
          showLimitNotice
        />
      </PreviewFrame>,
    )
    const text = container.textContent ?? ''
    expect(text.length).toBeGreaterThan(100)
    expect(text).not.toMatch(/\$|US\$|\bcusto\b|\bcost\b/iu)
    // what it does show: the windows and the AI use, in the layperson's words
    expect(text).toMatch(/%/u)
    expect(text).toMatch(/uso de IA/u)
    expect(text).not.toMatch(/\btokens?\b/iu) // Carbon P2-01: the layperson never reads "tokens"
  })
})
