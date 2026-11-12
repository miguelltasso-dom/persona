// @vitest-environment jsdom
// Muse L8 (passada de leigo nº 2): a Visão geral dizia "Olá!" sem nome mesmo depois de o passo 1 perguntar "Como podemos te chamar?". O app cria o membro como "Você" antes do
// onboarding e o host fica com o primeiro membro que vê, então o nome digitado se perdia. Agora ele é lembrado e a saudação o usa enquanto o membro ainda é o "Você".
import { afterEach, describe, expect, it } from 'vitest'
import { greetingName } from '../src/client/remote/ConnectedOverviewView.tsx'
import { readOnboardingDisplayName, writeOnboardingDisplayName } from '../src/client/shell/onboarding-persistence.ts'

afterEach(() => { localStorage.removeItem('persona.onboarding.displayName.v1') })

describe('o nome da saudação', () => {
  it('o membro ainda é o "Você" do app e a pessoa digitou "Miguel" no passo 1: a saudação usa "Miguel"', () => {
    writeOnboardingDisplayName('  Miguel  ')
    expect(readOnboardingDisplayName()).toBe('Miguel')
    for (const placeholder of ['Você', 'voce', 'owner', undefined, '']) expect(greetingName(placeholder)).toBe('Miguel')
  })

  it('um membro com nome de verdade ganha da memória do onboarding (o nome salvo no host vale)', () => {
    writeOnboardingDisplayName('Miguel')
    expect(greetingName('Clara')).toBe('Clara')
  })

  it('sem nome nenhum (nem do membro nem do passo 1): sem nome, a saudação cai para "Olá!"', () => {
    expect(greetingName(undefined)).toBeUndefined()
    expect(greetingName('Você')).toBe('Você') // o placeholder segue sendo placeholder: a Visão geral o ignora e mostra "Olá!"
    writeOnboardingDisplayName('   ')
    expect(readOnboardingDisplayName()).toBeUndefined()
  })
})
