// DESIGN-01 onda 3 · #15: o rosto de cada linha do Teste dos 2 dias vem da equipe viva; nunca uma letra.
import { describe, expect, it } from 'vitest'
import { twoDayRowFace } from '../src/client/governance/two-day-faces.ts'
import type { TwoDayRowView } from '../src/client/governance/governance-contract.ts'
import type { PersonaLiveSnapshot } from '../src/client/remote/persona-live-store.ts'

const row = (id: string): TwoDayRowView => ({ id, label: id, slots: ['waits', 'waits', 'waits', 'waits'] })
const persona = (id: string, name: string, avatarRef = 'gallery-ref') => ({
  id, workspaceId: 'ws', projectId: 'p', name, title: 'Função', description: '', avatarKind: 'gallery' as const, avatarRef, systemRoles: [] as const, canRecruit: false,
})
const live = (personas: readonly ReturnType<typeof persona>[], nowRows: PersonaLiveSnapshot['nowRows'] = []): Pick<PersonaLiveSnapshot, 'team' | 'nowRows'> => ({
  team: { personas, members: [] } as never,
  nowRows,
})

describe('twoDayRowFace', () => {
  it('a rotina da persona ("initiative:<id>") acha a persona pelo id, com ou sem o prefixo p-', () => {
    const team = live([persona('p-nina', 'Nina'), persona('sol', 'Sol')])
    expect(twoDayRowFace(row('initiative:p-nina'), team)?.name).toBe('Nina')
    expect(twoDayRowFace(row('initiative:nina'), team)?.name).toBe('Nina')
    expect(twoDayRowFace(row('initiative:p-sol'), team)?.name).toBe('Sol')
  })

  it('a linha derivada da equipe viva ("live-now-<personagem>") acha a persona pelo nome do painel Agora', () => {
    const team = live([persona('p-bento', 'Bento')], [{ member: { id: 'bento', name: 'Bento', role: 'Engenharia', state: 'working' }, queueCount: 0 }])
    expect(twoDayRowFace(row('live-now-bento'), team)?.name).toBe('Bento')
  })

  it('sempre devolve um rosto (o retrato ou um animal da galeria), nunca nada que vire inicial', () => {
    const face = twoDayRowFace(row('initiative:p-nova'), live([persona('p-nova', 'Bia')]))
    expect(face?.name).toBe('Bia')
    expect(typeof face?.src).toBe('string')
  })

  it('o que não é de uma persona, ou de uma persona que a equipe não tem, não tem rosto (a tela desenha o ícone da equipe)', () => {
    const team = live([persona('p-nina', 'Nina')])
    expect(twoDayRowFace(row('live-approvals-you'), team)).toBeUndefined()
    expect(twoDayRowFace(row('r-clients'), team)).toBeUndefined()
    expect(twoDayRowFace(row('initiative:p-desconhecida'), team)).toBeUndefined()
    expect(twoDayRowFace(row('initiative:p-nina'), { team: null, nowRows: [] })).toBeUndefined()
  })
})
