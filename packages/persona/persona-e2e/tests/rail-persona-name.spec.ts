import { describe, expect, it } from 'vitest'
import { personaNameFromRailTalkLabel } from '../src/real-gallery/rail-persona-name.ts'

describe('personaNameFromRailTalkLabel (AG-002)', () => {
  it('reads first-run coordination names that are not Atlas', () => {
    expect(personaNameFromRailTalkLabel('Conversar com Probe E2E · Coordenação · Disponível')).toBe('Probe E2E')
    expect(personaNameFromRailTalkLabel('Conversar com Guia')).toBe('Guia')
    expect(personaNameFromRailTalkLabel('Conversar com Atlas · Cargo · Aguardando você · 2 não lidas')).toBe('Atlas')
  })

  it('rejects labels that are not a rail talk button', () => {
    expect(personaNameFromRailTalkLabel('Sobre Probe E2E')).toBeUndefined()
    expect(personaNameFromRailTalkLabel('')).toBeUndefined()
  })
})
