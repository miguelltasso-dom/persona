import { describe, expect, it } from 'vitest'
import { memoryDirectory } from '../src/channel-directory.ts'
import { channelHeaderViewOf, channelLayoutViewOf, mentionOptionsOf } from '../src/channel-views.ts'

/** Item 22 (colheita): the read views Muse's §22 draws. One section per equipe; "Respondem aqui"; the `@` menu with equipes first. */
const roster = [
  { id: 'guia', name: 'Guia' }, { id: 'bia', name: 'Bia' }, { id: 'caio', name: 'Caio' }, { id: 'teo', name: 'Téo' },
  { id: 'lia', name: 'Lia' }, { id: 'rui', name: 'Rui' },
]

const directory = memoryDirectory({
  roster: roster.map(item => item.id),
  teams: [
    { id: 'mkt', name: 'Marketing', personaIds: ['teo', 'bia', 'caio'] },
    { id: 'atd', name: 'Atendimento', personaIds: ['lia', 'rui'] },
  ],
  categories: [
    { id: 'team:mkt', name: 'Marketing', position: 0, teamId: 'mkt' },
    { id: 'team:atd', name: 'Atendimento', position: 1, teamId: 'atd' },
    { id: 'mine', name: 'Projetos', position: 2 },
  ],
  channels: [
    { id: 'geral', name: 'geral', kind: 'general' },
    { id: 'c-mkt', name: 'marketing', kind: 'team', teamId: 'mkt', categoryId: 'team:mkt' },
    { id: 'c-campanhas', name: 'campanhas', kind: 'custom', teamId: 'mkt', categoryId: 'team:mkt', members: ['bia', 'teo'] },
    { id: 'c-atd', name: 'atendimento', kind: 'team', teamId: 'atd', categoryId: 'team:atd' },
    { id: 'c-velho', name: 'velho', kind: 'custom', categoryId: 'team:atd', archived: true, members: [] },
  ],
})

describe('channelLayoutViewOf', () => {
  it('no-section channels first, then one section per equipe in order, with up to 3 faces in ROSTER order', () => {
    const view = channelLayoutViewOf(directory, 'p', roster)
    expect(view.sections.map(section => [section.id, section.name, section.channels.map(channel => channel.name)])).toEqual([
      [null, null, ['geral']],
      ['team:mkt', 'Marketing', ['campanhas', 'marketing']],
      ['team:atd', 'Atendimento', ['atendimento']],
    ])
    expect(view.sections[0]).toMatchObject({ faceIds: [] })
    expect(view.sections[1]).toMatchObject({ teamId: 'mkt', faceIds: ['bia', 'caio', 'teo'] })
    expect(view.sections[2]).toMatchObject({ teamId: 'atd', faceIds: ['lia', 'rui'] })
  })
  it('a section the person made by hand has no equipe and no faces; an empty one shows only to whoever arranges', () => {
    expect(channelLayoutViewOf(directory, 'p', roster).sections.some(section => section.id === 'mine')).toBe(false)
    const arranging = channelLayoutViewOf(directory, 'p', roster, { showEmptySections: true })
    const mine = arranging.sections.find(section => section.id === 'mine')
    expect(mine).toEqual({ id: 'mine', name: 'Projetos', faceIds: [], channels: [] })
  })
  it('passes the number of real people through (the sidebar shows "Pessoas" only from the 2nd), never negative or fractional', () => {
    expect(channelLayoutViewOf(directory, 'p', roster).humanCount).toBe(0)
    expect(channelLayoutViewOf(directory, 'p', roster, { humanCount: 2 }).humanCount).toBe(2)
    expect(channelLayoutViewOf(directory, 'p', roster, { humanCount: -3 }).humanCount).toBe(0)
    expect(channelLayoutViewOf(directory, 'p', roster, { humanCount: 2.9 }).humanCount).toBe(2)
  })
  it('the archived channel is not listed', () => {
    const names = channelLayoutViewOf(directory, 'p', roster).sections.flatMap(section => section.channels.map(channel => channel.name))
    expect(names).not.toContain('velho')
  })
  it('caps the faces at 3', () => {
    const many = memoryDirectory({
      roster: ['a', 'b', 'c', 'd', 'e'],
      teams: [{ id: 't', name: 'Grande', personaIds: ['a', 'b', 'c', 'd', 'e'] }],
      categories: [{ id: 'team:t', name: 'Grande', position: 0, teamId: 't' }],
      channels: [{ id: 'x', name: 'grande', kind: 'team', teamId: 't', categoryId: 'team:t' }],
    })
    const view = channelLayoutViewOf(many, 'p', ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, name: id.toUpperCase() })))
    expect(view.sections[0]?.faceIds).toEqual(['a', 'b', 'c'])
  })
})

describe('channelHeaderViewOf', () => {
  it('"Respondem aqui" lists the members in roster order, with the equipe chip', () => {
    expect(channelHeaderViewOf(directory, 'p', 'c-mkt', roster)).toMatchObject({
      channelId: 'c-mkt', name: 'marketing', teamId: 'mkt', teamName: 'Marketing',
      members: [{ kind: 'persona', id: 'bia', name: 'Bia' }, { kind: 'persona', id: 'caio', name: 'Caio' }, { kind: 'persona', id: 'teo', name: 'Téo' }],
      respondem: 'Respondem aqui: Bia, Caio e Téo',
      empty: { kind: 'ready', title: '#marketing está pronto.', body: 'Aqui estão Bia, Caio e Téo. Escreva um pedido e quem cuida disso responde.' },
    })
  })
  it('more than 3 say how many are left', () => {
    expect(channelHeaderViewOf(directory, 'p', 'geral', roster)?.respondem).toBe('Respondem aqui: Guia, Bia e mais 4')
  })
  it('a channel with nobody has no "Respondem aqui" and the empty state asks to put people on it', () => {
    const empty = memoryDirectory({ roster: ['a'], channels: [{ id: 'vazio', name: 'vazio', kind: 'custom', members: [] }] })
    expect(channelHeaderViewOf(empty, 'p', 'vazio', [{ id: 'a', name: 'A' }])).toMatchObject({
      members: [], respondem: '', empty: { kind: 'nobody', title: 'Ainda não tem ninguém em #vazio.', actionLabel: 'Pôr pessoas no canal' },
    })
  })
  it('a channel without an equipe has no chip; a channel the directory does not know has no header (a DM)', () => {
    expect(channelHeaderViewOf(directory, 'p', 'geral', roster)?.teamId).toBeUndefined()
    expect(channelHeaderViewOf(directory, 'p', 'dm-ana', roster)).toBeUndefined()
  })
})

describe('mentionOptionsOf', () => {
  it('equipes first (the channel\'s own as "@equipe"), then the personas; the label counts people', () => {
    const options = mentionOptionsOf(directory, 'p', 'c-mkt', roster)
    expect(options.slice(0, 3).map(option => [option.kind, option.insert, option.label])).toEqual([
      ['own-team', 'equipe', '@equipe · a equipe deste canal'],
      ['team', 'Marketing', 'Marketing · 3 pessoas'],
      ['team', 'Atendimento', 'Atendimento · 2 pessoas'],
    ])
    expect(options.slice(3).map(option => option.kind)).toEqual(['persona', 'persona', 'persona', 'persona', 'persona', 'persona'])
    expect(options[1]?.faceIds).toEqual(['bia', 'caio', 'teo'])
  })
  it('marks the personas that are not on the channel (the screen offers "Pôr no canal")', () => {
    const personas = mentionOptionsOf(directory, 'p', 'c-mkt', roster).filter(option => option.kind === 'persona')
    expect(Object.fromEntries(personas.map(option => [option.id, option.onChannel]))).toEqual({ guia: false, bia: true, caio: true, teo: true, lia: false, rui: false })
  })
  it('in a DM (no channel) there is no "@equipe" and every persona is addressable', () => {
    const options = mentionOptionsOf(directory, 'p', undefined, roster)
    expect(options.some(option => option.kind === 'own-team')).toBe(false)
    expect(options.filter(option => option.kind === 'persona').every(option => option.onChannel)).toBe(true)
  })
  it('a persona with the name of an equipe hides the equipe (the persona wins)', () => {
    const people = [...roster, { id: 'atd-p', name: 'Atendimento' }]
    const options = mentionOptionsOf(directory, 'p', 'c-mkt', people)
    expect(options.filter(option => option.kind === 'team').map(option => option.insert)).toEqual(['Marketing'])
  })
  it('an equipe with nobody on the roster is not offered', () => {
    const options = mentionOptionsOf(directory, 'p', 'c-mkt', roster.filter(persona => persona.id !== 'lia' && persona.id !== 'rui'))
    expect(options.filter(option => option.kind === 'team').map(option => option.insert)).toEqual(['Marketing'])
  })
})
