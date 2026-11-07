// @vitest-environment jsdom
// Muse (D-069, 1ª entrega real): o subtítulo do passo 5 "Equipe trabalhando" é UMA frase só durante toda a espera. Se o nome de quem pegou o pedido
// já se sabe quando a espera começa: "{nome} está no pedido…"; se não, "Sua equipe está no pedido." e NÃO troca quando o nome chega (o texto pulava).
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { OnboardingFirstDeliveryStep } from '../src/client/onboarding/OnboardingFirstDeliveryStep.tsx'
import { pt } from '../src/client/locale/onboarding/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

type StepProps = React.ComponentProps<typeof OnboardingFirstDeliveryStep>

const base = (extra: Partial<StepProps> = {}): StepProps => ({
  dict: pt,
  shellT: (key: string) => key,
  greetingName: 'Ana',
  vaultReady: true,
  phase: 'working',
  onRequest: () => undefined,
  onEnterApp: () => undefined,
  onCelebrateContinue: () => undefined,
  ...extra,
})

/** A frase do subtítulo (o parágrafo "… está no pedido. A entrega aparece aqui e no #geral."). */
const subtitle = (container: HTMLElement): string => {
  const hit = [...container.querySelectorAll('p')].find(node => /está no pedido/u.test(node.textContent ?? ''))
  return hit?.textContent ?? ''
}

describe('subtítulo do "Equipe trabalhando"', () => {
  it('sem o nome no começo: "Sua equipe está no pedido." e NÃO troca quando o nome chega', () => {
    const { container, rerender } = render(<OnboardingFirstDeliveryStep {...base()} />)
    expect(subtitle(container)).toBe('Sua equipe está no pedido. A entrega aparece aqui e no #geral.')
    rerender(<OnboardingFirstDeliveryStep {...base({ workingPersonaName: 'Nina', workingCharacterId: 'nina' })} />)
    expect(subtitle(container)).toBe('Sua equipe está no pedido. A entrega aparece aqui e no #geral.')
    // a demora ("slow") também mantém a mesma frase
    rerender(<OnboardingFirstDeliveryStep {...base({ phase: 'slow', workingPersonaName: 'Nina', workingCharacterId: 'nina' })} />)
    expect(subtitle(container)).toBe('Sua equipe está no pedido. A entrega aparece aqui e no #geral.')
  })

  it('com o nome no começo: "Nina está no pedido…" desde o primeiro quadro, e fica', () => {
    const { container, rerender } = render(<OnboardingFirstDeliveryStep {...base({ workingPersonaName: 'Nina', workingCharacterId: 'nina' })} />)
    expect(subtitle(container)).toBe('Nina está no pedido. A entrega aparece aqui e no #geral.')
    rerender(<OnboardingFirstDeliveryStep {...base({ workingPersonaName: 'Bento', workingCharacterId: 'bento' })} />)
    expect(subtitle(container)).toBe('Nina está no pedido. A entrega aparece aqui e no #geral.')
  })

  it('ao sair da espera e voltar (novo pedido), a frase é decidida de novo', () => {
    const { container, rerender } = render(<OnboardingFirstDeliveryStep {...base()} />)
    expect(subtitle(container)).toContain('Sua equipe está no pedido')
    rerender(<OnboardingFirstDeliveryStep {...base({ phase: 'intro' })} />)
    rerender(<OnboardingFirstDeliveryStep {...base({ workingPersonaName: 'Luna', workingCharacterId: 'luna' })} />)
    expect(subtitle(container)).toContain('Luna está no pedido')
  })
})
