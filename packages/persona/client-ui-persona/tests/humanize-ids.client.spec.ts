import { describe, expect, it } from 'vitest'
import { humanizeInternalIds, initiativeLabel } from '../src/client/governance/humanize-ids.ts'
import { en, pt } from '../src/client/locale/governance/locales.ts'

const TEAM = [
  { id: 'm-dia', name: 'Mídia' },
  { id: 'p-atendimento', name: 'Atendimento' },
]

describe('humanizeInternalIds (Gauge GOV-10 #2)', () => {
  it('shows the persona the id names, with its real spelling', () => {
    expect(humanizeInternalIds('A rotina “initiative:m-dia” não tem dono. Sem dono, ela para.', pt, TEAM))
      .toBe('A rotina “Iniciativa de Mídia” não tem dono. Sem dono, ela para.')
  })

  it('matches the host `p-` prefix either way', () => {
    expect(initiativeLabel(pt, 'atendimento', TEAM)).toBe('Iniciativa de Atendimento')
    expect(initiativeLabel(pt, 'p-m-dia', TEAM)).toBe('Iniciativa de Mídia')
  })

  it('never leaves a raw id: an unknown persona gets a neutral label', () => {
    const text = humanizeInternalIds('initiative:cria-o e initiative:coordena-o param', pt, TEAM)
    expect(text).not.toMatch(/initiative:/u)
    expect(text).toBe('Iniciativa diária da persona e Iniciativa diária da persona param')
    expect(humanizeInternalIds('initiative:x', pt, undefined)).not.toMatch(/initiative:/u)
  })

  it('leaves ordinary text alone and speaks English too', () => {
    expect(humanizeInternalIds('Ninguém cobre Atendimento.', pt, TEAM)).toBe('Ninguém cobre Atendimento.')
    expect(humanizeInternalIds('initiative:m-dia', en, TEAM)).toBe('Mídia’s daily initiative')
  })
})
