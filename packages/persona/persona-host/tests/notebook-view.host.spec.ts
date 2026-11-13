/**
 * D-118 · O Caderno da persona (COLHEITA-MUSE 33c, Keel 12/11 16:35): o que UMA persona guarda para trabalhar do jeito do dono, lido do que o host realmente tem, com a regra de privacidade do Keel:
 * o que veio de uma DM é de quem estava nela e SÓ dessas pessoas. Quem não estava recebe um caderno IDÊNTICO ao de um mundo em que aquela DM nunca existiu (nenhum item, contagem, linha "tem coisa escondida", nome).
 * Quem estava lê o item com `private: { visibleTo: 'me' }`. O cliente nunca deduz o que é particular. Escrito VERMELHO primeiro (o arquivo `notebook-view.ts` não existia).
 */
import { describe, expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { personaNotebookOf, type NotebookReader, type NotebookSection, type NotebookSectionKey, type PersonaNotebookView } from '../src/notebook-view.ts'
import { captureOwnerMemory, type OwnerMemoryDeps } from '../src/owner-memory.ts'
import { geralChannelId, it, openJourney, seedJourney, seedProject } from './journeys/journey-host.ts'

const CLOCK = '2026-11-11T15:00:00.000Z'
/** A SHARED project: a plain member reads only those (the personal one is the owner's). */
const SCOPE = { workspaceId: 'ws', projectId: 'sh' }

const TEAM_FACT = 'Pessoal, lembrem: a padaria abre às 7h'
const TEAM_RULE = 'Regra da casa: sempre cumprimentar o cliente pelo nome'
const ANA_FACT = 'Lembra que a Ana Souza prefere pão sem sal'
const ANA_RULE = 'Regra da casa: nunca prometer entrega no domingo'
const CAIO_FACT = 'Lembra que o cliente Zé só paga no Pix'
const ANA_NOTE = 'Resposta ao cliente sobre a entrega'
const ANA_ADJUST = 'mais curto e sem gíria'
const CAIO_NOTE = 'Conta do fornecedor Zé'
const CAIO_ADJUST = 'sempre com o CNPJ no fim'
const CHANNEL_NOTE = 'Cartaz da promoção de pão de queijo'

/** What only Ana's DM holds. */
const ANA_ONLY = [ANA_FACT.replace('Lembra que ', ''), ANA_RULE.replace('Regra da casa: ', ''), ANA_NOTE, ANA_ADJUST, 'Ana Souza', 'domingo']

function seed(h: PersonaHost): OwnerMemoryDeps {
  seedJourney(h, []) // the workspace, Ana (owner) and the personal project
  seedProject(h, { id: 'sh', name: 'Padaria', team: [{ id: 'bento', name: 'Bento', title: 'Atendimento' }] })
  h.createMember({ id: 'caio', ...SCOPE, displayName: 'Caio', handle: 'caio', role: 'member' })
  h.createDm({ id: 'dm-ana', ...SCOPE, participantA: 'ana', participantB: 'bento' })
  h.createDm({ id: 'dm-caio', ...SCOPE, participantA: 'caio', participantB: 'bento' })
  return { vault: h.vault, screens: h.screens.screens, product: h.product }
}

function said(h: PersonaHost, id: string, body: string, where: { dm?: string; actorId: string }) {
  return h.events.append({
    id, ...SCOPE, streamKind: where.dm === undefined ? 'channel' : 'dm', ownerId: where.dm ?? geralChannelId(h, 'sh'),
    type: 'message', body, actorId: where.actorId, subjectId: `s-${id}`, occurredAt: CLOCK,
  })
}

function note(h: PersonaHost, id: string, title: string, dms: readonly string[], adjustments: readonly string[] = []): void {
  h.screens.screens.put('sh', 'playbook_note', id, {
    id, personaId: 'bento', title, request: `Faça: ${title}`, createdAt: CLOCK, uses: [{ ticketId: `t-${id}`, day: '2026-11-10', at: CLOCK }], adjustments, ...(dms.length === 0 ? {} : { dms }),
  })
}

/** The same team, with or without what Ana said and did in HER DM with Bento. Everything else (ids, days) is identical, so the two worlds can be compared word for word. */
function world(options: { anaDm: boolean }) {
  const h = openJourney() // one host per world: the two worlds are compared, so they cannot share a database
  const deps = seed(h)
  captureOwnerMemory(deps, said(h, 'tf', TEAM_FACT, { actorId: 'ana' }))
  captureOwnerMemory(deps, said(h, 'tr', TEAM_RULE, { actorId: 'ana' }))
  captureOwnerMemory(deps, said(h, 'dc', CAIO_FACT, { dm: 'dm-caio', actorId: 'caio' }))
  note(h, 'n-channel', CHANNEL_NOTE, [])
  note(h, 'n-caio', CAIO_NOTE, ['dm-caio'], [CAIO_ADJUST])
  if (options.anaDm) {
    captureOwnerMemory(deps, said(h, 'da', ANA_FACT, { dm: 'dm-ana', actorId: 'ana' }))
    captureOwnerMemory(deps, said(h, 'dr', ANA_RULE, { dm: 'dm-ana', actorId: 'ana' }))
    note(h, 'n-ana', ANA_NOTE, ['dm-ana'], [ANA_ADJUST])
  }
  return h
}

function readerOf(h: PersonaHost, memberId: string, canWrite = true): NotebookReader {
  const inDm = (dmId: string): boolean => {
    const dm = h.product.getDm(dmId)
    return dm !== undefined && memberId !== '' && [dm.participantA, dm.participantB].includes(memberId)
  }
  return { id: memberId, canWrite, inDm }
}

function notebook(h: PersonaHost, memberId: string, canWrite = true): PersonaNotebookView {
  const book = personaNotebookOf({ vault: h.vault, screens: h.screens, product: h.product }, { ...SCOPE, personaId: 'bento' }, readerOf(h, memberId, canWrite))
  expect(book, 'the persona is of this project').toBeDefined()
  return book!
}
const section = (book: PersonaNotebookView, key: NotebookSectionKey) => book.sections.find(row => row.key === key)!
const texts = (book: PersonaNotebookView, key: NotebookSectionKey): string[] => section(book, key).items.map(item => item.text)
const everything = (value: unknown): string => JSON.stringify(value)
/** The notebook with its items in a fixed order (the vault orders by the clock; two worlds are compared by CONTENT). */
const canon = (book: PersonaNotebookView): string => JSON.stringify({ ...book, sections: book.sections.map(part => ({ ...part, items: [...part.items].sort((left, right) => left.id.localeCompare(right.id)) })) })

describe('Caderno: as quatro seções, só com fonte real', () => {
  it('Ana (na própria DM): regras, fatos, o que sabe fazer e o que pediu para mudar, na ordem, cada item com a origem verdadeira', () => {
    const book = notebook(world({ anaDm: true }), 'ana')
    expect(book.sections.map(row => row.key)).toEqual(['sabe-fazer', 'como-gosta', 'aprendizados', 'erros'])
    expect(book).toMatchObject({ personaId: 'bento', personaName: 'Bento', ownerName: 'Ana', forgetIsReversible: false })
    expect(texts(book, 'como-gosta').join('|')).toContain('Sempre cumprimentar o cliente pelo nome') // a rule the owner said to the team
    expect(texts(book, 'como-gosta').join('|')).toContain('Nunca prometer entrega no domingo') // a rule the owner said to HER in the DM
    expect(texts(book, 'aprendizados').join('|')).toContain('A padaria abre às 7h')
    expect(texts(book, 'aprendizados').join('|')).toContain('Ana Souza prefere pão sem sal')
    expect(texts(book, 'sabe-fazer')).toEqual(expect.arrayContaining([CHANNEL_NOTE, ANA_NOTE]))
    expect(texts(book, 'erros')).toEqual([ANA_ADJUST])
    expect(section(book, 'aprendizados').items[0]?.origin).toMatchObject({ kind: 'asked-remember', at: CLOCK })
    // who asked: the reader's own request reads "você pediu", a colleague's reads by name (the screen never guesses it)
    expect(section(book, 'aprendizados').items.find(item => item.text.includes('Ana Souza'))?.origin).toMatchObject({ by: 'Ana', mine: true })
    expect(section(notebook(world({ anaDm: true }), 'caio'), 'aprendizados').items.find(item => item.text.includes('A padaria abre'))?.origin).toMatchObject({ by: 'Ana', mine: false })
    expect(section(book, 'erros').items[0]?.origin).toEqual({ kind: 'asked-change', about: ANA_NOTE }) // the playbook keeps no day for an adjustment: none is invented
    expect(section(book, 'sabe-fazer').items.find(item => item.text === ANA_NOTE)?.origin).toMatchObject({ kind: 'task', at: CLOCK })
  })

  it('a persona que não é do projeto não tem caderno; o texto de quem não pediu para lembrar (um registro sem prova) não entra', () => {
    const h = world({ anaDm: true })
    h.vault.createRecord({ id: 'imported', workspaceId: 'ws', projectId: 'sh', kind: 'memory', body: 'Importado de uma pasta qualquer.', authorId: 'ana', visibility: { kind: 'workspace' } })
    expect(personaNotebookOf({ vault: h.vault, screens: h.screens, product: h.product }, { ...SCOPE, personaId: 'ninguem' }, readerOf(h, 'ana'))).toBeUndefined()
    expect(everything(notebook(h, 'ana'))).not.toContain('Importado de uma pasta')
  })

  it('o que foi esquecido (revogado) sai do caderno', () => {
    const h = world({ anaDm: true })
    const before = section(notebook(h, 'ana'), 'aprendizados').items.find(item => item.text.includes('A padaria abre'))!
    h.vault.revokeRecord(before.id)
    expect(texts(notebook(h, 'ana'), 'aprendizados').join('|')).not.toContain('A padaria abre')
  })

  it('o nome do dono só quando há UM dono (com dois não há um nome a dizer)', () => {
    const h = world({ anaDm: true })
    expect(notebook(h, 'ana').ownerName).toBe('Ana')
    h.createMember({ id: 'gus', ...SCOPE, displayName: 'Gus', handle: 'gus', role: 'owner' })
    expect(notebook(h, 'ana').ownerName).toBeUndefined()
  })
})

describe('Caderno: o que veio de uma DM é de quem estava nela, e só dela', () => {
  it('quem estava na DM lê o item com private: { visibleTo: me }; o do time e o do canal não são particulares', () => {
    const book = notebook(world({ anaDm: true }), 'ana')
    const item = (key: NotebookSectionKey, part: string) => section(book, key).items.find(row => row.text.includes(part))!
    expect(item('aprendizados', 'Ana Souza').private).toEqual({ visibleTo: 'me' })
    expect(item('como-gosta', 'domingo').private).toEqual({ visibleTo: 'me' })
    expect(item('sabe-fazer', ANA_NOTE).private).toEqual({ visibleTo: 'me' })
    expect(item('aprendizados', 'A padaria abre').private).toBeUndefined()
    expect(item('sabe-fazer', CHANNEL_NOTE).private).toBeUndefined()
    // a section is private only when ALL that the reader sees in it is private
    expect(section(book, 'erros').private).toEqual({ visibleTo: 'me' }) // the only adjustment came from her DM
    expect(section(book, 'aprendizados').private).toBeUndefined() // the team's fact is in it too
  })

  it('quem NÃO estava recebe um caderno IDÊNTICO ao de um mundo em que aquela DM nunca existiu (nada de item, linha, contagem ou nome)', () => {
    const withDm = notebook(world({ anaDm: true }), 'caio')
    const withoutDm = notebook(world({ anaDm: false }), 'caio')
    expect(canon(withDm)).toBe(canon(withoutDm))
    for (const word of ANA_ONLY) expect(everything(withDm), `Caio não lê "${word}"`).not.toContain(word)
    // and he still reads what is his: the team's, the channel's and his own DM
    expect(texts(withDm, 'aprendizados').join('|')).toContain('Zé só paga no Pix')
    expect(section(withDm, 'aprendizados').items.find(row => row.text.includes('Zé'))?.private).toEqual({ visibleTo: 'me' })
    expect(texts(withDm, 'sabe-fazer')).toEqual(expect.arrayContaining([CHANNEL_NOTE, CAIO_NOTE]))
    expect(texts(withDm, 'erros')).toEqual([CAIO_ADJUST])
  })

  it('o dono do espaço que não estava na DM do outro também não lê (a regra é de QUEM ESTAVA, não do papel)', () => {
    const h = world({ anaDm: true })
    h.createMember({ id: 'gus', ...SCOPE, displayName: 'Gus', handle: 'gus', role: 'owner' })
    const forGus = notebook(h, 'gus')
    for (const word of [...ANA_ONLY, 'Zé só paga', CAIO_NOTE, CAIO_ADJUST]) expect(everything(forGus), `Gus não lê "${word}"`).not.toContain(word)
    expect(texts(forGus, 'aprendizados').join('|')).toContain('A padaria abre') // the team's is still his
  })

  it('um leitor que o host não conhece (sem id) não lê nada de DM: falha fechado', () => {
    const book = notebook(world({ anaDm: true }), '', false)
    for (const word of [...ANA_ONLY, 'Zé só paga', CAIO_NOTE, CAIO_ADJUST]) expect(everything(book)).not.toContain(word)
    expect(everything(book)).not.toContain('"private"')
  })
})

describe('Caderno: o que virou skill', () => {
  it('uma nota cuja oferta o dono aceitou leva becameSkill; antes de aceitar não leva', () => {
    const h = world({ anaDm: false })
    const uses = ['2026-11-09', '2026-11-10', '2026-11-11'].map((day, index) => ({ ticketId: `t-s${String(index)}`, day, at: CLOCK }))
    h.screens.screens.put('sh', 'playbook_note', 'n-skill', {
      id: 'n-skill', personaId: 'bento', title: 'Foto de produto com fundo claro', request: 'Foto do pão.', createdAt: CLOCK, uses, adjustments: [],
      offered: { skillId: 'learned-n-skill', approvalId: 'skill-offer-n-skill', at: CLOCK }, offers: 1,
    })
    h.screens.putCandidateSkill({ projectId: 'sh', personaId: 'bento', id: 'learned-n-skill', name: 'Foto de produto com fundo claro', body: 'Foto do pão.', origin: 'learned' })
    h.screens.proposeSkill({ ...SCOPE, id: 'skill-offer-n-skill', skillId: 'learned-n-skill', title: 'Bento aprendeu: Foto de produto com fundo claro', creatorPersonaId: 'bento', question: 'Usado 3 vezes em 3 dias.' })
    const known = (): NotebookSection['items'][number] | undefined => section(notebook(h, 'ana'), 'sabe-fazer').items.find(row => row.text === 'Foto de produto com fundo claro')
    expect(known()).toBeDefined()
    expect(known()?.becameSkill).toBeUndefined()
    h.sessionMemberId = 'ana'
    h.decideApproval({ ...SCOPE, id: 'skill-offer-n-skill', kind: 'skill', accept: true })
    expect(known()?.becameSkill).toBe(true)
  })
})

describe('Caderno: Corrigir e Apagar só onde a ACL deixa', () => {
  it('quem escreve pode corrigir e apagar uma lembrança e apagar o jeito de trabalhar (a nota); o ajuste não tem botão nenhum; quem só lê não tem botão', () => {
    const h = world({ anaDm: true })
    const writer = notebook(h, 'ana', true)
    const memory = section(writer, 'aprendizados').items[0]!
    expect(memory).toMatchObject({ target: 'memory', can: { edit: true, forget: true } })
    expect(section(writer, 'sabe-fazer').items.find(row => row.text === ANA_NOTE)).toMatchObject({ target: 'playbook', can: { edit: false, forget: true } })
    expect(section(writer, 'erros').items[0]).toMatchObject({ target: 'adjustment', can: { edit: false, forget: false } })
    const reader = notebook(h, 'ana', false)
    for (const row of reader.sections.flatMap(part => part.items)) expect(row.can, `${row.text}`).toEqual({ edit: false, forget: false })
  })
})

describe('Caderno: pelo Remote (a sessão decide quem lê, nunca o pedido)', () => {
  it('getPersonaNotebook: o leitor é a sessão; quem não estava na DM da Ana recebe o caderno de um mundo sem aquela DM; persona de fora do projeto é "não encontrada"', () => {
    const withDm = world({ anaDm: true })
    const withoutDm = world({ anaDm: false })
    withDm.sessionMemberId = 'caio'
    withoutDm.sessionMemberId = 'caio'
    const asked = { ...SCOPE, personaId: 'bento' }
    expect(canon(withDm.getPersonaNotebook(asked))).toBe(canon(withoutDm.getPersonaNotebook(asked)))
    expect(JSON.stringify(withDm.getPersonaNotebook(asked))).not.toContain('Ana Souza')
    withDm.sessionMemberId = 'ana'
    expect(JSON.stringify(withDm.getPersonaNotebook(asked))).toContain('Ana Souza prefere pão sem sal')
    expect(() => withDm.getPersonaNotebook({ ...SCOPE, personaId: 'ninguem' })).toThrow('persona-not-found')
  })
})
