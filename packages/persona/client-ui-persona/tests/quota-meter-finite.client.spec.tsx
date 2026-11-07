// @vitest-environment jsdom
// Muse 05/11: QuotaMeter never renders aria-valuenow="NaN" (axe aria-valid-attr-value, critical, Quill's Conexões capture).
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QuotaMeter } from '../src/client/primitives/PersonaCard.tsx'

describe('QuotaMeter', () => {
  it('renders a valid meter for a real percentage', () => {
    const { container } = render(<QuotaMeter label="5 h" pct={42.4} />)
    const meter = container.querySelector('[role="progressbar"],[role="meter"]')
    expect(meter?.getAttribute('aria-valuenow')).toBe('42')
    expect(meter?.getAttribute('aria-label')).toBe('5 h')
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, '30' as unknown as number, null as unknown as number])('renders nothing for %s', (pct) => {
    const { container } = render(<QuotaMeter label="5 h" pct={pct} />)
    expect(container.querySelector('[role="progressbar"],[role="meter"]')).toBeNull()
    expect(container.innerHTML).not.toContain('NaN')
  })
})
