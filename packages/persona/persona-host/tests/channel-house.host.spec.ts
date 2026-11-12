import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { RemoteFault } from '../src/remote-guard.ts'
import { surfaceOfRemote } from '../src/surface-gates.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Casa da Equipe (Muse §29/§29b, item 22) on a REAL host: the five Remotes the channel screens ask — unread + "mark as read", who is here, where a line came
 * from (the routine chip), and the empty-channel starters. The read mark is each person's own; every answer is fenced to the project; a channel of another
 * project is "not found"; the lines of a Task thread and the history before the person's first look are never "new".
 */
const { host } = bindHostFile('2026-11-12T12:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }
let serial = 0

function seed(h: PersonaHost): void {
  serial = 0
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bob', ...scope, displayName: 'Bob', handle: 'bob', role: 'member' })
  for (const [id, name, title] of [['p-coord', 'Coord', 'Coordenação'], ['p-bia', 'Bia', 'Redatora de textos'], ['p-caio', 'Caio', 'Designer de artes']] as const) {
    h.createPersona({
      id, ...scope, name, title, description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
      avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
    })
  }
  h.product.updatePersona({ ...h.product.getPersona('p-coord')!, systemRoles: ['coordination'] }, 'pp')
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.createChannel({ id: 'geral', ...scope, name: 'geral', topic: '' })
}

/** A line written straight into the channel's stream (no routing, no answers): the channel history as someone else left it. */
function line(h: PersonaHost, actorId: string, body: string, over: { id?: string; topicId?: string; channel?: string; scope?: { workspaceId: string; projectId: string } } = {}): string {
  serial += 1
  const id = over.id ?? `m${String(serial)}`
  h.events.append({
    id, ...(over.scope ?? scope), streamKind: 'channel', ownerId: over.channel ?? 'geral', type: 'message', body, actorId, subjectId: '',
    occurredAt: '2026-11-12T12:00:00.000Z', ...(over.topicId === undefined ? {} : { topicId: over.topicId }),
  })
  return id
}

function refusal(work: () => unknown): RemoteFault {
  try { work() } catch (error: unknown) { if (error instanceof RemoteFault) return error; throw error }
  throw new Error('expected a refusal')
}

const unreadOf = (h: PersonaHost, channelId = 'geral') => h.getChannelUnread(scope).find(item => item.channelId === channelId)

it('unread: the history before the first look is not new; lines from others count; her own, Task-thread and internal lines do not', () => {
  const h = host()
  seed(h)
  line(h, 'p-bia', 'o que já estava aqui')
  expect(unreadOf(h)).toMatchObject({ unread: 0, mentions: 0 }) // first sight: the baseline is the last line
  line(h, 'p-bia', 'bom dia')
  line(h, 'ana', 'oi, equipe') // her own line
  line(h, 'p-caio', 'trabalho do Task', { topicId: 'task:t-1' }) // a Task thread belongs to the Task
  line(h, 'team:plan', 'linha interna') // an internal author
  line(h, 'p-caio', '@ana pode ver o rascunho?')
  expect(unreadOf(h)).toMatchObject({ unread: 2, mentions: 1 })
})

it('ack: the mark only moves FORWARD, never past the last line, and the figures after it are the truth; it is her own mark', () => {
  const h = host()
  seed(h)
  line(h, 'p-bia', 'antiga')
  h.getChannelUnread(scope) // baseline
  const first = line(h, 'p-bia', 'um')
  line(h, 'p-bia', 'dois')
  line(h, 'p-bia', 'tres')
  const seqOf = (id: string): number => h.events.get(id)!.seq
  expect(unreadOf(h)!.firstUnreadSeq).toBe(seqOf(first))
  expect(h.ackChannelRead({ ...scope, channelId: 'geral', seq: seqOf(first) })).toMatchObject({ unread: 2 })
  expect(h.ackChannelRead({ ...scope, channelId: 'geral', seq: 1 })).toMatchObject({ unread: 2 }) // late: nothing goes back
  expect(h.ackChannelRead({ ...scope, channelId: 'geral', seq: 9_999 })).toMatchObject({ unread: 0 }) // past the end = the end
})

it('ack: the mark is PER PERSON — in a shared project (where a member reads), Ana reading everything leaves Bob\'s count where it was', () => {
  const h = host()
  seed(h)
  const team = { workspaceId: 'ws', projectId: 'team' }
  h.createProject({ id: 'team', ...team, name: 'Time', description: '' }) // a shared project: Bob reads it (the owner's PERSONAL project refuses members before anything is listed)
  const general = h.getProjectConversation(team).channelId // the project's own #geral (made with the project)
  const say = (body: string): string => line(h, 'p-bia', body, { channel: general, scope: team })
  const unreadTeam = (): number | undefined => h.getChannelUnread(team).find(item => item.channelId === general)?.unread
  say('antiga')
  expect(unreadTeam()).toBe(0) // Ana's first look: the baseline
  h.sessionMemberId = 'bob'
  expect(unreadTeam()).toBe(0) // Bob's first look: HIS baseline (Ana's mark is not his)
  h.sessionMemberId = 'ana'
  const last = say('dois')
  say('tres')
  expect(unreadTeam()).toBe(2)
  expect(h.ackChannelRead({ ...team, channelId: general, seq: 999 })).toMatchObject({ unread: 0 }) // Ana read everything
  h.sessionMemberId = 'bob'
  expect(unreadTeam()).toBe(2) // Bob's mark did not move
  expect(h.ackChannelRead({ ...team, channelId: general, seq: h.events.get(last)!.seq })).toMatchObject({ unread: 1 }) // up to "dois": "tres" is still new for him
})

it('ack: bad input and a channel of another project are typed refusals, and a refusal writes nothing', () => {
  const h = host()
  seed(h)
  line(h, 'p-bia', 'antiga')
  h.getChannelUnread(scope)
  line(h, 'p-bia', 'nova')
  expect(refusal(() => h.ackChannelRead({ ...scope, channelId: 'geral', seq: -1 }))).toMatchObject({ code: 'invalid-payload' })
  expect(refusal(() => h.ackChannelRead({ ...scope, channelId: 'geral', seq: 1.5 }))).toMatchObject({ code: 'invalid-payload' })
  expect(refusal(() => h.ackChannelRead({ ...scope, channelId: 'nao-existe', seq: 1 }))).toMatchObject({ code: 'not-found' })
  expect(unreadOf(h)).toMatchObject({ unread: 1 })
})

it('here: the owner, the personas of the channel in groups, a paused one under "Fora agora"; a channel of another project is not found', () => {
  const h = host()
  seed(h)
  h.pausePersona({ ...scope, personaId: 'p-caio' })
  const groups = h.getChannelHere({ ...scope, channelId: 'geral' })
  expect(groups[0]).toMatchObject({ id: 'owner', members: [{ name: 'Ana' }] })
  expect(groups.at(-1)).toMatchObject({ id: 'away', name: 'Fora agora', members: [{ personaId: 'p-caio', away: 'paused' }] })
  const listed = groups.flatMap(group => group.members.map(member => member.personaId ?? member.name))
  expect(listed).toEqual(expect.arrayContaining(['p-bia', 'p-coord', 'p-caio']))
  expect(new Set(listed).size).toBe(listed.length) // nobody twice
  expect(refusal(() => h.getChannelHere({ ...scope, channelId: 'nao-existe' }))).toMatchObject({ code: 'not-found' })
})

it('origins: only a line a routine made carries the chip; the author is read from the store, never from the caller', () => {
  const h = host()
  seed(h)
  h.createRoutine({
    ...scope, id: 'resumo', name: 'Resumo das 8h', rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0', timeZone: 'America/Sao_Paulo', catchUp: 'run_once', silenceStart: '', silenceEnd: '',
    prompt: 'Resuma ontem.', ownerPersonaId: 'p-bia',
  })
  const made = line(h, 'routine:resumo', 'Hora do resumo', { id: 'routine-run:r1:1' })
  const person = line(h, 'ana', 'uma conversa normal')
  expect(h.getMessageOrigins({ ...scope, messageIds: [made, person, 'id-que-nao-existe'] })).toEqual({ [made]: { kind: 'routine', routineId: 'resumo', name: 'Resumo das 8h' } })
  expect(refusal(() => h.getMessageOrigins({ ...scope, messageIds: 'x' as unknown as string[] }))).toMatchObject({ code: 'invalid-payload' })
  expect(h.getMessageOrigins({ ...scope, messageIds: Array.from({ length: 500 }, (_, index) => `x${String(index)}`) })).toEqual({}) // bounded
})

it('suggestions: 3 starters made from who is on the channel', () => {
  const h = host()
  seed(h)
  const items = h.getChannelSuggestions({ ...scope, channelId: 'geral' })
  expect(items).toHaveLength(3)
  expect(items.every(item => item.label !== '' && item.prompt !== '')).toBe(true)
  expect(refusal(() => h.getChannelSuggestions({ ...scope, channelId: 'nao-existe' }))).toMatchObject({ code: 'not-found' })
})

it('the five Remotes belong to the surface `channels`: OFF in the product = refused by the funnel (D-113)', () => {
  for (const name of ['getChannelUnread', 'ackChannelRead', 'getChannelHere', 'getMessageOrigins', 'getChannelSuggestions']) expect(surfaceOfRemote(name)).toBe('channels')
})

it('layout: the facts the bar needs on top — the company name, people and personas — come with getChannelLayout', () => {
  const h = host()
  seed(h)
  expect(h.getChannelLayout(scope)).toMatchObject({ companyName: 'Acme', humanCount: 2, personaCount: 3 })
})

it('icon: an equipe the person made wears a glyph on the wire — the one she kept if valid, else the name\'s (Muse\'s table), else geral — in the layout and in "Quem está aqui"', () => {
  const h = host()
  seed(h)
  const made = (name: string, icon?: string) => h.updateChannelLayout({ ...scope, action: { kind: 'createEquipe', name, personaIds: ['p-bia'], ...(icon === undefined ? {} : { icon }) } })
  made('Vendas')
  expect(h.getEquipeLayout(scope).equipes.map(equipe => [equipe.name, equipe.icon])).toEqual([['Vendas', 'equipe-vendas']])
  h.updateChannelLayout({ ...scope, action: { kind: 'updateEquipe', id: h.getEquipeLayout(scope).equipes[0]!.id, archived: true } })
  made('Financeiro da loja', 'equipe-producao') // her own choice wins over the name
  made('Lançamento', 'estrela') // not one of the eight: ignored, no word of the table: geral
  const equipes = h.getEquipeLayout(scope).equipes
  expect(equipes.find(equipe => equipe.name === 'Financeiro da loja')?.icon).toBe('equipe-producao')
  expect(equipes.find(equipe => equipe.name === 'Lançamento')?.icon).toBe('equipe-geral')
  expect(h.getChannelHere({ ...scope, channelId: 'geral' }).find(group => group.id.startsWith('team:'))).toMatchObject({ icon: 'equipe-producao' }) // Bia sits in the first equipe that has her, in the directory's order
})
