import { expect, it } from 'vitest'
import { hereGroups, type HerePersona } from '../src/channel-here.ts'
import { originOfMessage, type OriginLookups } from '../src/channel-origins.ts'
import { suggestionsFor } from '../src/channel-suggestions.ts'
import { CHANNEL_READ_KIND, ChannelReadBook, mentionsMember, unreadOf, type ReadMarkStore, type UnreadEvent, type UnreadMember } from '../src/channel-unread.ts'

/** Casa da Equipe (Muse §29/§29b), the four pure pieces of the host: unread, who is here, where a message came from, and the empty-channel suggestions. */

const ME: UnreadMember = { id: 'ana', handle: 'ana', displayName: 'Ana Paula' }
const line = (seq: number, actorId: string, body: string, type = 'message'): UnreadEvent => ({ seq, actorId, type, body })

describe_unread()

function describe_unread(): void {
  it('H1 unread: only lines from OTHERS after the mark count; her own lines, streaming partials and empty lines never do', () => {
    const events = [line(1, 'bia', 'oi'), line(2, 'ana', 'olá'), line(3, 'bia', 'tudo certo'), line(4, 'bia', 'digitando…', 'partial'), line(5, 'caio', '   '), line(6, 'caio', 'pronto', 'runner')]
    expect(unreadOf('geral', events, 0, ME)).toEqual({ channelId: 'geral', unread: 3, mentions: 0, firstUnreadSeq: 1, lastSeq: 6 })
    expect(unreadOf('geral', events, 3, ME)).toEqual({ channelId: 'geral', unread: 1, mentions: 0, firstUnreadSeq: 6, lastSeq: 6 })
    expect(unreadOf('geral', events, 6, ME)).toEqual({ channelId: 'geral', unread: 0, mentions: 0, lastSeq: 6 }) // nothing new: no firstUnreadSeq, the thread opens at the saved position
  })

  it('H1 mentions: @handle or @name (without accent or case), never a longer word', () => {
    expect(mentionsMember('@ana pode ver isso?', ME)).toBe(true)
    expect(mentionsMember('Oi @Ana Paula, tudo bem?', ME)).toBe(true)
    expect(mentionsMember('olha o @ANA!', ME)).toBe(true)
    expect(mentionsMember('@anabela chegou', ME)).toBe(false)
    expect(mentionsMember('falei com a ana ontem', ME)).toBe(false) // no @ = not a call
    expect(mentionsMember('manda para joana@loja.com', ME)).toBe(false)
    const events = [line(1, 'bia', '@ana confirme o envio'), line(2, 'bia', 'bom dia'), line(3, 'caio', 'e-mail de ana@loja.com')]
    expect(unreadOf('geral', events, 0, ME)).toMatchObject({ unread: 3, mentions: 1, firstUnreadSeq: 1 })
  })

  it('H1 the read mark only moves FORWARD, starts at the last line for a channel never counted, and a late call changes nothing', () => {
    const docs = new Map<string, { seq: number }>()
    const store: ReadMarkStore = {
      get: (project, kind, id) => docs.get(`${project}/${kind}/${id}`),
      put: (project, kind, id, value) => { docs.set(`${project}/${kind}/${id}`, value) },
    }
    const book = new ChannelReadBook(store)
    expect(book.markOf('pp', 'ana', 'geral')).toBeUndefined()
    expect(book.baseline('pp', 'ana', 'geral', 40)).toBe(40) // the history is not "new"
    expect(book.baseline('pp', 'ana', 'geral', 99)).toBe(40) // already counted: the baseline does not move it
    expect(book.mark('pp', 'ana', 'geral', 45)).toBe(45)
    expect(book.mark('pp', 'ana', 'geral', 30)).toBe(45) // late, out of order
    expect(book.mark('pp', 'ana', 'geral', -3)).toBe(45)
    expect(book.markOf('pp', 'bia', 'geral')).toBeUndefined() // the mark is per person
    expect(docs.has(`pp/${CHANNEL_READ_KIND}/ana:geral`)).toBe(true)
  })
}

function persona(id: string, over: Partial<HerePersona> = {}): HerePersona {
  return { id, name: id.toUpperCase(), title: 'Equipe', paused: false, noEngine: false, state: 'resting', ...over }
}

it('H2 who is here: Dono, each equipe (only who is on THIS channel), who has no equipe, and "Fora agora" last; empty groups are not returned', () => {
  const groups = hereGroups({
    owner: { id: 'ana', name: 'Ana' },
    teams: [{ id: 'mkt', name: 'Marketing', personaIds: ['bia', 'caio'] }, { id: 'atd', name: 'Atendimento', personaIds: ['lia'] }, { id: 'vazia', name: 'Vazia', personaIds: ['zzz'] }],
    channelPersonaIds: ['bia', 'lia', 'caio', 'solta', 'pausada'],
    personas: [
      persona('bia', { state: 'working', sentence: 'Preparando o envio' }), persona('caio'), persona('lia', { state: 'waiting', sentence: 'ignorada: só vale quando trabalha' }),
      persona('solta'), persona('pausada', { paused: true }),
    ],
  })
  expect(groups.map(group => group.id)).toEqual(['owner', 'team:mkt', 'team:atd', 'unassigned', 'away'])
  expect(groups[1]?.members.map(member => [member.personaId, member.doing])).toEqual([['bia', 'Preparando o envio'], ['caio', undefined]])
  expect(groups[2]?.members[0]).toMatchObject({ personaId: 'lia' })
  expect(groups[2]?.members[0]?.doing).toBeUndefined() // the live line is only for who is working
  expect(groups[4]).toMatchObject({ name: 'Fora agora', members: [{ personaId: 'pausada', away: 'paused' }] })
})

it('H2 who is here: a persona without an engine is "Fora agora" too, and she is never listed twice; nobody on the channel = only the owner', () => {
  const groups = hereGroups({
    teams: [{ id: 'mkt', name: 'Marketing', personaIds: ['bia'] }, { id: 'tudo', name: 'Todos', personaIds: ['bia'] }],
    channelPersonaIds: ['bia'],
    personas: [persona('bia', { noEngine: true })],
  })
  expect(groups.map(group => group.id)).toEqual(['away'])
  expect(groups[0]?.members).toEqual([{ personaId: 'bia', name: 'BIA', title: 'Equipe', away: 'no-engine' }])
  expect(hereGroups({ owner: { id: 'ana', name: 'Ana' }, teams: [], channelPersonaIds: [], personas: [] }).map(group => group.id)).toEqual(['owner'])
})

function lookups(over: Partial<OriginLookups> = {}): OriginLookups {
  const events = new Map([['routine-run:r1:1', 'routine:resumo'], ['m1', 'ana']])
  return {
    ticketIds: () => ['t-1', 't-12', 't-1-b'],
    triggerOfTicket: ticket => (ticket === 't-12' ? 'routine-run:r1:1' : ticket === 't-1' ? 'm1' : undefined),
    actorOfEvent: id => events.get(id),
    routineName: id => (id === 'resumo' ? 'Resumo das 8h' : undefined),
    ...over,
  }
}

it('H3 origin: the routine\'s own line, the Task line of a routine (longest Task id wins) and the persona\'s answer to the routine message carry the chip; a normal Task does not', () => {
  const chip = { kind: 'routine', routineId: 'resumo', name: 'Resumo das 8h' }
  expect(originOfMessage('routine-run:r1:1', 'routine:resumo', lookups())).toEqual(chip)
  expect(originOfMessage('coord-t-12-done', 'bia', lookups())).toEqual(chip) // t-12, not t-1
  expect(originOfMessage('coord-t-12-a2-done', 'bia', lookups())).toEqual(chip)
  expect(originOfMessage('coord-routine-run:r1:1-reply', 'bia', lookups())).toEqual(chip)
  expect(originOfMessage('coord-t-1-done', 'bia', lookups())).toBeUndefined() // started by a person's message
  expect(originOfMessage('u7', 'ana', lookups())).toBeUndefined()
})

it('H3 origin: never a guess — a routine that is gone, a Task nobody knows or a trigger without an author has NO chip', () => {
  expect(originOfMessage('coord-t-12-done', 'bia', lookups({ routineName: () => undefined }))).toBeUndefined()
  expect(originOfMessage('coord-t-99-done', 'bia', lookups())).toBeUndefined()
  expect(originOfMessage('coord-t-12-done', 'bia', lookups({ actorOfEvent: () => undefined }))).toBeUndefined()
  expect(originOfMessage('routine-run:x:1', 'routine:resumo', lookups({ routineName: () => '   ' }))).toBeUndefined()
})

it('H4 suggestions: 3, made from what the team does, generic ones fill the rest, never repeated; nobody on the channel = none', () => {
  const team = [{ name: 'Nina', title: 'Atendimento ao cliente' }, { name: 'Bia', title: 'Redatora de textos' }, { name: 'Caio', title: 'Designer de artes' }, { name: 'Ana', title: 'Vendas e loja' }]
  const three = suggestionsFor(team)
  expect(three).toHaveLength(3)
  expect(three.map(item => item.id)).toEqual(['atendimento', 'texto', 'arte']) // roster order, one per kind of work
  expect(three.every(item => item.label !== '' && item.prompt.endsWith('?'))).toBe(true)
  const few = suggestionsFor([{ name: 'Sol', title: 'Coordenação' }])
  expect(few.map(item => item.id)).toEqual(['coordenacao', 'semana', 'pendente']) // the generic "resumo" would repeat the coordination one: skipped
  expect(new Set(few.map(item => item.label)).size).toBe(3)
  expect(suggestionsFor([{ name: 'Zé', title: 'Cargo sem palavra conhecida' }]).map(item => item.id)).toEqual(['resumo', 'semana', 'pendente'])
  expect(suggestionsFor([])).toEqual([])
})
