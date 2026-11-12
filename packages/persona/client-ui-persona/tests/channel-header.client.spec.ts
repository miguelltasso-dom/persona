// COLHEITA 22 (Muse §22): the channel header, the fence lines and the `@` menu, read at the wire boundary.
import { describe, expect, it } from 'vitest'
import { HEADER_FACES_MAX, mapChannelHeader, mapChannelNotices, mapMentionOptions, shapeOf } from '../src/client/chat/channel-header.ts'

const HEADER = {
  channelId: 'marketing', name: 'marketing', teamId: 'mkt', teamName: 'Marketing',
  members: [{ kind: 'persona', id: 'lia', name: 'Lia' }, { kind: 'persona', id: 'teo', name: 'Téo' }, { kind: 'persona', id: 'bia', name: 'Bia' }],
  respondem: 'Respondem aqui: Lia, Téo e Bia',
  empty: { kind: 'ready', title: '#marketing está pronto.', body: 'Aqui estão Lia, Téo e Bia. Escreva um pedido e quem cuida disso responde.' },
}

describe('shape grammar', () => {
  it('a person is a circle; a persona is a rounded square', () => {
    expect(shapeOf('human')).toBe('circle')
    expect(shapeOf('persona')).toBe('square')
  })
})

describe('mapChannelHeader (getChannelHeader)', () => {
  it('"#marketing", the equipe chip, the faces in roster order and the line "Respondem aqui: …"', () => {
    expect(mapChannelHeader(HEADER)).toEqual({
      channelId: 'marketing', title: '#marketing', teamName: 'Marketing',
      faces: [{ id: 'lia', name: 'Lia', kind: 'persona', shape: 'square' }, { id: 'teo', name: 'Téo', kind: 'persona', shape: 'square' }, { id: 'bia', name: 'Bia', kind: 'persona', shape: 'square' }],
      more: 0, memberCount: 3, respondem: 'Respondem aqui: Lia, Téo e Bia', empty: HEADER.empty,
    })
  })

  it('more than 5 on the channel: the stack keeps 5 and says "+N"; people are circles among the squares', () => {
    const members = [
      ...Array.from({ length: 6 }, (_, index) => ({ kind: 'persona', id: `p${index}`, name: `P${index}` })),
      { kind: 'human', id: 'ana', name: 'Ana' },
    ]
    const header = mapChannelHeader({ ...HEADER, members })!
    expect(header.faces).toHaveLength(HEADER_FACES_MAX)
    expect(header.more).toBe(2)
    expect(header.memberCount).toBe(7)
    expect(mapChannelHeader({ ...HEADER, members: [{ kind: 'human', id: 'ana', name: 'Ana' }] })?.faces[0]).toMatchObject({ kind: 'human', shape: 'circle' })
  })

  it('nobody on the channel: no "Respondem aqui" line and the empty state offers to put people on it', () => {
    const nobody = { kind: 'nobody', title: 'Ainda não tem ninguém em #marketing.', actionLabel: 'Pôr pessoas no canal' }
    const header = mapChannelHeader({ ...HEADER, members: [], respondem: '', empty: nobody })!
    expect(header.respondem).toBe('')
    expect(header.faces).toEqual([])
    expect(header.empty).toEqual(nobody)
  })

  it('a DM (undefined) or anything that is not a header is undefined', () => {
    expect(mapChannelHeader(undefined)).toBeUndefined()
    expect(mapChannelHeader({ ...HEADER, channelId: '' })).toBeUndefined()
    expect(mapChannelHeader({ ...HEADER, empty: { kind: 'weird' } })).toBeUndefined()
    expect(mapChannelHeader({ ...HEADER, members: [null, { kind: 'robot', id: 'x', name: 'X' }, { kind: 'persona', id: '', name: 'Y' }] })?.faces).toEqual([])
  })
})

describe('mapChannelNotices (MessageView.channelNotice)', () => {
  const outsidePersonas = { kind: 'outside-personas', text: 'Lia não está em #marketing.', add: { label: 'Pôr Lia no canal', personaIds: ['lia'] }, dismissLabel: 'Agora não' }
  const outsideTeam = { kind: 'outside-team', text: 'Ninguém de Marketing está em #atendimento.', add: { label: 'Pôr Marketing no canal', personaIds: ['lia', 'teo'], teamId: 'mkt' }, goTo: { label: 'Ir para #marketing', channelId: 'marketing' } }

  it('the two kinds of fence line, with their one-click answers', () => {
    expect(mapChannelNotices([outsidePersonas, outsideTeam])).toEqual([
      { kind: 'outside-personas', text: 'Lia não está em #marketing.', add: { label: 'Pôr Lia no canal', personaIds: ['lia'] }, dismissLabel: 'Agora não' },
      { kind: 'outside-team', text: 'Ninguém de Marketing está em #atendimento.', add: { label: 'Pôr Marketing no canal', personaIds: ['lia', 'teo'], teamId: 'mkt' }, goTo: { label: 'Ir para #marketing', channelId: 'marketing' } },
    ])
  })

  it('a malformed notice is dropped (never a button with nothing behind it)', () => {
    expect(mapChannelNotices(undefined)).toEqual([])
    expect(mapChannelNotices([{ ...outsidePersonas, add: { label: 'Pôr', personaIds: [] } }, { ...outsidePersonas, kind: 'x' }, { ...outsidePersonas, text: ' ' }, null])).toEqual([])
    expect(mapChannelNotices([{ ...outsideTeam, goTo: { label: '', channelId: 'x' } }])[0]?.goTo).toBeUndefined()
  })
})

describe('mapMentionOptions (listMentionOptions)', () => {
  it('equipes first (the own one as "@equipe"), then personas; a persona off the channel says so', () => {
    const options = mapMentionOptions([
      { kind: 'own-team', id: 'mkt', insert: 'equipe', label: '@equipe · a equipe deste canal', faceIds: ['lia', 'teo', 'bia', 'cris'], onChannel: true },
      { kind: 'team', id: 'atd', insert: 'Atendimento', label: 'Atendimento · 2 pessoas', faceIds: ['nina'], onChannel: true },
      { kind: 'persona', id: 'lia', insert: 'Lia', label: 'Lia', faceIds: ['lia'], onChannel: true },
      { kind: 'persona', id: 'nina', insert: 'Nina', label: 'Nina', faceIds: ['nina'], onChannel: false },
    ])
    expect(options.map(option => [option.kind, option.insert])).toEqual([['own-team', 'equipe'], ['team', 'Atendimento'], ['persona', 'Lia'], ['persona', 'Nina']])
    expect(options[0]?.faceIds).toEqual(['lia', 'teo', 'bia']) // at most 3
    expect(options[3]?.onChannel).toBe(false)
  })

  it('entries without id, insert or label are dropped', () => {
    expect(mapMentionOptions(undefined)).toEqual([])
    expect(mapMentionOptions([{ kind: 'persona', id: '', insert: 'x', label: 'x' }, { kind: 'zzz', id: 'a', insert: 'a', label: 'a' }, { kind: 'persona', id: 'a', insert: 'a', label: ' ' }])).toEqual([])
  })
})
