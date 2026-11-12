import { describe, expect, it } from 'vitest'
import { directoryOverTeamChannels, teamSectionIdOf, type TeamChannelsBridgeDeps } from '../src/channel-directory.ts'

/**
 * Item 22 (H22): the CV-6 bridge now also reads the equipes the PERSON assembled, the categories she made and where she put channels. The three are OPTIONAL deps:
 * without them the directory is what it was (the existing channel-directory spec); with them nothing of the fence changes.
 */
const channels = [
  { id: 'geral', name: 'geral', kind: 'general' as const },
  { id: 'mkt', name: 'marketing', kind: 'team' as const, sourceId: 'sec-mkt' },
  { id: 'ideias', name: 'ideias', kind: 'custom' as const },
  { id: 'velho', name: 'velho', kind: 'custom' as const, archivedAt: '2026-11-01T00:00:00Z' },
]

function bridge(extra: Partial<TeamChannelsBridgeDeps> = {}) {
  return directoryOverTeamChannels({
    teamChannels: { membersOf: () => [{ kind: 'persona', id: 'p1' }] },
    channels: { list: () => channels, get: id => channels.find(channel => channel.id === id) },
    sectors: () => [{ id: 'sec-mkt', name: 'Marketing' }, { id: 'sec-atd', name: 'Atendimento' }],
    sectorOf: () => new Map([['p-bia', 'sec-mkt'], ['p-lia', 'sec-atd']]),
    ...extra,
  })
}

describe('directoryOverTeamChannels with the person’s own arrangement', () => {
  it('without the new deps nothing changes: sectors are the equipes, one automatic section per equipe with a channel', () => {
    const dir = bridge()
    expect(dir.teams('p').map(team => team.name)).toEqual(['Marketing', 'Atendimento'])
    expect(dir.categories('p')).toEqual([{ id: teamSectionIdOf('sec-mkt'), name: 'Marketing', position: 0, teamId: 'sec-mkt' }])
    expect(dir.channels('p').find(channel => channel.id === 'mkt')).toMatchObject({ categoryId: teamSectionIdOf('sec-mkt') })
    expect(dir.channels('p').find(channel => channel.id === 'ideias')?.categoryId).toBeUndefined()
  })

  it('the equipes of the person join the sectors; a mirror of a sector adds nothing; an archived one is gone', () => {
    const dir = bridge({
      equipes: () => [
        { id: 'e1', name: 'Lançamento', personaIds: ['p-bia', 'p-lia'] },
        { id: 'e2', name: 'Marketing', sourceId: 'sec-mkt', personaIds: [] },
        { id: 'e3', name: 'Velha', archivedAt: '2026-11-02T00:00:00Z', personaIds: ['p-bia'] },
      ],
    })
    expect(dir.teams('p').map(team => [team.id, team.name, [...team.personaIds].sort()])).toEqual([
      ['sec-mkt', 'Marketing', ['p-bia']], ['sec-atd', 'Atendimento', ['p-lia']], ['e1', 'Lançamento', ['p-bia', 'p-lia']],
    ])
  })

  it('categories made by hand come AFTER the automatic sections, in their own order', () => {
    const dir = bridge({ categories: () => [{ id: 'c2', name: 'Interno', position: 1 }, { id: 'c1', name: 'Clientes', position: 0 }] })
    expect(dir.categories('p').map(category => [category.id, category.teamId])).toEqual([[teamSectionIdOf('sec-mkt'), 'sec-mkt'], ['c2', undefined], ['c1', undefined]])
    const positions = dir.categories('p').map(category => category.position)
    expect(positions[1]).toBeGreaterThan(positions[0]!)
    expect(positions[1]).toBeGreaterThan(positions[2]!) // c2 (position 1) sorts after c1 (position 0) by the numbers, not by the list order
  })

  it('a placement puts a channel in a category at a position and WINS over the automatic section of a team channel', () => {
    const dir = bridge({ placements: () => new Map([['ideias', { categoryId: 'c1', position: 2 }], ['mkt', { categoryId: 'c1', position: 0 }]]) })
    expect(dir.channels('p').find(channel => channel.id === 'ideias')).toMatchObject({ categoryId: 'c1', position: 2 })
    expect(dir.channels('p').find(channel => channel.id === 'mkt')).toMatchObject({ categoryId: 'c1', position: 0 }) // moved out of its equipe section
    expect(dir.channels('p').find(channel => channel.id === 'geral')?.categoryId).toBeUndefined()
  })

  it('THE FENCE is untouched: who is on a channel still comes from the channel, never from an equipe or a category', () => {
    const dir = bridge({
      equipes: () => [{ id: 'e1', name: 'Lançamento', personaIds: ['p-bia', 'p-lia'] }],
      categories: () => [{ id: 'c1', name: 'Clientes', position: 0 }],
      placements: () => new Map([['ideias', { categoryId: 'c1', position: 0 }]]),
    })
    expect(dir.membersOf('p', 'ideias')).toEqual(['p1'])
    expect(dir.membersOf('p', 'nao-existe')).toBeUndefined()
  })
})
