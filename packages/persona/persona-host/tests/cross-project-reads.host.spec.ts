import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, geralChannelId, it, openJourney, say, sayOn, seedJourney, seedProject } from './journeys/journey-host.ts'

/**
 * VERIFICAÇÃO INDEPENDENTE do vazamento entre projetos (Gauge, a pedido do Keel 12/11 10:55; R2-01..05 do Lumen): como a matriz de ACL (`remote-acl-matrix`), mas por PROJETO e por DADO.
 * Modelo do host (auth.ts): dono = todos os projetos; MEMBRO = só os projetos `shared` (o pessoal 'pp' do dono não); CONVIDADO = nenhum; uma DM é só dos dois participantes.
 * O ataque que a matriz por papel não vê (IDOR): o membro tem acesso a 'sa' e manda `projectId: 'sa'` MAS com os ids (stream, DM, tarefa, evento, assunto, documento) de OUTRO lugar: do projeto
 * pessoal do dono, ou de uma DM alheia DENTRO do mesmo projeto. Cada dado ali tem uma MARCA única; cada Remote de leitura e cada stream roda com os 3 papéis e a resposta é varrida pela marca.
 * Vermelho = vazou (achado real para o dono do Remote); verde = prova. Controles positivos: o dono e o membro leem o que é deles (senão "não achei" não prova nada).
 */
const PP = SCOPE // o projeto PESSOAL do dono
const SA = { workspaceId: 'ws', projectId: 'sa' } as const // o projeto COMPARTILHADO
const b64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64')

const MARK = {
  channelPp: 'MARCA-CANAL-PP-7101',
  dmPp: 'MARCA-DM-PP-7102',
  taskPp: 'MARCA-TAREFA-PP-7103',
  memoryPp: 'MARCA-MEMORIA-PP-7104',
  docPp: 'MARCA-DOC-PP-7105',
  dmSa: 'MARCA-DM-ALHEIA-SA-7106',
  channelSa: 'MARCA-CANAL-SA-7107',
} as const
const FOREIGN_FOR_MEMBER = [MARK.channelPp, MARK.dmPp, MARK.taskPp, MARK.memoryPp, MARK.docPp, MARK.dmSa] as const // o que o Bob NUNCA pode ver
const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
]

function script(h: PersonaHost, steps: readonly string[]): void {
  const queue = [...steps]
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => queue.shift() ?? 'Ok.', set: () => undefined })
}
async function settle(h: PersonaHost): Promise<void> { for (let pass = 0; pass < 10; pass += 1) { await h.orchestration.flush('pp'); await h.orchestration.flush('sa') } }

interface Planted { readonly h: PersonaHost; readonly dmPpId: string; readonly dmSaId: string; readonly ticketPpId: string; readonly eventIds: Record<string, string> }

/** O mundo: 'pp' (pessoal da Ana: canal, DM com a Bia, tarefa, memória, documento) e 'sa' (compartilhado: canal, e uma DM da Ana com a Lia da qual o Bob NÃO faz parte). */
async function plant(): Promise<Planted> {
  const h = openJourney('2026-11-12T12:00:00.000Z')
  seedJourney(h, TEAM)
  seedProject(h, { id: 'sa', name: 'Equipe', team: [{ id: 'lia2', name: 'Lia', title: 'Coordenação', coordination: true }] })
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  h.createMember({ id: 'bob', ...SA, displayName: 'Bob', handle: 'bob', role: 'member' })
  h.createMember({ id: 'gus', ...SA, displayName: 'Gus', handle: 'gus', role: 'guest' })
  script(h, ['Anotado.', 'Pronto.', 'Feito.', 'Ok.'])
  say(h, 'ch1', `texto no canal pessoal: ${MARK.channelPp}`)
  h.createDm({ id: 'dm-pp', ...PP, participantA: 'ana', participantB: 'bia' })
  h.postMessage({ id: 'dmp1', ...PP, streamKind: 'dm', ownerId: 'dm-pp', body: `Bia, anote: ${MARK.dmPp}`, actorId: 'ana', subjectId: 'dmp1' })
  say(h, 'tk1', `@Bia escreva o texto ${MARK.taskPp} da home`)
  h.createVaultRecord({ ...PP, id: 'mem1', kind: 'memory', body: `memória pessoal ${MARK.memoryPp}`, authorId: 'ana' })
  h.ingestVaultDocument({ ...PP, id: 'doc1', name: 'cardapio-pessoal.md', bytesBase64: b64(`# Cardápio\n\nespecialidade pessoal da casa ${MARK.docPp}`), visibility: 'workspace' })
  h.createDm({ id: 'dm-sa', ...SA, participantA: 'ana', participantB: 'lia2' })
  h.postMessage({ id: 'dms1', ...SA, streamKind: 'dm', ownerId: 'dm-sa', body: `Lia, combinado só nosso: ${MARK.dmSa}`, actorId: 'ana', subjectId: 'dms1' })
  sayOn(h, 'sa', 'chs1', `aviso do projeto compartilhado ${MARK.channelSa}`)
  await settle(h)
  const board = h.getProjectBoard(PP)
  const ticketPpId = board.cards.find(card => card.title.includes('MARCA-TAREFA-PP-7103') || card.title.toLowerCase().includes('texto'))?.ticketId ?? board.cards[0]?.ticketId ?? ''
  return { h, dmPpId: 'dm-pp', dmSaId: 'dm-sa', ticketPpId, eventIds: { ch1: 'ch1', dmp1: 'dmp1', tk1: 'tk1', dms1: 'dms1' } }
}

/** Remotes de LEITURA: pelo nome (o que lê, procura, segue ou exporta). Nada que escreve, dispara trabalho ou mexe na máquina. */
const READ = /^(list|get|search|follow|preview)[A-Z]|^(search|browserView|stationView|exportProject|exportWorkspace|attentionEvents|cofreStatus)$/u
const SKIP = /^(getOnboarding|getEngineStatus|getProviderLimitPool|getOfficialQuota|getWindowReserve|getUsagePanel|getAccount|getTeamAi|getTeamConnect|getRuleKinds|getConnectorHealth|getConnectorCatalog|listEmailPresets|previewImport|previewCofreImport|previewCliSkills|previewSkillImport|previewInvite|getStoreHealth|listBackups|getEmailConnection)/u

function readRemotes(h: PersonaHost): Array<{ readonly name: string; readonly stream: boolean }> {
  return remoteMethods(h).filter(item => READ.test(item.method) && !SKIP.test(item.method)).map(item => ({ name: item.method, stream: (item as { mode?: string }).mode === 'stream' }))
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** Chama um Remote como `actor` e devolve o texto da resposta (JSON) ou 'refused'/'error'. Um stream é lido por um instante. */
async function readAs(h: PersonaHost, actor: string, remote: { name: string; stream: boolean }, request: Record<string, unknown>): Promise<string> {
  h.sessionMemberId = actor
  const method = (h as unknown as Record<string, ((request: unknown, signal?: AbortSignal) => unknown) | undefined>)[remote.name]
  if (typeof method !== 'function') return 'missing'
  try {
    if (remote.stream) {
      const abort = new AbortController()
      const frames: string[] = []
      const stream = (method.call(h, request, abort.signal) as AsyncIterable<unknown>)
      const reading = (async () => { try { for await (const frame of stream) frames.push(JSON.stringify(frame)) } catch { /* recusado ou encerrado */ } })()
      await Promise.race([reading, sleep(150)])
      abort.abort()
      await Promise.race([reading, sleep(100)])
      return frames.join('\n')
    }
    const called = method.call(h, request, new AbortController().signal)
    const value = called !== null && typeof called === 'object' && 'then' in called ? await Promise.race([called as Promise<unknown>, sleep(400).then(() => undefined)]) : called
    return value === undefined ? '' : JSON.stringify(value) ?? ''
  } catch {
    return 'refused'
  }
}

interface Foreign { readonly name: string; readonly request: Record<string, unknown> }

/** Os ids de DADOS ALHEIOS, postos num pedido que carrega o `projectId` do projeto que o ator PODE ler. */
function foreignTargets(world: Planted, scope: { workspaceId: string; projectId: string }, actor: string): Foreign[] {
  const base = { ...scope, actorId: actor, afterSeq: 0, limit: 200, query: 'MARCA', text: 'MARCA' }
  return [
    { name: 'canal pessoal', request: { ...base, streamKind: 'channel', ownerId: 'geral', eventId: 'ch1', messageId: 'ch1', subjectId: 'ch1', topicId: 'ch1', channelId: 'geral' } },
    { name: 'DM pessoal', request: { ...base, streamKind: 'dm', ownerId: world.dmPpId, dmId: world.dmPpId, eventId: 'dmp1', messageId: 'dmp1', subjectId: 'dmp1', topicId: 'dmp1' } },
    { name: 'tarefa pessoal', request: { ...base, streamKind: 'channel', ownerId: 'geral', ticketId: world.ticketPpId, eventId: 'tk1', subjectId: 'tk1', topicId: `ticket:${world.ticketPpId}` } },
    { name: 'memória/documento pessoal', request: { ...base, id: 'mem1', documentId: 'doc1', recordId: 'mem1', personaId: 'bia' } },
    { name: 'DM alheia no MESMO projeto', request: { ...base, streamKind: 'dm', ownerId: world.dmSaId, dmId: world.dmSaId, eventId: 'dms1', messageId: 'dms1', subjectId: 'dms1', topicId: 'dms1' } },
  ]
}

it('CONTROLES POSITIVOS: o dono lê tudo o que é dele, o membro lê o canal do projeto compartilhado (senão "não achei nada" não prova nada)', async () => {
  const world = await plant()
  const { h } = world
  h.sessionMemberId = 'ana'
  expect(JSON.stringify(h.listMessages({ ...PP, streamKind: 'channel', ownerId: geralChannelId(h, 'pp'), actorId: 'ana', afterSeq: 0, limit: 200 })), 'canal pessoal').toContain(MARK.channelPp)
  expect(JSON.stringify(h.listMessages({ ...PP, streamKind: 'dm', ownerId: 'dm-pp', actorId: 'ana', afterSeq: 0, limit: 200 })), 'DM pessoal').toContain(MARK.dmPp)
  expect(JSON.stringify(h.getProjectBoard(PP)), 'tarefa pessoal no quadro').toContain('texto')
  expect(JSON.stringify(h.searchVaultDocuments({ ...PP, query: 'especialidade' })), 'documento pessoal').toContain(MARK.docPp)
  expect(JSON.stringify(h.listMessages({ ...SA, streamKind: 'dm', ownerId: 'dm-sa', actorId: 'ana', afterSeq: 0, limit: 200 })), 'a DM do projeto compartilhado, para a Ana').toContain(MARK.dmSa)
  h.sessionMemberId = 'bob'
  expect(JSON.stringify(h.listMessages({ ...SA, streamKind: 'channel', ownerId: geralChannelId(h, 'sa'), actorId: 'bob', afterSeq: 0, limit: 200 })), 'o Bob lê o canal do compartilhado').toContain(MARK.channelSa)
})

it('MEMBRO (Bob), projeto que ele PODE ler (sa), ids de DADOS ALHEIOS: nenhum Remote de leitura nem stream devolve a marca de um dado que não é dele', async () => {
  const world = await plant()
  const { h } = world
  const remotes = readRemotes(h)
  expect(remotes.length, 'a lista de Remotes de leitura existe').toBeGreaterThan(40)
  const leaks: string[] = []
  for (const target of foreignTargets(world, SA, 'bob')) {
    for (const remote of remotes) {
      const text = await readAs(h, 'bob', remote, target.request)
      const hit = FOREIGN_FOR_MEMBER.find(marker => text.includes(marker))
      if (hit !== undefined) leaks.push(`${remote.name} [${target.name}] devolveu ${hit}`)
    }
  }
  expect(leaks, 'Remotes que mostraram ao membro o que não é dele').toEqual([])
}, 240_000)

it('MEMBRO (Bob), o projeto PESSOAL do dono (pp) como escopo: recusado ou vazio em todos os Remotes de leitura (nenhuma marca do pp)', async () => {
  const world = await plant()
  const { h } = world
  const leaks: string[] = []
  for (const target of foreignTargets(world, PP, 'bob')) {
    for (const remote of readRemotes(h)) {
      const text = await readAs(h, 'bob', remote, target.request)
      const hit = FOREIGN_FOR_MEMBER.find(marker => text.includes(marker))
      if (hit !== undefined) leaks.push(`${remote.name} [${target.name}] devolveu ${hit}`)
    }
  }
  expect(leaks).toEqual([])
}, 240_000)

it('CONVIDADO (Gus): nenhum Remote de leitura devolve NENHUMA marca, nem do compartilhado, em nenhum escopo', async () => {
  const world = await plant()
  const { h } = world
  const everything = Object.values(MARK)
  const leaks: string[] = []
  for (const scope of [SA, PP]) {
    for (const target of foreignTargets(world, scope, 'gus')) {
      for (const remote of readRemotes(h)) {
        const text = await readAs(h, 'gus', remote, target.request)
        const hit = everything.find(marker => text.includes(marker))
        if (hit !== undefined) leaks.push(`${remote.name} [${scope.projectId}/${target.name}] devolveu ${hit}`)
      }
    }
  }
  expect(leaks).toEqual([])
}, 240_000)
