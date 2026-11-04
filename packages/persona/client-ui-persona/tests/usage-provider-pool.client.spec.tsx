// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { UsageLimits } from '../src/client/usage/UsageLimits.tsx'
import { MOCK_USAGE_METERS, MOCK_USAGE_PROVIDER_POOLS } from '../src/client/usage/mock-data.ts'
import { MOCK_USAGE_PROVIDER_POOL_NO_LIMITS } from '../src/client/usage/mock-usage-pools.ts'
import { pt as usagePt } from '../src/client/locale/usage/locales.ts'

afterEach(() => { cleanup() })

describe('UsageLimits pooled bars (T3 §7)', () => {
  it('renders PooledQuotaBar windows and AccountRow under the pool', () => {
    render(
      <UsageLimits
        dict={usagePt}
        meters={MOCK_USAGE_METERS}
        providerPools={MOCK_USAGE_PROVIDER_POOLS}
        showLimitNotice={false}
      />,
    )
    expect(screen.getByText(usagePt['section.limits'])).toBeTruthy()
    expect(screen.getByText(usagePt['pool.windowFiveHour'])).toBeTruthy()
    expect(screen.getByText(usagePt['pool.windowWeek'])).toBeTruthy()
    expect(screen.getByText('Trabalho')).toBeTruthy()
    expect(screen.getByText('60% sobrando')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Extra.*não informa esta janela/ })).toBeTruthy()
  })

  it('shows no-limits line and Conta principal for default account', () => {
    render(
      <UsageLimits
        dict={usagePt}
        meters={[]}
        providerPools={[MOCK_USAGE_PROVIDER_POOL_NO_LIMITS]}
        showLimitNotice={false}
      />,
    )
    expect(screen.getByText(usagePt['pool.providerNoLimits'].replace('{provider}', 'Claude'))).toBeTruthy()
    expect(screen.queryByText(usagePt['pool.windowFiveHour'])).toBeNull()
    expect(screen.getByText(usagePt['pool.defaultAccount'])).toBeTruthy()
  })
})
