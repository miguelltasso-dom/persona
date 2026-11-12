import { expect, it } from 'vitest'
import { ChannelHouse, UNREAD_SCAN_MAX, type HouseDeps } from '../src/channel-house.ts'
import { ChannelReadBook, type ReadMarkStore, type UnreadEvent, type UnreadMember } from '../src/channel-unread.ts'

/** The composition of the Casa da Equipe pieces over fakes: the host's Remotes are thin wrappers over exactly this. */
const ME: UnreadMember = { id: 'ana', handle: 'ana', displayName: 'Ana' }

function rig(over: Partial<HouseDeps> = {}) {
  const docs = new Map<string, { seq: number }>()
  const store: ReadMarkStore = { get: (p, k, i) => docs.get(`${p}/${k}/${i}`), put: (p, k, i, v) => { docs.set(`${p}/${k}/${i}`, v) } }
  const streams = new Map<string, UnreadEvent[]>()
  const say = (channel: string, count: number, actorId = 'bia', body = 'oi'): void => {
    const lines = streams.get(`channel:${channel}`) ?? []
    for (let i = 0; i < count; i += 1) lines.push({ seq: lines.length + 1, actorId, type: 'message', body })
    streams.set(`channel:${channel}`, lines)
  }
  const deps: HouseDeps = {
    reads: new ChannelReadBook(store),
    channels: () => [{ id: 'geral', name: 'geral', kind: 'general' }, { id: 'velho', name: 'velho', kind: 'custom', archived: true }, { id: 'ideias', name: 'ideias', kind: 'custom' }],
    linesAfter: (stream, _actor, after, limit) => {
      const events = (streams.get(stream) ?? []).filter(line => line.seq > after).slice(0, limit)
      return { events, nextSeq: events.at(-1)?.seq ?? after }
    },
    lastSeqOf: stream => streams.get(stream)?.length ?? 0,
    teams: () => [{ id: 'mkt', name: 'Marketing', personaIds: ['bia'] }],
    membersOf: (_p, channel) => (channel === 'geral' ? ['bia', 'caio'] : channel === 'ideias' ? ['bia'] : undefined),
    personas: () => [
      { id: 'bia', name: 'Bia', title: 'Redatora de textos', paused: false, noEngine: false, state: 'working', sentence: 'Escrevendo a legenda' },
      { id: 'caio', name: 'Caio', title: 'Designer de artes', paused: false, noEngine: false, state: 'resting' },
    ],
    origin: () => ({ ticketIds: () => ['t-1'], triggerOfTicket: () => 'routine-run:r1:1', actorOfEvent: () => 'routine:resumo', routineName: () => 'Resumo das 8h' }),
    ...over,
  }
  return { house: new ChannelHouse(deps), say, docs, lines: (stream: string): UnreadEvent[] => streams.get(stream) ?? [] }
}

it('unread: a channel nobody counted starts at its last line (the history is not new); new lines count; archived channels are skipped', () => {
  const r = rig()
  r.say('geral', 5)
  r.say('ideias', 2)
  expect(r.house.unread('pp', ME).map(item => [item.channelId, item.unread])).toEqual([['geral', 0], ['ideias', 0]]) // first sight: baseline
  r.say('geral', 3, 'bia', '@ana veja isto')
  const after = r.house.unread('pp', ME)
  expect(after.find(item => item.channelId === 'geral')).toEqual({ channelId: 'geral', unread: 3, mentions: 3, firstUnreadSeq: 6, lastSeq: 8 })
  expect(after.some(item => item.channelId === 'velho')).toBe(false)
})

it('markRead: clamps to the last line, never goes back, and the figures after it are the new truth', () => {
  const r = rig()
  r.say('geral', 4)
  r.house.unread('pp', ME) // baseline at 4
  r.say('geral', 6)
  expect(r.house.markRead('pp', 'geral', ME, 7)).toMatchObject({ unread: 3, firstUnreadSeq: 8 })
  expect(r.house.markRead('pp', 'geral', ME, 2)).toMatchObject({ unread: 3 }) // late: nothing moves
  expect(r.house.markRead('pp', 'geral', ME, 9_999)).toMatchObject({ unread: 0 }) // past the end = the end
})

it('unread: a long backlog is paged (200 a page) and the scan stops at the cap', () => {
  const r = rig()
  r.say('geral', 1)
  r.house.unread('pp', ME)
  r.say('geral', UNREAD_SCAN_MAX + 250)
  const figure = r.house.unread('pp', ME).find(item => item.channelId === 'geral')!
  expect(figure.unread).toBeGreaterThanOrEqual(UNREAD_SCAN_MAX)
  expect(figure.unread).toBeLessThanOrEqual(UNREAD_SCAN_MAX + 200) // pages of 200: the cap is checked between pages
  expect(figure.firstUnreadSeq).toBe(2)
})

it('unread: a page the host filtered short (hidden lines) is not the end — the scan follows the cursor to the last line', () => {
  const hidden = new Set<number>()
  const r = rig({
    // The host drops what a person may not see AFTER paging: the page can be short while the stream goes on (nextSeq is the RAW cursor).
    linesAfter: (stream, _actor, after, limit) => {
      const raw = (r.lines(stream)).filter(line => line.seq > after).slice(0, limit)
      return { events: raw.filter(line => !hidden.has(line.seq)), nextSeq: raw.at(-1)?.seq ?? after }
    },
  })
  r.say('geral', 1)
  r.house.unread('pp', ME) // baseline at 1
  r.say('geral', 450)
  for (let seq = 2; seq <= 260; seq += 1) hidden.add(seq) // the first raw page (200) is ALL hidden, the next is half hidden
  const figure = r.house.unread('pp', ME).find(item => item.channelId === 'geral')!
  expect(figure.unread).toBe(451 - 260) // 261..451 are visible
  expect(figure.firstUnreadSeq).toBe(261)
})

it('here: the channel\'s own members, grouped; a channel the directory does not know has everybody (the old behavior)', () => {
  const r = rig()
  const known = r.house.here('pp', 'geral', { id: 'ana', name: 'Ana' })
  expect(known.map(group => group.id)).toEqual(['owner', 'team:mkt', 'unassigned'])
  expect(known[1]?.members[0]).toMatchObject({ personaId: 'bia', doing: 'Escrevendo a legenda' })
  expect(r.house.here('pp', 'dm-x', undefined).flatMap(group => group.members.map(member => member.personaId))).toEqual(['bia', 'caio'])
})

it('origins: only the lines a routine made get a chip', () => {
  const r = rig()
  const found = r.house.origins('pp', [{ id: 'coord-t-1-done', actorId: 'bia' }, { id: 'u1', actorId: 'ana' }])
  expect(Object.keys(found)).toEqual(['coord-t-1-done'])
  expect(found['coord-t-1-done']).toEqual({ kind: 'routine', routineId: 'resumo', name: 'Resumo das 8h' })
})

it('suggestions: made from who is ON this channel only', () => {
  const r = rig()
  expect(r.house.suggestions('pp', 'ideias').map(item => item.id)).toEqual(['texto', 'resumo', 'semana']) // only Bia is on #ideias
  expect(r.house.suggestions('pp', 'geral').map(item => item.id)).toEqual(['texto', 'arte', 'resumo'])
})
