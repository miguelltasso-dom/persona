// Era RED (Gauge → Keel, 12/11 03:10); consertado no Carbon P0-13 (Tally): agora é spec normal. Vale com a sessão ATRELADA (sessionMemberId): o autor é a sessão, a DM é dos participantes, canal inexistente é not-found.
import { expect } from 'vitest'
import { it, openJourney, seedJourney, seedProject } from './journeys/journey-host.ts'

/**
 * ACL DE ESCRITA em `postMessage` (medido 03:05 num projeto compartilhado, com um membro que NÃO é do DM):
 *   1. o Bob (membro, sessão 'bob') escreve na DM privada da Ana com a Bia e a Ana LÊ a mensagem dele lá;
 *   2. PERSONIFICAÇÃO: com a sessão 'bob', `postMessage({ actorId: 'ana' })` grava "mensagem forjada em nome da Ana" como se fosse dela;
 *   3. escrever num canal que não existe cria o stream em silêncio (`channel:canal-que-nao-existe`) em vez de 'not-found'.
 * Causa (index.ts, appendMessage): para DM só chama `assertCanAddress(participantA/B, actor)` (pode o ator ENDEREÇAR aquela persona?), nunca "o ator é participante?"; e grava `request.actorId`
 * como autor sem compará-lo com o ator da sessão. A LEITURA está certa (a página volta vazia): a asserção de `listMessages` abaixo é o controle.
 * Exposição: no app local de uma pessoa só é baixa; com time remoto (amigos conectando) é a promessa "nenhuma DM chega ao amigo" valendo só para leitura.
 */
const SP = { workspaceId: 'ws', projectId: 'sp' } as const

function rig() {
  const h = openJourney('2026-11-12T12:00:00.000Z')
  seedJourney(h, [])
  seedProject(h, { id: 'sp', name: 'Equipe', team: [{ id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true }, { id: 'bia', name: 'Bia', title: 'Redação' }] })
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.createMember({ id: 'bob', ...SP, displayName: 'Bob', handle: 'bob', role: 'member' })
  h.createDm({ id: 'dm-ab', ...SP, participantA: 'ana', participantB: 'bia' })
  return h
}
const dmLines = (h: ReturnType<typeof rig>, actor: string) => h.listMessages({ ...SP, streamKind: 'dm', ownerId: 'dm-ab', actorId: actor, afterSeq: 0, limit: 200 }).events

it('RED 1: um membro que NÃO é do DM não escreve nela', () => {
  const h = rig()
  h.sessionMemberId = 'bob'
  expect(dmLines(h, 'bob')).toEqual([]) // controle: ler já é recusado (página vazia)
  expect(() => h.postMessage({ id: 'x1', ...SP, streamKind: 'dm', ownerId: 'dm-ab', body: 'oi, sou o Bob, entrei na DM de vocês', actorId: 'bob', subjectId: 'x1' })).toThrow()
  h.sessionMemberId = 'ana'
  expect(dmLines(h, 'ana').map(row => row.body)).not.toContain('oi, sou o Bob, entrei na DM de vocês')
})

it('RED 2: a sessão do Bob não fala em nome da Ana (o autor vem da SESSÃO: pedido com outro actorId é recusado ou o autor é trocado pelo da sessão)', () => {
  const h = rig()
  h.sessionMemberId = 'bob'
  let refused = false
  try { h.postMessage({ id: 'x2', ...SP, streamKind: 'channel', ownerId: `geral:${SP.projectId}`, body: 'mensagem forjada em nome da Ana', actorId: 'ana', subjectId: 'x2' }) } catch { refused = true }
  const forged = h.listMessages({ ...SP, streamKind: 'channel', ownerId: `geral:${SP.projectId}`, actorId: 'ana', afterSeq: 0, limit: 200 }).events.filter(row => row.body === 'mensagem forjada em nome da Ana')
  expect(refused || forged.every(row => row.actorId !== 'ana')).toBe(true)
})

it('RED 3: escrever num canal que não existe é recusado (not-found), não cria o stream', () => {
  const h = rig()
  expect(() => h.postMessage({ id: 'x3', ...SP, streamKind: 'channel', ownerId: 'canal-que-nao-existe', body: 'oi', actorId: 'ana', subjectId: 'x3' })).toThrow()
})
