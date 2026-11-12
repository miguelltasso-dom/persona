import { describe, expect, it } from 'vitest'
import { hereGroups, type HerePersona } from '../src/channel-here.ts'
import { memoryDirectory } from '../src/channel-directory.ts'
import { channelHeaderViewOf, channelLayoutViewOf } from '../src/channel-views.ts'

/** Casa da Equipe (Muse §29, 12/11): the HOST says which of the eight `equipe-…` glyphs an equipe wears — in the rail section, the channel header chip and the "Quem está aqui" group. */
const roster = [{ id: 'bia', name: 'Bia' }, { id: 'lia', name: 'Lia' }]
const directory = memoryDirectory({
  roster: roster.map(item => item.id),
  teams: [
    { id: 'mkt', name: 'Marketing', personaIds: ['bia'] }, // no stored glyph: the name decides (marketing -> redes)
    { id: 'atd', name: 'Atendimento', personaIds: ['lia'], icon: 'equipe-financeiro' }, // the person's own choice wins
    { id: 'lan', name: 'Lançamento', personaIds: ['bia', 'lia'] }, // no word of the table: geral
  ],
  categories: [
    { id: 'team:mkt', name: 'Marketing', position: 0, teamId: 'mkt' },
    { id: 'team:atd', name: 'Atendimento', position: 1, teamId: 'atd' },
    { id: 'team:lan', name: 'Lançamento', position: 2, teamId: 'lan' },
    { id: 'mine', name: 'Projetos', position: 3 },
  ],
  channels: [
    { id: 'geral', name: 'geral', kind: 'general' },
    { id: 'c-mkt', name: 'marketing', kind: 'team', teamId: 'mkt', categoryId: 'team:mkt' },
    { id: 'c-atd', name: 'atendimento', kind: 'team', teamId: 'atd', categoryId: 'team:atd' },
    { id: 'c-lan', name: 'lancamento', kind: 'team', teamId: 'lan', categoryId: 'team:lan' },
  ],
})

describe('the equipe glyph', () => {
  it('the rail section of an equipe has it (stored one if valid, else by name, else geral); a section with no equipe has none', () => {
    const view = channelLayoutViewOf(directory, 'p', roster, { showEmptySections: true })
    const iconOf = (id: string): string | undefined => view.sections.find(section => section.id === id)?.icon
    expect(iconOf('team:mkt')).toBe('equipe-redes')
    expect(iconOf('team:atd')).toBe('equipe-financeiro')
    expect(iconOf('team:lan')).toBe('equipe-geral')
    expect(view.sections.find(section => section.id === 'mine')).not.toHaveProperty('icon')
    expect(view.sections.find(section => section.id === null)).not.toHaveProperty('icon')
  })

  it('the channel header chip wears the glyph of its equipe; a channel with no equipe has no chip glyph', () => {
    expect(channelHeaderViewOf(directory, 'p', 'c-mkt', roster)).toMatchObject({ teamId: 'mkt', teamIcon: 'equipe-redes' })
    expect(channelHeaderViewOf(directory, 'p', 'c-atd', roster)).toMatchObject({ teamIcon: 'equipe-financeiro' })
    expect(channelHeaderViewOf(directory, 'p', 'geral', roster)).not.toHaveProperty('teamIcon')
  })

  it('"Quem está aqui": each equipe group wears it; the owner, "Sem equipe" and "Fora agora" never do', () => {
    const persona = (id: string, over: Partial<HerePersona> = {}): HerePersona => ({ id, name: id.toUpperCase(), title: 'Equipe', paused: false, noEngine: false, state: 'resting', ...over })
    const groups = hereGroups({
      owner: { id: 'ana', name: 'Ana' },
      teams: directory.teams('p'),
      channelPersonaIds: ['bia', 'lia', 'solta', 'pausada'],
      personas: [persona('bia'), persona('lia'), persona('solta'), persona('pausada', { paused: true })],
    })
    expect(groups.map(group => [group.id, group.icon])).toEqual([
      ['owner', undefined], ['team:mkt', 'equipe-redes'], ['team:atd', 'equipe-financeiro'], ['unassigned', undefined], ['away', undefined],
    ])
  })
})
