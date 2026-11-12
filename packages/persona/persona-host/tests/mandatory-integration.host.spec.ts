import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, geralChannelId, it, openJourney, say, sayOn, seedJourney, seedProject } from './journeys/journey-host.ts'

/**
 * SEÇÃO 11 da arquitetura ("Testes de integração obrigatórios"), versão que prova o PRODUTO (host real, SQLite em memória, sem mock de ACL).
 * Os 13 testes de `persona-core/tests/mandatory/` provam FUNÇÕES PURAS do core que o host não chama (`compileContext`, `purgeSource`, `peerCanRead`, `revokeGrant`: 0 usos em persona-host/src).
 * Modelo de acesso do host (auth.ts): dono = todos os projetos; MEMBRO = só projetos `kind === 'shared'` (o 'pp' do seedJourney é o PESSOAL do dono); CONVIDADO (guest) = nenhum.
 * Cobertos aqui: #13 exclusão de fonte, #6 obrigatório (lado verde; o RED está em mandatory-required-context.red.ts), #3+#4 DM e o que sai dela, #1 projeto pessoal, convidado.
 */
const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
]
const SP = { workspaceId: 'ws', projectId: 'sp' } as const
const b64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64')

function rigPersonal(): PersonaHost {
  const h = openJourney('2026-11-12T12:00:00.000Z')
  seedJourney(h, TEAM)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}
function rigShared(): PersonaHost {
  const h = openJourney('2026-11-12T12:00:00.000Z')
  seedJourney(h, [])
  seedProject(h, { id: 'sp', name: 'Equipe', team: TEAM })
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('sp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}
function script(h: PersonaHost, steps: ReadonlyArray<string | (() => string)>): void {
  const queue = [...steps]
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => { const next = queue.shift(); return typeof next === 'function' ? next() : next }, set: () => undefined })
}
async function settle(h: PersonaHost, project: 'pp' | 'sp'): Promise<void> { for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush(project) }
const usedOf = (h: PersonaHost, eventId: string, project: 'pp' | 'sp' = 'pp') => h.listUsedContext({ ...(project === 'pp' ? SCOPE : SP), eventId }).records
const as = (h: PersonaHost, member: string): void => { h.sessionMemberId = member }

/** Roda cada leitura e diz quais devolveram `marker` (recusar com erro ou página vazia = não vazou). */
function leaksOf(reads: Record<string, () => unknown>, marker: string): string[] {
  const leaks: string[] = []
  for (const [name, call] of Object.entries(reads)) {
    let result: unknown
    try { result = call() } catch { continue }
    if (JSON.stringify(result).includes(marker)) leaks.push(name)
  }
  return leaks
}

// ------------------------------------------------------------------------------------------------------------------------------------ #13

it('#13 exclusão de fonte e caches: apagar o documento do Cofre o tira da busca, da lista e do contexto usado dos turnos seguintes; trocar o arquivo esquece o texto antigo', async () => {
  const h = rigPersonal()
  const MARK = 'rosquinha-de-alecrim-9917'
  h.ingestVaultDocument({ ...SCOPE, id: 'doc1', name: 'cardapio.md', bytesBase64: b64(`# Cardápio\n\nA especialidade da casa é a ${MARK}, assada todo dia às 6h.`), visibility: 'workspace' })
  // controle: a fonte existe, é achada e ENTRA no contexto usado (senão o resto do teste não prova nada)
  expect(h.searchVaultDocuments({ ...SCOPE, query: 'especialidade' }).some(hit => hit.body.includes(MARK))).toBe(true)
  script(h, ['A especialidade da casa é a rosquinha de alecrim.'])
  say(h, 'q1', '@Bia qual é a especialidade da casa?')
  await settle(h, 'pp')
  expect(usedOf(h, 'q1').some(row => row.body.includes(MARK))).toBe(true)

  // 1. trocar o arquivo: o texto antigo some
  h.replaceVaultDocument({ ...SCOPE, documentId: 'doc1', name: 'cardapio.md', bytesBase64: b64('# Cardápio\n\nA especialidade da casa agora é o pão de queijo.') } as never)
  expect(h.searchVaultDocuments({ ...SCOPE, query: 'especialidade' }).some(hit => hit.body.includes(MARK))).toBe(false)

  // 2. apagar: some da busca, da lista e do contexto usado dos turnos SEGUINTES
  expect(h.deleteVaultDocument({ ...SCOPE, documentId: 'doc1' })).toBe(true)
  expect(h.searchVaultDocuments({ ...SCOPE, query: 'especialidade' })).toEqual([])
  expect(h.listVaultDocuments(SCOPE).map(row => row.id)).not.toContain('doc1')
  script(h, ['Não tenho essa informação.'])
  say(h, 'q2', '@Bia qual é a especialidade da casa?')
  await settle(h, 'pp')
  expect(usedOf(h, 'q2').some(row => row.body.includes(MARK) || row.body.includes('pão de queijo'))).toBe(false)
})

// -------------------------------------------------------------------------------------------------------------------------------------- #6

it('#6 obrigatório (lado verde): todas as regras OBRIGATÓRIAS (constraint/decision) ficam no contexto usado, mesmo quando juntas passam do orçamento de 2000 tokens — nenhuma some em silêncio da auditoria', async () => {
  const h = rigPersonal()
  const marks: string[] = []
  for (let i = 0; i < 8; i += 1) {
    const mark = `REGRA-OBRIGATORIA-${String(i)}`
    marks.push(mark)
    h.createVaultRecord({ ...SCOPE, id: `r${String(i)}`, kind: i % 2 === 0 ? 'constraint' : 'decision', body: `${mark}. ${'Texto de apoio da regra da casa, que precisa valer em todo turno. '.repeat(26)}`, authorId: 'ana' })
  }
  script(h, ['Ok, texto escrito seguindo as regras.'])
  say(h, 'q1', '@Bia escreva o texto da página inicial da padaria')
  await settle(h, 'pp')
  const used = usedOf(h, 'q1')
  expect(marks.filter(mark => !used.some(row => row.required && row.body.includes(mark)))).toEqual([])
})

// ------------------------------------------------------------------------------------------------------------------------------------ #3+#4

it('#3+#4 DM derivada (o que JÁ respeita): um MEMBRO que não é do DM da Ana com a Bia não lê a DM, nem a busca, a memória, o cérebro nem o contexto usado dela (o quadro e o contexto do turno vazam: RED em mandatory-dm-derived.red.ts)', async () => {
  const h = rigShared()
  const SECRET = 'segredo-da-ana-5521'
  h.createMember({ id: 'bob', ...SP, displayName: 'Bob', handle: 'bob', role: 'member' })
  h.createDm({ id: 'dm-ab', ...SP, participantA: 'ana', participantB: 'bia' })
  script(h, [`Anotado: guardei o ${SECRET}.`])
  h.postMessage({ id: 'd1', ...SP, streamKind: 'dm', ownerId: 'dm-ab', body: `Bia, escreva a lista do cliente e guarde o ${SECRET}`, actorId: 'ana', subjectId: 'd1' })
  await settle(h, 'sp')
  as(h, 'bob')
  const leaks = leaksOf({
    'listMessages(dm)': () => h.listMessages({ ...SP, streamKind: 'dm', ownerId: 'dm-ab', actorId: 'bob', afterSeq: 0, limit: 200 }),
    'search': () => h.search({ ...SP, actorId: 'bob', query: 'segredo', limit: 20 }),
    'listMemory': () => h.listMemory(SP),
    'getBrainHome': () => h.getBrainHome(SP),
    'listBrainPages': () => h.listBrainPages(SP),
    'listUsedContext(d1)': () => h.listUsedContext({ ...SP, eventId: 'd1' }),
  }, SECRET)
  expect(leaks.join(', '), 'Remotes que mostraram a DM (ou algo derivado dela) a quem não é do DM').toBe('')
})

// -------------------------------------------------------------------------------------------------------------------------------------- #1

it('#1 leitura entre projetos: um membro NÃO lê o projeto PESSOAL do dono (mensagens, busca, quadro, memória, Cofre, cérebro)', async () => {
  const h = rigPersonal()
  seedProject(h, { id: 'sp', name: 'Equipe' })
  h.createMember({ id: 'bob', ...SP, displayName: 'Bob', handle: 'bob', role: 'member' })
  const MARK = 'orcamento-interno-do-pessoal-7788'
  say(h, 'u1', `reunião sobre o ${MARK}`)
  h.createVaultRecord({ ...SCOPE, id: 'v1', kind: 'memory', body: `anotação privada: ${MARK}`, authorId: 'ana' })
  await settle(h, 'pp')
  as(h, 'bob')
  expect(leaksOf({
    'listMessages': () => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'bob', afterSeq: 0, limit: 200 }),
    'search': () => h.search({ ...SCOPE, actorId: 'bob', query: 'orcamento', limit: 20 }),
    'getProjectBoard': () => h.getProjectBoard(SCOPE),
    'listMemory': () => h.listMemory(SCOPE),
    'listVaultRecords': () => h.listVaultRecords(SCOPE),
    'listVaultDocuments': () => h.listVaultDocuments(SCOPE),
    'getBrainHome': () => h.getBrainHome(SCOPE),
  }, MARK)).toEqual([])
  // e ele consegue ESCREVER no pessoal do dono? (o gate de projeto recusa)
  expect(() => say(h, 'u2', 'oi, sou o Bob')).toThrow()
})

it('#3 amigo sem acesso: um CONVIDADO (guest) não lê nada, nem do projeto compartilhado', async () => {
  const h = rigShared()
  h.createMember({ id: 'fran', ...SP, displayName: 'Fran', handle: 'fran', role: 'guest' })
  sayOn(h, 'sp', 'u1', 'texto interno do projeto: reunião sobre o orçamento')
  await settle(h, 'sp')
  as(h, 'fran')
  expect(leaksOf({
    'listMessages': () => h.listMessages({ ...SP, streamKind: 'channel', ownerId: geralChannelId(h, 'sp'), actorId: 'fran', afterSeq: 0, limit: 200 }),
    'search': () => h.search({ ...SP, actorId: 'fran', query: 'orçamento', limit: 20 }),
    'getProjectBoard': () => h.getProjectBoard(SP),
    'listMemory': () => h.listMemory(SP),
    'listVaultDocuments': () => h.listVaultDocuments(SP),
    'getBrainHome': () => h.getBrainHome(SP),
  }, 'reunião sobre o orçamento')).toEqual([])
})
