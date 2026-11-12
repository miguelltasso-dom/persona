// COLHEITA 22 (Muse §22): the pure model of the sidebar's channel sections.
import { describe, expect, it } from 'vitest'
import {
  buildChannelSections, channelOrder, mapChannelLayout, NO_SECTION_KEY, PEOPLE_SECTION_MIN_HUMANS, SECTION_FACES_MAX, teamToneIndex,
  type ChannelLayoutWire,
} from '../src/client/shell/channel-sections.ts'

const LAYOUT: ChannelLayoutWire = {
  humanCount: 1,
  sections: [
    { id: null, name: null, faceIds: [], channels: [{ id: 'geral', name: 'geral', kind: 'general' }] },
    { id: 'sec-mkt', name: 'Marketing', teamId: 'mkt', faceIds: ['lia', 'teo', 'bia'], channels: [{ id: 'marketing', name: 'marketing', kind: 'team', teamId: 'mkt' }, { id: 'campanhas', name: 'campanhas', kind: 'team', teamId: 'mkt' }] },
    { id: 'sec-atd', name: 'Atendimento', teamId: 'atd', faceIds: ['nina'], channels: [{ id: 'atendimento', name: 'atendimento', kind: 'team', teamId: 'atd' }] },
  ],
}

describe('mapChannelLayout (getChannelLayout)', () => {
  it('maps the sections in the host\'s order, the faces (at most 3) and the people count', () => {
    const mapped = mapChannelLayout({ ...LAYOUT, sections: [{ ...LAYOUT.sections[1], faceIds: ['a', 'b', 'c', 'd'] }] })
    expect(mapped?.sections[0]?.faceIds).toEqual(['a', 'b', 'c'])
    expect(SECTION_FACES_MAX).toBe(3)
    expect(mapChannelLayout(LAYOUT)).toEqual(LAYOUT)
  })

  it('anything that is not a layout is undefined; broken parts are dropped, not half drawn', () => {
    expect(mapChannelLayout(undefined)).toBeUndefined()
    expect(mapChannelLayout({ sections: 'x' })).toBeUndefined()
    const mapped = mapChannelLayout({
      humanCount: -2,
      sections: [
        null,
        { id: '', name: 'sem id', channels: [], faceIds: [] },
        { id: 's1', name: ' Vendas ', faceIds: [3, 'ok', ''], channels: [{ id: 'c1', name: '#vendas', kind: 'team' }, { id: '', name: 'x' }, 7] },
      ],
    })
    expect(mapped).toEqual({ humanCount: 0, sections: [{ id: 's1', name: 'Vendas', faceIds: ['ok'], channels: [{ id: 'c1', name: 'vendas', kind: 'team' }] }] })
  })
})

describe('buildChannelSections', () => {
  const build = (over: Partial<Parameters<typeof buildChannelSections>[0]> = {}) => buildChannelSections({ layout: LAYOUT, unreadByChannel: {}, open: {}, activeChannelId: null, ...over })

  it('the channels with no section come first, have no header and can never be closed', () => {
    const [none] = build({ open: { [NO_SECTION_KEY]: false } }).sections
    expect(none).toMatchObject({ key: NO_SECTION_KEY, name: null, open: true, headerBadge: 0 })
    expect(none?.rows.map(row => row.id)).toEqual(['geral'])
  })

  it('every equipe is one section with its channels; sections start open', () => {
    const { sections } = build()
    expect(sections.map(section => [section.key, section.open])).toEqual([[NO_SECTION_KEY, true], ['sec-mkt', true], ['sec-atd', true]])
    expect(sections[1]?.rows.map(row => row.name)).toEqual(['marketing', 'campanhas'])
  })

  it('a CLOSED section with something unread shows the count on its header; an open one does not', () => {
    const unreadByChannel = { marketing: 2, campanhas: 3 }
    expect(build({ unreadByChannel }).sections[1]).toMatchObject({ unread: 5, headerBadge: 0, open: true })
    expect(build({ unreadByChannel, open: { 'sec-mkt': false } }).sections[1]).toMatchObject({ unread: 5, headerBadge: 5, open: false })
    expect(build({ open: { 'sec-mkt': false } }).sections[1]?.headerBadge).toBe(0)
  })

  it('the seal is amber (needsYou) only when a mention waits; plain unread stays neutral', () => {
    expect(build({ unreadByChannel: { marketing: 1 } }).sections[1]?.needsYou).toBe(false)
    expect(build({ unreadByChannel: { marketing: 1 }, mentionedChannelIds: new Set(['marketing']) }).sections[1]?.needsYou).toBe(true)
    expect(build({ mentionedChannelIds: new Set(['marketing']) }).sections[1]?.needsYou).toBe(false) // a mention already read
  })

  it('rows carry unread, muted and active; negative or fractional counts are cleaned', () => {
    const { sections } = build({ unreadByChannel: { geral: 2.9, marketing: -4 }, mutedChannelIds: new Set(['campanhas']), activeChannelId: 'marketing' })
    expect(sections[0]?.rows[0]).toMatchObject({ unread: 2 })
    expect(sections[1]?.rows[0]).toMatchObject({ unread: 0, active: true, muted: false })
    expect(sections[1]?.rows[1]).toMatchObject({ muted: true, active: false })
  })

  it('the dot tone is stable per equipe; a section made by hand has none', () => {
    expect(teamToneIndex('mkt')).toBe(teamToneIndex('mkt'))
    expect(teamToneIndex('mkt')).toBeGreaterThanOrEqual(1)
    expect(teamToneIndex('mkt')).toBeLessThanOrEqual(5)
    expect(teamToneIndex(undefined)).toBe(0)
    expect(build({ layout: { humanCount: 1, sections: [{ id: 'mine', name: 'Projetos', faceIds: [], channels: [] }] } }).sections[0]?.toneIndex).toBe(0)
  })

  it('"Pessoas" exists only from the 2nd real person', () => {
    expect(PEOPLE_SECTION_MIN_HUMANS).toBe(2)
    expect(build().showPeople).toBe(false)
    expect(build({ layout: { ...LAYOUT, humanCount: 2 } }).showPeople).toBe(true)
    expect(build({ layout: { ...LAYOUT, humanCount: 0 } }).showPeople).toBe(false)
  })
})

describe('channelOrder (Alt+↑/↓)', () => {
  it('walks the channels as drawn; the rows of a closed section are not reachable', () => {
    const open = buildChannelSections({ layout: LAYOUT, unreadByChannel: {}, open: {}, activeChannelId: null })
    expect(channelOrder(open)).toEqual(['geral', 'marketing', 'campanhas', 'atendimento'])
    const closed = buildChannelSections({ layout: LAYOUT, unreadByChannel: {}, open: { 'sec-mkt': false }, activeChannelId: null })
    expect(channelOrder(closed)).toEqual(['geral', 'atendimento'])
  })
})
