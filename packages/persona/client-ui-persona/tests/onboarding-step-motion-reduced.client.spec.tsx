// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingStepMotion } from '../src/client/onboarding/OnboardingStepMotion.tsx'
import { StaggerEntrance } from '../src/client/primitives/StaggerEntrance.tsx'

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('com prefers-reduced-motion o onboarding continua visível (achado na captura: passo 3 em branco)', () => {
  it('o conteúdo do passo não fica em opacity 0', () => {
    render(<OnboardingStepMotion step={3}><h1>Ferramentas de IA</h1></OnboardingStepMotion>)
    const wrapper = screen.getByRole('heading', { name: 'Ferramentas de IA' }).parentElement as HTMLElement
    expect(wrapper.style.opacity).not.toBe('0')
  })

  it('a entrada escalonada das apresentações também continua visível', () => {
    render(<ul><StaggerEntrance as="li" index={2}>Atlas</StaggerEntrance></ul>)
    expect((screen.getByText('Atlas') as HTMLElement).style.opacity).not.toBe('0')
  })
})
