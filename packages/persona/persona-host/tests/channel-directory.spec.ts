import { describe, expect, it } from 'vitest'
import { directoryOverTeamChannels, memoryDirectory } from '../src/channel-directory.ts'

/** Item 22 (colheita): the one door the routing and the sidebar read. The memory directory is the reference of what the port means. */
describe('memoryDirectory', () => {
  const dir = memoryDirectory({
    roster: ['guia', 'bia', 'caio', 'lia'],
    teams: [{ id: 'mkt', name: 'Marketing', personaIds: ['caio', 'bia'] }],
    categories: [{ id: 'c', name: 'Times', position: 0 }],
    channels: [
      { id: 'geral', name: 'geral', kind: 'general' },
      { id: 'mkt', name: 'marketing', kind: 'team', teamId: 'mkt', categoryId: 'c' },
      { id: 'ideias', name: 'ideias', kind: 'custom', members: ['lia', 'bia'] },
      { id: 'velho', name: 'velho', kind: 'custom', members: ['bia'], archived: true },
    ],
  })
  it('general = the whole roster, in roster order', () => {
    expect(dir.membersOf('p', 'geral')).toEqual(['guia', 'bia', 'caio', 'lia'])
  })
  it('a team channel = the equipe\'s personas, in ROSTER order (not the order the equipe lists them)', () => {
    expect(dir.membersOf('p', 'mkt')).toEqual(['bia', 'caio'])
  })
  it('a custom channel = the members put in, in roster order; people who left the roster are dropped', () => {
    expect(dir.membersOf('p', 'ideias')).toEqual(['bia', 'lia'])
  })
  it('an archived channel has nobody; an unknown one is `undefined` (no fence)', () => {
    expect(dir.membersOf('p', 'velho')).toEqual([])
    expect(dir.membersOf('p', 'nao-existe')).toBeUndefined()
  })
  it('lists teams, categories and channels (without the members, which are a detail of the memory)', () => {
    expect(dir.teams('p').map(team => team.name)).toEqual(['Marketing'])
    expect(dir.categories('p').map(category => category.name)).toEqual(['Times'])
    expect(dir.channels('p').find(channel => channel.id === 'mkt')).toEqual({ id: 'mkt', name: 'marketing', kind: 'team', teamId: 'mkt', categoryId: 'c' })
    expect(Object.keys(dir.channels('p')[2]!)).not.toContain('members')
  })
})

describe('directoryOverTeamChannels (the bridge over what CV-6 already has)', () => {
  const rows = [
    { id: 'equipe:p:s1', name: 'marketing', kind: 'team' as const, sourceId: 's1' },
    { id: 'geral', name: 'geral', kind: 'general' as const },
    { id: 'equipe:p:s2', name: 'atendimento', kind: 'team' as const, sourceId: 's2', archivedAt: '2026-11-01T00:00:00.000Z' },
  ]
  const bridge = directoryOverTeamChannels({
    teamChannels: {
      membersOf: (_project, channelId) => channelId === 'equipe:p:s1'
        ? [{ kind: 'persona', id: 'bia' }, { kind: 'persona', id: 'caio' }]
        : channelId === 'diretoria:p' ? [{ kind: 'persona', id: 'guia' }, { kind: 'human', id: 'ana' }] : [],
    },
    channels: { list: () => rows, get: id => (rows.some(row => row.id === id) || id === 'diretoria:p' ? { id } : undefined) },
    sectors: () => [{ id: 's1', name: 'Marketing' }, { id: 's2', name: 'Atendimento' }],
    sectorOf: () => new Map([['bia', 's1'], ['caio', 's1'], ['lia', 's2']]),
  })
  it('the organogram\'s sectors are the equipes', () => {
    expect(bridge.teams('p')).toEqual([
      { id: 's1', name: 'Marketing', personaIds: ['bia', 'caio'] },
      { id: 's2', name: 'Atendimento', personaIds: ['lia'] },
    ])
  })
  it('channels carry their equipe (sourceId), their section and their archived state', () => {
    expect(bridge.channels('p')).toEqual([
      { id: 'equipe:p:s1', name: 'marketing', kind: 'team', teamId: 's1', categoryId: 'team:s1' },
      { id: 'geral', name: 'geral', kind: 'general' },
      { id: 'equipe:p:s2', name: 'atendimento', kind: 'team', teamId: 's2', categoryId: 'team:s2', archived: true },
    ])
  })
  it('the app makes ONE section per equipe that has a live channel (the archived one makes none), in the organogram\'s order', () => {
    expect(bridge.categories('p')).toEqual([{ id: 'team:s1', name: 'Marketing', position: 0, teamId: 's1' }])
  })
  it('who is on a channel is CV-6\'s answer, personas only; a channel it does not know has no fence', () => {
    expect(bridge.membersOf('p', 'equipe:p:s1')).toEqual(['bia', 'caio'])
    expect(bridge.membersOf('p', 'diretoria:p')).toEqual(['guia']) // the owner is a person, not an addressee
    expect(bridge.membersOf('p', 'dm-ana')).toBeUndefined()
  })
})
