// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { UsageLimits } from '../src/client/usage/UsageLimits.tsx'
import { MOCK_USAGE_TOKEN_PANEL } from '../src/client/usage/mock-usage-token-panel.ts'
import { pt as usagePt } from '../src/client/locale/usage/locales.ts'

afterEach(() => { cleanup() })

describe('UsageTokenPanel (OPT-7)', () => {
  it('renders tokens section with origin chip', () => {
    render(
      <UsageLimits
        dict={usagePt}
        meters={[]}
        tokenPanel={MOCK_USAGE_TOKEN_PANEL}
        showLimitNotice={false}
      />,
    )
    expect(screen.getByText(usagePt['section.tokens'])).toBeTruthy()
    expect(screen.getByText(usagePt['origin.estimated'])).toBeTruthy()
    expect(screen.getByText(/42% reaproveitado de conversas anteriores/u)).toBeTruthy()
    expect(screen.getByText('Nina')).toBeTruthy()
  })
})
