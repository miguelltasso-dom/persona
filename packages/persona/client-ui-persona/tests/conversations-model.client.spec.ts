// @vitest-environment jsdom
// CV-1 (CONVERSAS-SPEC §0): o modelo puro da barra lilás única: Canais e Pessoas, Recentes, grupos por equipe, busca, a ordem do
// Alt+↑/↓ e o que fica lembrado. Sem React: só entrada → saída.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONVERSATION_GROUPS_KEY,
  GROUP_FACES_MAX,
  PEOPLE_SHOW_ALL_MAX,
  buildConversationsModel,
  normalizeQuery,
  readCollapsedGroups,
  stepConversation,
  teamGroupKey,
  toggleGroup,
  totalUnread,
  writeCollapsedGroups,
  type BuildConversationsInput,
  type ConversationChannel,
  type ConversationPerson,
} from '../src/client/shell/conversations-model.ts'
import type { ConversationTarget } from '../src/client/shell/conversation-selection.ts'

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

const person = (id: string, over: Partial<ConversationPerson> = {}): ConversationPerson => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  role: 'Engenharia',
  teamId: 'eng',
  teamName: 'Engenharia',
  unread: 0,
  hasConversation: false,
  ...over,
})

const GERAL: ConversationChannel = { id: 'geral', name: 'geral', unread: 0 }

const input = (people: readonly ConversationPerson[], over: Partial<BuildConversationsInput> = {}): BuildConversationsInput => ({
  channels: [GERAL],
  people,
  query: '',
  collapsed: {},
  active: null,
  ...over,
})

/** `count` pessoas em equipes alternadas, nenhuma conversa. */
const many = (count: number): ConversationPerson[] => Array.from({ length: count }, (_, i) => person(`p${String(i).padStart(2, '0')}`, {
  teamId: i % 3 === 0 ? 'mkt' : i % 3 === 1 ? 'eng' : 'atd',
  teamName: i % 3 === 0 ? 'Marketing' : i % 3 === 1 ? 'Engenharia' : 'Atendimento',
}))

describe('até 8 pessoas: todas, em linhas completas', () => {
  it(`com ${String(PEOPLE_SHOW_ALL_MAX)} ou menos o modo é "all" (sem Recentes, sem grupos)`, () => {
    const model = buildConversationsModel(input(many(PEOPLE_SHOW_ALL_MAX)))
    expect(model.people.mode).toBe('all')
  })

  it('ORDEM ESTÁVEL: a ordem recebida (Coordenação primeiro, depois a do host); a atividade nunca reordena', () => {
    const model = buildConversationsModel(input([
      person('luna'),
      person('nina', { hasConversation: true, recentRank: 1 }),
      person('bento', { hasConversation: true, recentRank: 0 }),
      person('sol'),
    ]))
    expect(model.people.mode === 'all' && model.people.people.map(p => p.id)).toEqual(['luna', 'nina', 'bento', 'sol'])
  })

  it('a ordem do teclado é canais e depois pessoas, como aparecem', () => {
    const model = buildConversationsModel(input([person('luna'), person('nina', { hasConversation: true, recentRank: 0 })]))
    expect(model.order).toEqual([
      { kind: 'channel', id: 'geral' },
      { kind: 'dm', personaId: 'luna' },
      { kind: 'dm', personaId: 'nina' },
    ])
  })
})

describe('mais de 8: "Todas as personas" por equipe, em ordem estável', () => {
  const talked = (people: ConversationPerson[], ranks: Readonly<Record<string, number>>): ConversationPerson[] =>
    people.map(p => (p.id in ranks ? { ...p, hasConversation: true, recentRank: ranks[p.id] } : p))

  it('o modo vira "grouped" e a contagem total é a das pessoas', () => {
    const model = buildConversationsModel(input(many(PEOPLE_SHOW_ALL_MAX + 1)))
    expect(model.people.mode).toBe('grouped')
    expect(model.people.mode === 'grouped' && model.people.total).toBe(PEOPLE_SHOW_ALL_MAX + 1)
  })

  it('não existe "Recentes": ter conversa ou não, a atividade não muda a ordem nem cria uma lista à parte', () => {
    const ranks = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`p${String(i).padStart(2, '0')}`, 7 - i]))
    const withActivity = buildConversationsModel(input(talked(many(12), ranks)))
    const without = buildConversationsModel(input(many(12)))
    if (withActivity.people.mode !== 'grouped' || without.people.mode !== 'grouped') throw new Error('esperava grouped')
    expect('recent' in withActivity.people).toBe(false)
    expect(withActivity.people.groups.map(g => g.people.map(p => p.id))).toEqual(without.people.groups.map(g => g.people.map(p => p.id)))
  })

  it('as equipes vêm na ordem em que cada uma aparece primeiro (não por nome), e quem não tem equipe entra onde chega', () => {
    const people = [...many(9), person('solo', { teamId: null, teamName: null })]
    const model = buildConversationsModel(input(people))
    if (model.people.mode !== 'grouped') throw new Error('esperava grouped')
    expect(model.people.groups.map(g => g.teamName)).toEqual(['Marketing', 'Engenharia', 'Atendimento', null])
    expect(model.people.groups.at(-1)?.key).toBe(teamGroupKey(null))
  })

  it('dentro do grupo as pessoas ficam na ordem recebida; o grupo traz a soma das não lidas e até 4 rostos', () => {
    const people = [
      ...many(9).map(p => ({ ...p, teamId: 'eng', teamName: 'Engenharia' })),
    ].map((p, i) => ({ ...p, unread: i === 0 ? 2 : i === 1 ? 3 : 0 }))
    // chega fora de ordem alfabética: continua como chegou
    const reversed = [...people].reverse()
    const model = buildConversationsModel(input(reversed))
    if (model.people.mode !== 'grouped') throw new Error('esperava grouped')
    const [group] = model.people.groups
    expect(group?.people.map(p => p.id)).toEqual(reversed.map(p => p.id))
    expect(group?.unread).toBe(5)
    expect(group?.faces).toHaveLength(GROUP_FACES_MAX)
  })

  it('por padrão todos os grupos vêm recolhidos, menos o da equipe da conversa aberta (uma DM)', () => {
    const model = buildConversationsModel(input(many(12), { active: { kind: 'dm', personaId: 'p01' } }))
    if (model.people.mode !== 'grouped') throw new Error('esperava grouped')
    expect(Object.fromEntries(model.people.groups.map(g => [g.teamId, g.collapsed]))).toEqual({ atd: true, eng: false, mkt: true })
  })

  it('...e o mesmo vale para o canal de uma equipe', () => {
    const model = buildConversationsModel(input(many(12), {
      channels: [GERAL, { id: 'marketing', name: 'marketing', teamId: 'mkt', unread: 0 }],
      active: { kind: 'channel', id: 'marketing' },
    }))
    if (model.people.mode !== 'grouped') throw new Error('esperava grouped')
    expect(model.people.groups.find(g => g.teamId === 'mkt')?.collapsed).toBe(false)
    expect(model.people.groups.find(g => g.teamId === 'eng')?.collapsed).toBe(true)
  })

  it('sem conversa aberta todos recolhem; o que a pessoa lembrou vale mais que o padrão', () => {
    const closed = buildConversationsModel(input(many(12)))
    expect(closed.people.mode === 'grouped' && closed.people.groups.every(g => g.collapsed)).toBe(true)
    const remembered = buildConversationsModel(input(many(12), {
      collapsed: { [teamGroupKey('mkt')]: false, [teamGroupKey('eng')]: true },
      active: { kind: 'dm', personaId: 'p01' },
    }))
    if (remembered.people.mode !== 'grouped') throw new Error('esperava grouped')
    expect(remembered.people.groups.find(g => g.teamId === 'mkt')?.collapsed).toBe(false)
    // eng seria aberto por ser a equipe ativa, mas a pessoa recolheu
    expect(remembered.people.groups.find(g => g.teamId === 'eng')?.collapsed).toBe(true)
  })

  it('a ordem do teclado: canais e só os grupos abertos, na ordem do rail; ninguém aparece duas vezes', () => {
    const people = talked(many(10), { p01: 0, p04: 1 })
    const model = buildConversationsModel(input(people, { active: { kind: 'dm', personaId: 'p01' } }))
    const keys = model.order.map(t => (t.kind === 'channel' ? `#${t.id}` : t.personaId))
    // o grupo "eng" (p01, p04, p07) é o aberto; conversar mais com p04 não o põe antes de p01
    expect(keys).toEqual(['#geral', 'p01', 'p04', 'p07'])
    expect(new Set(keys).size).toBe(keys.length)
    // o grupo "mkt" está recolhido: p00, p03... não entram
    expect(keys).not.toContain('p00')
  })
})

describe('busca', () => {
  const people = [
    person('nina', { name: 'Nína', role: 'Pesquisa', teamName: 'Estudos', hasConversation: true, recentRank: 1 }),
    person('bento', { role: 'Engenharia', hasConversation: true, recentRank: 0 }),
    person('luna', { role: 'Vigia', teamName: 'Estudos' }),
  ]

  it('ignora acento e caixa, e casa por nome, função e equipe', () => {
    expect(normalizeQuery('  Nína ')).toBe('nina')
    const model = buildConversationsModel(input(people, { query: 'NINA' }))
    expect(model.people.mode === 'search' && model.people.people.map(p => p.id)).toEqual(['nina'])
    expect(buildConversationsModel(input(people, { query: 'vigia' })).people).toMatchObject({ mode: 'search' })
    const byTeam = buildConversationsModel(input(people, { query: 'estudos' }))
    expect(byTeam.people.mode === 'search' && byTeam.people.people.map(p => p.id).sort()).toEqual(['luna', 'nina'])
  })

  it('a busca mostra uma lista só (nunca grupos recolhidos escondendo resultado), mesmo com muita gente', () => {
    const model = buildConversationsModel(input(many(30), { query: 'p0' }))
    expect(model.people.mode).toBe('search')
    expect(model.people.mode === 'search' && model.people.people).toHaveLength(10)
  })

  it('filtra os canais e a ordem do teclado segue o resultado', () => {
    const model = buildConversationsModel(input(people, {
      channels: [GERAL, { id: 'diretoria', name: 'diretoria', note: 'gestores', unread: 0 }],
      query: 'gestor',
    }))
    expect(model.channels.map(c => c.id)).toEqual(['diretoria'])
    expect(model.order).toEqual([{ kind: 'channel', id: 'diretoria' }])
  })

  it('sem resultado: noResults, lista vazia e ordem vazia', () => {
    const model = buildConversationsModel(input(people, { query: 'zzz' }))
    expect(model.noResults).toBe(true)
    expect(model.order).toEqual([])
  })

  it('busca vazia ou só espaços não é busca', () => {
    expect(buildConversationsModel(input(people, { query: '   ' })).people.mode).toBe('all')
  })
})

describe('Alt+↑/↓ (stepConversation)', () => {
  const order: ConversationTarget[] = [
    { kind: 'channel', id: 'geral' },
    { kind: 'dm', personaId: 'nina' },
    { kind: 'dm', personaId: 'luna' },
  ]

  it('anda para a próxima e para a anterior', () => {
    expect(stepConversation(order, order[0] ?? null, 1)).toEqual(order[1])
    expect(stepConversation(order, order[2] ?? null, -1)).toEqual(order[1])
  })

  it('nas pontas dá a volta', () => {
    expect(stepConversation(order, order[2] ?? null, 1)).toEqual(order[0])
    expect(stepConversation(order, order[0] ?? null, -1)).toEqual(order[2])
  })

  it('sem conversa aberta (ou fora da lista): ↓ vai para a primeira e ↑ para a última', () => {
    expect(stepConversation(order, null, 1)).toEqual(order[0])
    expect(stepConversation(order, null, -1)).toEqual(order[2])
    expect(stepConversation(order, { kind: 'dm', personaId: 'fora' }, 1)).toEqual(order[0])
  })

  it('lista vazia: nada', () => {
    expect(stepConversation([], null, 1)).toBeNull()
  })
})

describe('não lidas', () => {
  it('soma canais e pessoas, nos três modos', () => {
    const people = [person('nina', { unread: 2 }), person('luna', { unread: 1 })]
    const channels = [{ ...GERAL, unread: 4 }]
    expect(totalUnread(buildConversationsModel(input(people, { channels })))).toBe(7)
    // na busca só contam as linhas que aparecem (o #geral não casa com "nina")
    expect(totalUnread(buildConversationsModel(input(people, { channels, query: 'nina' })))).toBe(2)
    const crowd = [...many(9).map((p, i) => ({ ...p, unread: i === 0 ? 5 : 0 }))]
    expect(totalUnread(buildConversationsModel(input(crowd, { channels })))).toBe(9)
  })
})

describe('o que a pessoa abriu ou recolheu fica lembrado', () => {
  it('grava e lê de volta; toggleGroup não muta', () => {
    const start = {}
    const next = toggleGroup(start, teamGroupKey('eng'), true)
    expect(next).toEqual({ [teamGroupKey('eng')]: false })
    expect(start).toEqual({})
    writeCollapsedGroups(next)
    expect(readCollapsedGroups()).toEqual(next)
  })

  it('lixo, tipo errado e storage bloqueado: nunca lança e volta vazio', () => {
    localStorage.setItem(CONVERSATION_GROUPS_KEY, 'não é json')
    expect(readCollapsedGroups()).toEqual({})
    localStorage.setItem(CONVERSATION_GROUPS_KEY, JSON.stringify(['x']))
    expect(readCollapsedGroups()).toEqual({})
    localStorage.setItem(CONVERSATION_GROUPS_KEY, JSON.stringify({ a: true, b: 'sim', c: 1 }))
    expect(readCollapsedGroups()).toEqual({ a: true })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('bloqueado', 'SecurityError') })
    expect(readCollapsedGroups()).toEqual({})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('cheio', 'QuotaExceededError') })
    expect(() => { writeCollapsedGroups({ a: true }) }).not.toThrow()
  })
})
