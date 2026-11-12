import { describe, expect, it } from 'vitest'
import { addressChannel, callsOwnTeam, type AddressPersona } from '../src/channel-address.ts'
import type { DirectoryTeam } from '../src/channel-directory.ts'

/**
 * Item 22 (colheita): who answers a message in a channel. `@Marketing` calls the whole equipe, `@equipe` the channel's own, and ONLY the
 * personas on the channel answer there (a persona named outside it is reported, never woken; the function route runs among members).
 */
const p = (id: string, name: string, title: string, extra: Partial<AddressPersona> = {}): AddressPersona =>
  ({ id, name, title, description: '', coordination: false, paused: false, ...extra })

const roster: AddressPersona[] = [
  p('guia', 'Guia', 'Coordenação', { coordination: true }),
  p('bia', 'Bia', 'Redatora de textos'),
  p('caio', 'Caio', 'Designer de artes'),
  p('teo', 'Teo', 'Social media e posts'),
  p('lia', 'Lia', 'Atendimento ao cliente'),
  p('rui', 'Rui', 'Suporte e atendimento'),
]

const marketing: DirectoryTeam = { id: 'mkt', name: 'Marketing', personaIds: ['bia', 'caio', 'teo'] }
const atendimento: DirectoryTeam = { id: 'atd', name: 'Atendimento', personaIds: ['lia', 'rui'] }
const teams = [marketing, atendimento]

const ids = (list: readonly AddressPersona[]): string[] => list.map(item => item.id)

describe('@equipe by name', () => {
  it('@Marketing calls the whole equipe, in roster order', () => {
    const got = addressChannel({ body: '@Marketing preciso da campanha de sexta', personas: roster, teams })
    expect(ids(got.personas)).toEqual(['bia', 'caio', 'teo'])
    expect(got.via).toBe('team')
    expect(got.teams).toEqual([marketing])
  })
  it('is case- and accent-insensitive and whole-word: "@marketingx" and "x@Marketing.com" call nobody', () => {
    expect(ids(addressChannel({ body: '@marketing ajuda aqui', personas: roster, teams }).personas)).toEqual(['bia', 'caio', 'teo'])
    expect(addressChannel({ body: '@marketingx ajuda', personas: roster, teams }).via).not.toBe('team')
    expect(addressChannel({ body: 'manda para x@Marketing.com', personas: roster, teams }).teams).toEqual([])
  })
  it('two equipes at once: each in roster order, no repeats', () => {
    const got = addressChannel({ body: '@Atendimento e @Marketing, vamos alinhar', personas: roster, teams })
    expect(ids(got.personas)).toEqual(['lia', 'rui', 'bia', 'caio', 'teo'])
    expect(got.teams.map(team => team.id)).toEqual(['atd', 'mkt'])
  })
  it('a persona named AND her equipe called: she answers once, first (the persona named leads)', () => {
    const got = addressChannel({ body: '@Teo e @Marketing: ideia nova', personas: roster, teams })
    expect(ids(got.personas)).toEqual(['teo', 'bia', 'caio'])
    expect(got.via).toBe('mention')
  })
  it('a persona with the same name as an equipe wins: "@Atendimento" is the persona, not the equipe', () => {
    const people = [...roster, p('atd-p', 'Atendimento', 'Recepção')]
    const got = addressChannel({ body: '@Atendimento tem alguém aí?', personas: people, teams })
    expect(ids(got.personas)).toEqual(['atd-p'])
    expect(got.teams).toEqual([])
  })
  it('an equipe name with spaces is matched whole', () => {
    const vendas: DirectoryTeam = { id: 'v', name: 'Vendas e Contas', personaIds: ['lia'] }
    expect(ids(addressChannel({ body: '@Vendas e Contas, bom dia', personas: roster, teams: [vendas] }).personas)).toEqual(['lia'])
  })
})

describe('@equipe: the channel\'s own equipe', () => {
  const team = { teamId: 'mkt' }
  it('in the channel of Marketing it calls Marketing', () => {
    const got = addressChannel({ body: '@equipe quem pega o cartaz?', personas: roster, teams, channel: team, members: ['bia', 'caio', 'teo'] })
    expect(ids(got.personas)).toEqual(['bia', 'caio', 'teo'])
    expect(got.teams).toEqual([marketing])
  })
  it('@time is the same word', () => {
    expect(ids(addressChannel({ body: '@time, bom dia', personas: roster, teams, channel: team, members: ['bia', 'caio', 'teo'] }).personas)).toEqual(['bia', 'caio', 'teo'])
  })
  it('in a channel with no equipe of its own it calls everyone on the channel', () => {
    const got = addressChannel({ body: '@equipe reunião às 15h', personas: roster, teams, channel: {}, members: ['bia', 'lia'] })
    expect(ids(got.personas)).toEqual(['bia', 'lia'])
  })
  it('in a DM (no channel) it means nothing: nobody is called', () => {
    expect(addressChannel({ body: '@equipe oi', personas: roster, teams }).personas).toEqual([])
  })
  it('callsOwnTeam: whole word, never glued to a word or an e-mail', () => {
    expect(callsOwnTeam('@equipe oi')).toBe(true)
    expect(callsOwnTeam('oi @Equipe!')).toBe(true)
    expect(callsOwnTeam('@equipes')).toBe(false)
    expect(callsOwnTeam('x@equipe.com')).toBe(false)
    expect(callsOwnTeam('@@equipe')).toBe(false)
  })
})

describe('the fence: only the members of the channel answer', () => {
  const marketingChannel = { teamId: 'mkt' }
  const members = ['bia', 'caio', 'teo']
  it('a persona named but NOT on the channel is not woken and is reported', () => {
    const got = addressChannel({ body: '@Lia me ajuda com um cliente', personas: roster, teams, channel: marketingChannel, members })
    expect(got.personas).toEqual([])
    expect(got.via).toBe('none')
    expect(ids(got.outsidePersonas)).toEqual(['lia'])
  })
  it('names inside and outside: the ones inside answer, the outsider is reported', () => {
    const got = addressChannel({ body: '@Bia e @Lia, vejam isso', personas: roster, teams, channel: marketingChannel, members })
    expect(ids(got.personas)).toEqual(['bia'])
    expect(ids(got.outsidePersonas)).toEqual(['lia'])
  })
  it('an equipe with nobody on the channel is outside: not woken, reported', () => {
    const got = addressChannel({ body: '@Atendimento chegou reclamação', personas: roster, teams, channel: marketingChannel, members })
    expect(got.personas).toEqual([])
    expect(got.outsideTeams).toEqual([atendimento])
  })
  it('an equipe partly on the channel: only the members of it answer', () => {
    const got = addressChannel({ body: '@Marketing atenção', personas: roster, teams, channel: marketingChannel, members: ['bia', 'teo'] })
    expect(ids(got.personas)).toEqual(['bia', 'teo'])
    expect(got.outsideTeams).toEqual([])
  })
  it('no fence (a DM, or a channel the directory does not know): everyone is addressable', () => {
    const got = addressChannel({ body: '@Lia me ajuda', personas: roster, teams })
    expect(ids(got.personas)).toEqual(['lia'])
  })
  it('an empty channel answers nobody, even when someone is named', () => {
    const got = addressChannel({ body: '@Bia oi', personas: roster, teams, channel: {}, members: [] })
    expect(got.personas).toEqual([])
    expect(ids(got.outsidePersonas)).toEqual(['bia'])
  })
})

describe('nobody named: the persona of the request\'s function, among the members only', () => {
  it('routes by function inside the channel', () => {
    const got = addressChannel({ body: 'preciso de um cartaz novo', personas: roster, teams, channel: { teamId: 'mkt' }, members: ['bia', 'caio', 'teo'] })
    expect(ids(got.personas)).toEqual(['caio'])
    expect(got.via).toBe('function')
  })
  it('does not pick a persona that is not on the channel, even when she is the one for the function', () => {
    // "cliente" is Lia's function; she is not on #marketing, and Bia/Caio/Teo have no claim on it.
    const got = addressChannel({ body: 'uma cliente reclamou do atendimento', personas: roster, teams, channel: { teamId: 'mkt' }, members: ['bia', 'caio', 'teo'] })
    expect(ids(got.personas)).not.toContain('lia')
    expect(ids(got.personas)).not.toContain('rui')
  })
  it('a list of functions splits among the members ("texto, arte e posts")', () => {
    const got = addressChannel({ body: 'preciso de texto, arte e posts para sexta', personas: roster, teams, channel: { teamId: 'mkt' }, members: ['bia', 'caio', 'teo'] })
    expect(ids(got.personas)).toEqual(['bia', 'caio', 'teo'])
    expect(got.via).toBe('function')
    expect(got.route?.kind).toBe('split')
  })
  it('nothing names a function: the caller keeps its default', () => {
    const got = addressChannel({ body: 'bom dia, pessoal', personas: roster, teams, channel: { teamId: 'mkt' }, members: ['bia', 'caio', 'teo'] })
    expect(got).toMatchObject({ personas: [], via: 'none', outsidePersonas: [], outsideTeams: [] })
  })
  it('somebody was NAMED outside: the function route does not guess another persona', () => {
    const got = addressChannel({ body: '@Lia faça um cartaz', personas: roster, teams, channel: { teamId: 'mkt' }, members: ['bia', 'caio', 'teo'] })
    expect(got.personas).toEqual([])
    expect(got.via).toBe('none')
  })
})
