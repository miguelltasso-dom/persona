import { describe, expect, it } from 'vitest'
import { addressChannel, type AddressPersona } from '../src/channel-address.ts'
import type { DirectoryTeam } from '../src/channel-directory.ts'
import { emptyChannelNotice, namesLine, outsideNotices, teamMentionLabel } from '../src/channel-notices.ts'

/** Item 22 (colheita): the words Muse wrote (12/11 00:42): no article before a name, never blocking, one-click answer next to the line. */
const p = (id: string, name: string, title: string): AddressPersona => ({ id, name, title, description: '', coordination: false, paused: false })
const roster = [p('bia', 'Bia', 'Redatora'), p('teo', 'Téo', 'Social media'), p('lia', 'Lia', 'Atendimento'), p('rui', 'Rui', 'Suporte')]
const marketing: DirectoryTeam = { id: 'mkt', name: 'Marketing', personaIds: ['bia', 'teo'] }
const atendimento: DirectoryTeam = { id: 'atd', name: 'Atendimento', personaIds: ['lia', 'rui'] }
const teams = [marketing, atendimento]
const onMarketing = { body: '', personas: roster, teams, channel: { teamId: 'mkt' }, members: ['bia', 'teo'] }

describe('namesLine', () => {
  it('lists up to 3 names in full and says how many are left past 3', () => {
    expect(namesLine([])).toBe('')
    expect(namesLine(['Lia'])).toBe('Lia')
    expect(namesLine(['Lia', 'Téo'])).toBe('Lia e Téo')
    expect(namesLine(['Lia', 'Téo', 'Bia'])).toBe('Lia, Téo e Bia')
    expect(namesLine(['Lia', 'Téo', 'Bia', 'Rui', 'Ana', 'Caio'])).toBe('Lia, Téo e mais 4')
    expect(namesLine(['Lia', 'Téo', 'Bia', 'Rui'])).toBe('Lia, Téo e mais 2')
  })
})

describe('outsideNotices', () => {
  it('(1) a persona named outside the channel: the line, "Pôr Lia no canal" and "Agora não" (no "chame no canal certo")', () => {
    const got = outsideNotices(addressChannel({ ...onMarketing, body: '@Lia me ajuda com um cliente' }), 'marketing')
    expect(got).toEqual([{
      kind: 'outside-personas',
      text: 'Lia não está em #marketing.',
      add: { label: 'Pôr Lia no canal', personaIds: ['lia'] },
      dismissLabel: 'Agora não',
    }])
    expect(JSON.stringify(got)).not.toMatch(/canal certo/u)
  })
  it('several personas outside: one line, the verb agrees, one button', () => {
    const got = outsideNotices(addressChannel({ ...onMarketing, body: '@Lia e @Rui, vejam isso' }), 'marketing')
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ text: 'Lia e Rui não estão em #marketing.', add: { label: 'Pôr Lia e Rui no canal', personaIds: ['lia', 'rui'] } })
  })
  it('(2) an equipe called with nobody on the channel: "Ninguém de Marketing…", "Pôr Marketing no canal" and "Ir para #marketing"', () => {
    const atd = { ...onMarketing, channel: { teamId: 'atd' }, members: ['lia'], body: '@Marketing preciso de uma arte' }
    const got = outsideNotices(addressChannel({ ...atd, members: [] }), 'atendimento', teamId => (teamId === 'mkt' ? { id: 'equipe:p:mkt', name: 'marketing' } : undefined))
    expect(got).toEqual([{
      kind: 'outside-team',
      text: 'Ninguém de Marketing está em #atendimento.',
      add: { label: 'Pôr Marketing no canal', personaIds: ['bia', 'teo'], teamId: 'mkt' },
      goTo: { label: 'Ir para #marketing', channelId: 'equipe:p:mkt' },
    }])
  })
  it('an equipe with no channel of its own offers no "Ir para"', () => {
    const got = outsideNotices(addressChannel({ ...onMarketing, channel: {}, members: ['lia'], body: '@Marketing oi' }), 'ideias')
    expect(got[0]).toMatchObject({ kind: 'outside-team', text: 'Ninguém de Marketing está em #ideias.' })
    expect(got[0]?.goTo).toBeUndefined()
  })
  it('a persona AND an equipe outside: one line each, personas first', () => {
    const got = outsideNotices(addressChannel({ ...onMarketing, members: ['bia'], channel: {}, body: '@Lia e @Atendimento' }), 'ideias')
    expect(got.map(item => item.kind)).toEqual(['outside-personas', 'outside-team'])
  })
  it('nothing outside: no line at all', () => {
    expect(outsideNotices(addressChannel({ ...onMarketing, body: '@Bia oi' }), 'marketing')).toEqual([])
  })
})

describe('emptyChannelNotice', () => {
  it('with members: "#marketing está pronto." and who is here', () => {
    expect(emptyChannelNotice('marketing', ['Lia', 'Téo', 'Bia'])).toEqual({
      kind: 'ready', title: '#marketing está pronto.', body: 'Aqui estão Lia, Téo e Bia. Escreva um pedido e quem cuida disso responde.',
    })
  })
  it('with more than 3 members: "Lia, Téo e mais 4"', () => {
    expect(emptyChannelNotice('marketing', ['Lia', 'Téo', 'Bia', 'Rui', 'Ana', 'Caio'])).toMatchObject({ body: 'Aqui estão Lia, Téo e mais 4. Escreva um pedido e quem cuida disso responde.' })
  })
  it('with nobody: "Ainda não tem ninguém em #marketing." and the 40 px action label', () => {
    expect(emptyChannelNotice('marketing', [])).toEqual({ kind: 'nobody', title: 'Ainda não tem ninguém em #marketing.', actionLabel: 'Pôr pessoas no canal' })
  })
})

describe('teamMentionLabel', () => {
  it('is how @equipe shows in the @ menu: "Marketing · 4 pessoas" (singular for one)', () => {
    expect(teamMentionLabel(marketing, 4)).toBe('Marketing · 4 pessoas')
    expect(teamMentionLabel(marketing, 1)).toBe('Marketing · 1 pessoa')
  })
})
